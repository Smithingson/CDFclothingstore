"""Tests for the Drive sync's checks and output (no Google account needed):  python3 -m unittest discover tests"""
import io
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import sync_drive  # noqa: E402


def png(size=(585, 559), box=(10, 20, 40, 60), fill=(200, 0, 0, 255), base=(0, 0, 0, 0)):
    im = Image.new("RGBA", size, base)
    if box:
        im.paste(Image.new("RGBA", (box[2] - box[0], box[3] - box[1]), fill), box[:2])
    out = io.BytesIO()
    im.save(out, "PNG")
    return out.getvalue()


def entry(branch, section, name, data, size=None):
    return branch, "shirt", section, name, size if size is not None else len(data), lambda: data


class BuildTest(unittest.TestCase):
    def test_valid_files_are_cropped_and_listed(self):
        with tempfile.TemporaryDirectory() as site:
            skipped = []
            result = sync_drive.build([
                entry("City Watch", "1. OUTERWEAR", "Cloak.png", png()),
                entry("City Watch", "1. OUTERWEAR", "[MR1] Belt.png", png(box=(100, 100, 120, 130))),
            ], site, skipped)
            self.assertEqual(skipped, [])
            items = result["City Watch"]["shirt"][0]["items"]
            self.assertEqual([i["name"] for i in items], ["[MR1] Belt", "Cloak"])   # sorted by name
            cloak = items[1]
            self.assertEqual((cloak["x"], cloak["y"]), (10, 20))
            self.assertTrue(cloak["src"].startswith("uploads/city-watch/shirt/"))
            with Image.open(Path(site) / cloak["src"]) as im:
                self.assertEqual(im.size, (30, 40))

    def test_bad_files_are_skipped_with_a_reason(self):
        with tempfile.TemporaryDirectory() as site:
            skipped = []
            result = sync_drive.build([
                entry("Ingeld", "S", "notes.txt", b"hi"),
                entry("Ingeld", "S", "Small.png", png(size=(100, 100), box=(1, 1, 5, 5))),
                entry("Ingeld", "S", "Empty.png", png(box=None)),
                entry("Ingeld", "S", "Solid.png", png(box=None, base=(9, 9, 9, 255))),
                entry("Ingeld", "S", "Huge.png", png(), size=6 * 1024 * 1024),
                entry("Ingeld", "S", "Fake.png", b"not a png"),
                entry("Ingeld", "S", "Twice.png", png()),
                entry("Ingeld", "S", "twice.png", png()),
            ], site, skipped)
            reasons = dict(skipped)
            self.assertIn("not a .png file", reasons["Ingeld/Shirt/S/notes.txt"])
            self.assertIn("is 100x100, must be 585x559", reasons["Ingeld/Shirt/S/Small.png"])
            self.assertIn("completely transparent", reasons["Ingeld/Shirt/S/Empty.png"])
            self.assertIn("no transparent areas", reasons["Ingeld/Shirt/S/Solid.png"])
            self.assertIn("larger than 5 MB", reasons["Ingeld/Shirt/S/Huge.png"])
            self.assertIn("could not be read", reasons["Ingeld/Shirt/S/Fake.png"])
            self.assertIn("already has that name", reasons["Ingeld/Shirt/S/twice.png"])
            self.assertEqual([i["name"] for i in result["Ingeld"]["shirt"][0]["items"]], ["Twice"])

    def test_branches_come_from_the_site_config(self):
        import json
        config = json.loads((Path(__file__).resolve().parent.parent / "data" / "branches.json").read_text(encoding="utf-8"))
        self.assertEqual(sorted(sync_drive.BRANCHES.values()), sorted(b["name"] for b in config["branches"]))
        for b in config["branches"]:
            self.assertEqual(sync_drive.BRANCHES[b["name"].lower()], b["name"])   # folder names match case-insensitively
            self.assertEqual(sync_drive.SLUG(b["name"]), b["slug"])


if __name__ == "__main__":
    unittest.main()
