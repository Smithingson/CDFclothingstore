"""Compare two regression runs (see tests/regression.mjs): page state, file names and the pixels of every PNG,
including each PNG inside the layer ZIPs. Exit code 1 when anything differs.

    python3 tests/compare_runs.py out/base out/head
"""
import io
import json
import sys
import zipfile
from pathlib import Path

from PIL import Image, ImageChops


def pixels(data):
    im = Image.open(io.BytesIO(data))
    return im.size, im.convert("RGBA")


def same_png(a, b, label, problems):
    (sa, ia), (sb, ib) = pixels(a), pixels(b)
    if sa != sb:
        problems.append(f"{label}: size {sa} vs {sb}")
    elif ImageChops.difference(ia, ib).getbbox():
        diff = max(hi for lo, hi in ImageChops.difference(ia, ib).getextrema())
        problems.append(f"{label}: pixels differ (max channel difference {diff}, area {ImageChops.difference(ia, ib).getbbox()})")


def main(base, head):
    base, head = Path(base), Path(head)
    problems, checked = [], 0
    for sdir in sorted(p for p in base.iterdir() if p.is_dir()):
        hdir = head / sdir.name
        if not hdir.exists():
            problems.append(f"{sdir.name}: missing in head"); continue
        rb, rh = (json.loads((d / "record.json").read_text()) for d in (sdir, hdir))
        for key in ("error", "errors"):
            if rh.get(key):
                problems.append(f"{sdir.name}: head {key}: {rh[key]}")
        for key in sorted(set(rb["states"]) | set(rh["states"])):
            a, b = rb["states"].get(key), rh["states"].get(key)
            if a != b:
                for field in sorted(set(a or {}) | set(b or {})):
                    if (a or {}).get(field) != (b or {}).get(field):
                        problems.append(f"{sdir.name}/{key}.{field}:\n    base {json.dumps((a or {}).get(field))}\n    head {json.dumps((b or {}).get(field))}")
        if rb["downloads"] != rh["downloads"]:
            problems.append(f"{sdir.name}: download names {rb['downloads']} vs {rh['downloads']}")
        for f in sorted(p.name for p in sdir.iterdir() if p.suffix in (".png", ".zip")):
            hb, hh = sdir / f, hdir / f
            if not hh.exists():
                problems.append(f"{sdir.name}/{f}: missing in head"); continue
            checked += 1
            if f.endswith(".png"):
                same_png(hb.read_bytes(), hh.read_bytes(), f"{sdir.name}/{f}", problems)
            else:
                zb, zh = zipfile.ZipFile(hb), zipfile.ZipFile(hh)
                if zb.namelist() != zh.namelist():
                    problems.append(f"{sdir.name}/{f}: entries\n    base {zb.namelist()}\n    head {zh.namelist()}"); continue
                for n in zb.namelist():
                    checked += 1
                    same_png(zb.read(n), zh.read(n), f"{sdir.name}/{f}:{n}", problems)
    print(f"Compared {checked} images/archives.")
    print("\n".join(problems) if problems else "No differences.")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
