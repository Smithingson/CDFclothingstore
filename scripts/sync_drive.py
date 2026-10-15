"""Pull creator-uploaded layer PNGs from the shared Google Drive folder into the site build.

Drive layout:  <root>/Shirt|Pants/<section folder>/<Item name>.png
Output:        <site>/uploads/<garment>/<n>.png (cropped) and <site>/uploads.json

Usage: python scripts/sync_drive.py <site dir>
Env:   GDRIVE_SA_KEY   service-account JSON key (if missing, no uploads are added)
       DRIVE_FOLDER_ID id of the "Larovan Uniform Generator Uploads" folder
"""
import io
import json
import os
import sys

from PIL import Image

W, H = 585, 559
MAX_BYTES = 5 * 1024 * 1024
GARMENTS = {"shirt": "shirt", "pants": "pants"}
API = "https://www.googleapis.com/drive/v3/files"
FOLDER = "application/vnd.google-apps.folder"


def list_children(session, parent_id):
    out, token = [], None
    while True:
        params = {
            "q": f"'{parent_id}' in parents and trashed = false",
            "fields": "nextPageToken, files(id, name, mimeType, size, createdTime)",
            "pageSize": 1000,
            "supportsAllDrives": "true",
            "includeItemsFromAllDrives": "true",
        }
        if token:
            params["pageToken"] = token
        r = session.get(API, params=params)
        r.raise_for_status()
        data = r.json()
        out += data.get("files", [])
        token = data.get("nextPageToken")
        if not token:
            return out


def fetch_entries(session, root_id, skipped):
    """Yield (garment, section, file name, size, loader) for every candidate file."""
    for g in list_children(session, root_id):
        garment = GARMENTS.get(g["name"].strip().lower())
        if g["mimeType"] != FOLDER or not garment:
            skipped.append((g["name"], "only Shirt and Pants folders are used here"))
            continue
        for sec in list_children(session, g["id"]):
            if sec["mimeType"] != FOLDER:
                skipped.append((f'{g["name"]}/{sec["name"]}', "put files inside a section folder"))
                continue
            files = sorted(list_children(session, sec["id"]), key=lambda f: f.get("createdTime", ""))
            for f in files:
                if f["mimeType"] == FOLDER:
                    skipped.append((f'{g["name"]}/{sec["name"]}/{f["name"]}', "folders inside sections are ignored"))
                    continue
                url = f'{API}/{f["id"]}?alt=media&supportsAllDrives=true'

                def load(url=url):
                    r = session.get(url)
                    r.raise_for_status()
                    return r.content

                yield garment, sec["name"].strip(), f["name"], int(f.get("size") or 0), load


def build(entries, site, skipped):
    """Validate, crop and write uploads; returns the uploads.json structure."""
    result = {g: [] for g in GARMENTS.values()}
    seen, counters, sections = set(), {g: 0 for g in GARMENTS.values()}, {}
    for garment, section, fname, size, load in entries:
        where = f"{garment.title()}/{section}/{fname}"
        if not fname.lower().endswith(".png"):
            skipped.append((where, "not a .png file")); continue
        name = fname[:-4].strip()
        key = (garment, section.lower(), name.lower())
        if key in seen:
            skipped.append((where, "another file in this section already has that name")); continue
        if size > MAX_BYTES:
            skipped.append((where, "larger than 5 MB")); continue
        try:
            im = Image.open(io.BytesIO(load()))
            if im.format != "PNG":
                skipped.append((where, "not a real PNG image")); continue
            if im.size != (W, H):
                skipped.append((where, f"is {im.size[0]}x{im.size[1]}, must be {W}x{H}")); continue
            im = im.convert("RGBA")
        except Exception as e:  # unreadable or corrupt file
            skipped.append((where, f"could not be read ({type(e).__name__})")); continue
        alpha = im.getchannel("A")
        lo, hi = alpha.getextrema()
        if hi == 0:
            skipped.append((where, "is completely transparent")); continue
        if lo != 0:
            skipped.append((where, "has no transparent areas (it would cover the whole template)")); continue
        seen.add(key)
        x0, y0, x1, y1 = alpha.getbbox()
        n = counters[garment]; counters[garment] += 1
        rel = f"uploads/{garment}/{n}.png"
        os.makedirs(os.path.join(site, "uploads", garment), exist_ok=True)
        im.crop((x0, y0, x1, y1)).save(os.path.join(site, rel), optimize=True)
        sec = sections.get((garment, section.lower()))
        if sec is None:
            sec = sections[(garment, section.lower())] = {"section": section, "items": []}
            result[garment].append(sec)
        sec["items"].append({"name": name, "src": rel, "x": x0, "y": y0})
    for g in result:
        result[g].sort(key=lambda s: s["section"].lower())
        for s in result[g]:
            s["items"].sort(key=lambda i: i["name"].lower())
    return result


def main():
    site = sys.argv[1]
    skipped, uploads = [], {g: [] for g in GARMENTS.values()}
    key = os.environ.get("GDRIVE_SA_KEY", "").strip()
    root = os.environ.get("DRIVE_FOLDER_ID", "").strip()
    if not key or not root:
        print("::warning::GDRIVE_SA_KEY secret or DRIVE_FOLDER_ID not set; deploying without creator uploads.")
    else:
        from google.auth.transport.requests import AuthorizedSession
        from google.oauth2 import service_account

        creds = service_account.Credentials.from_service_account_info(
            json.loads(key), scopes=["https://www.googleapis.com/auth/drive.readonly"])
        uploads = build(fetch_entries(AuthorizedSession(creds), root, skipped), site, skipped)

    with open(os.path.join(site, "uploads.json"), "w", encoding="utf-8") as fh:
        json.dump(uploads, fh, ensure_ascii=False, separators=(",", ":"))

    added = sum(len(s["items"]) for g in uploads.values() for s in g)
    lines = [f"## Creator uploads: {added} added, {len(skipped)} skipped", ""]
    for g, secs in uploads.items():
        for s in secs:
            for i in s["items"]:
                lines.append(f"- Added **{g.title()} / {s['section']} / {i['name']}**")
    for where, why in skipped:
        lines.append(f"- Skipped `{where}`: {why}")
    report = "\n".join(lines)
    print(report)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(report + "\n")
    # Every item, originals included, comes from Drive, so an empty result means the
    # key or folder sharing is broken. Fail so the last good deploy stays live.
    if added == 0:
        print("::error::No items came back from Google Drive. Check the GDRIVE_SA_KEY secret and that the folder is shared with the service account.")
        sys.exit(1)


if __name__ == "__main__":
    main()
