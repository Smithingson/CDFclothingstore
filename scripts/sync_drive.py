"""Pull creator-uploaded layer PNGs from the shared Google Drive folder into the site build.

Drive layout:  <root>/<Branch>/Shirt|Pants/<section folder>/<Item name>.png
Output:        <site>/uploads/<branch>/<garment>/<n>.png (cropped) and <site>/uploads.json

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
BRANCHES = {"ingeld": "Ingeld", "city watch": "City Watch", "dasmant": "Dasmant", "jequis": "Jequis"}
SLUG = lambda b: b.lower().replace(" ", "-")
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
    """Yield (branch, garment, section, file name, size, loader) for every candidate file."""
    for b in list_children(session, root_id):
        branch = BRANCHES.get(b["name"].strip().lower())
        if b["mimeType"] != FOLDER or not branch:
            skipped.append((b["name"], "only Ingeld, City Watch, Dasmant and Jequis folders are used here"))
            continue
        for g in list_children(session, b["id"]):
            garment = GARMENTS.get(g["name"].strip().lower())
            if g["mimeType"] != FOLDER or not garment:
                skipped.append((f'{b["name"]}/{g["name"]}', "only Shirt and Pants folders are used here"))
                continue
            for sec in list_children(session, g["id"]):
                where = f'{b["name"]}/{g["name"]}/{sec["name"]}'
                if sec["mimeType"] != FOLDER:
                    skipped.append((where, "put files inside a section folder"))
                    continue
                files = sorted(list_children(session, sec["id"]), key=lambda f: f.get("createdTime", ""))
                for f in files:
                    if f["mimeType"] == FOLDER:
                        skipped.append((f'{where}/{f["name"]}', "folders inside sections are ignored"))
                        continue
                    url = f'{API}/{f["id"]}?alt=media&supportsAllDrives=true'

                    def load(url=url):
                        r = session.get(url)
                        r.raise_for_status()
                        return r.content

                    yield branch, garment, sec["name"].strip(), f["name"], int(f.get("size") or 0), load


def build(entries, site, skipped):
    """Validate, crop and write uploads; returns the uploads.json structure."""
    result = {}
    seen, counters, sections = set(), {}, {}
    for branch, garment, section, fname, size, load in entries:
        where = f"{branch}/{garment.title()}/{section}/{fname}"
        if not fname.lower().endswith(".png"):
            skipped.append((where, "not a .png file")); continue
        name = fname[:-4].strip()
        key = (branch, garment, section.lower(), name.lower())
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
        n = counters.get((branch, garment), 0); counters[(branch, garment)] = n + 1
        rel = f"uploads/{SLUG(branch)}/{garment}/{n}.png"
        os.makedirs(os.path.join(site, "uploads", SLUG(branch), garment), exist_ok=True)
        im.crop((x0, y0, x1, y1)).save(os.path.join(site, rel), optimize=True)
        sec = sections.get((branch, garment, section.lower()))
        if sec is None:
            sec = sections[(branch, garment, section.lower())] = {"section": section, "items": []}
            result.setdefault(branch, {g: [] for g in GARMENTS.values()})[garment].append(sec)
        sec["items"].append({"name": name, "src": rel, "x": x0, "y": y0})
    for gs in result.values():
        for secs in gs.values():
            secs.sort(key=lambda s: s["section"].lower())
            for s in secs:
                s["items"].sort(key=lambda i: i["name"].lower())
    return result


def main():
    site = sys.argv[1]
    skipped, uploads = [], {}
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

    added = sum(len(s["items"]) for gs in uploads.values() for secs in gs.values() for s in secs)
    lines = [f"## Creator uploads: {added} added, {len(skipped)} skipped", ""]
    for br, gs in uploads.items():
        n = sum(len(s["items"]) for secs in gs.values() for s in secs)
        lines.append(f"- **{br}**: {n} items")
    lines.append("")
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
