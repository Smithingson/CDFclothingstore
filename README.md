# Larovan Uniform Generator

Pick shirt and pants layers for the City of Larova uniforms (the noble retinues Ingeld, City Watch, Dasmant and Jequis, and the Lost Men), preview the outfit showcase, and download the finished PNGs for Roblox.

The branch buttons switch which items and frame you see. The outfit is shared, so ticked items stay ticked when you switch, but items from different branches can't be worn together and the page warns when they are. **Use [branch] defaults** loads a branch's standard uniform.

Site: https://smithingson.github.io/LarovanUniformGenerator/

Artwork: Created by SkavenBlight & xLuckySam · Formatted by Smithingson · City Watch by NicolasCageGaming · Showcase card from the Larova Showcase Generator

## Your own PNGs (for players)

Players can press **Add PNG** under "Custom Shirt Layers" or "Custom Pants Layers" to layer their own 585×559 PNGs on top of the generator items. The ▲ ▼ arrows move a PNG up or down one layer at a time. The files stay in their browser, are never uploaded, and clear on reload.

**Download layers** saves the ticked items (not the frame) as a .zip of full 585×559 PNGs, numbered from the bottom layer (01) up, in the same format the Drive folder and Add PNG accept.

## Adding items (for clothing creators)

Drop PNGs into the shared Google Drive folder **Larovan Uniform Generator Uploads**. The site picks them up within an hour.

```
Larovan Uniform Generator Uploads/
  Ingeld/
    Shirt/
      4. CHEST ARMOR & ACCESSORIES/
        Bannerman Tabard.png      ← appears as "Bannerman Tabard"
    Pants/
      ...
  City Watch/   Dasmant/   Jequis/   Lost Men/   (same Shirt/Pants/section layout)
```

- **One item per PNG**, exactly **585×559** (the Roblox template), transparent everywhere except the item, just like a layer in the .pdn generator.
- **File name = item name.** Tags in brackets show as badges, e.g. `[MR2] Loyalty Sash.png`.
- **Folder = section.** Put files in the right branch, then Shirt or Pants, then a section folder. A new section folder creates a new section in that branch.
- New items appear **on top of their section** and start unticked.
- Under 5 MB, and no two files with the same name in one section.
- To remove an item, delete the file from Drive. To update one, replace the file, keeping the same name.
- The original items of every branch live in these folders too. If Drive returns no items at all, the update stops and the site keeps its last version. Their stacking order, pick-one groups and starting picks are remembered by name in `data/layout.json`, so renaming an original makes it a new, unticked item on top of its section.
- Each branch's background frame, button and showcase card stay in this repo (`assets/<branch>/`) and can't be changed from Drive.

Files that break a rule are skipped. The reason is listed in the latest run under the repo's **Actions** tab.

## How it updates

`.github/workflows/pages.yml` runs every hour, on every push to `main`, and on demand (Actions → Build and deploy site → Run workflow). It runs the tests, copies the site, runs `scripts/sync_drive.py` to pull and check the Drive PNGs into `uploads/` + `uploads.json`, and deploys to GitHub Pages.

## How the code is organised

A static site with no build step and one outside library (JSZip, for the layers .zip).

| Where | What |
| --- | --- |
| `data/branches.json` | The branch tabs, in order: name, slug and tier (`noble` or `lesser`; a divider separates the tiers). Also read by the Drive sync. |
| `data/layout.json` | Per branch and garment: sections from the bottom of the stack up, each item's name, pick-one `group` and `default`. |
| `assets/<slug>/` | Each branch's `button.png`, `shirt-frame.png`, `pants-frame.png` and `showcase.png`. |
| `js/catalog.js` | Builds the item list from the layout plus `uploads.json`, and reads badges and rules from item names. |
| `js/outfit.js` | What's ticked, defaults, Clear all, your own PNGs, and the drawing order (`stack`). |
| `js/rules.js` | "Do not use with / without" and mixed-branch warnings. |
| `js/render.js` | Drawing the template and showcase, and the PNG and .zip downloads. |
| `js/ui.js`, `js/main.js` | The interface pieces, and the page controller that connects everything. |
| `js/config.js` | Template size and showcase card geometry. |

**Layer order** (bottom to top): items still ticked from other branches, then the current branch's items (first section at the bottom), with your own PNGs placed just above the item they were moved onto (on top by default), then the branch frame. See `Outfit.stack` in `js/outfit.js`.

**Adding a branch:** add it to `data/branches.json`, add its sections to `data/layout.json`, put its four images in `assets/<slug>/`, and create a Drive folder with the same name. The buttons, defaults, frame and showcase all follow from that.

## Tests

- `npm test` (or `node --test tests/unit.test.mjs` and `python3 -m unittest discover -s tests -p "test_*.py"`) checks the catalog, layer order, rules and the Drive file checks. The deploy runs both.
- `tests/regression.mjs` drives a served copy of the site through representative outfits (each branch's defaults, pick-one changes, rule warnings, mixed branches, your own PNGs, skin colour, Clear all) and saves every download. `tests/compare_runs.py` compares two such runs pixel by pixel, so a change can be checked against the live version. Steps (Node.js 20+ and Python 3 with Pillow):

```
npm install --no-save playwright && npx playwright install chromium
node tests/fetch_uploads.mjs                      # copies the Drive items from the live site
python -m http.server 8000                        # in a second terminal: serves this folder
node tests/regression.mjs https://smithingson.github.io/LarovanUniformGenerator/ out/live
node tests/regression.mjs http://localhost:8000/ out/local
python tests/compare_runs.py out/live out/local   # "No differences." or a list of what changed
```

## One-time setup

1. **Google Cloud project:** at https://console.cloud.google.com create a project (e.g. "Larovan Uniform Generator").
2. **Enable the Drive API:** APIs & Services → Library → search "Google Drive API" → Enable.
3. **Service account:** IAM & Admin → Service Accounts → Create service account (any name, e.g. `larovan-drive-sync`). Skip the optional role and user steps → Done.
4. **Key:** open the new service account → Keys → Add key → Create new key → JSON. A `.json` file downloads. Keep it private.
5. **Share the folder:** in Google Drive, share **Larovan Uniform Generator Uploads** with the service account's email (ends in `.iam.gserviceaccount.com`) as **Viewer**.
6. **GitHub secret:** repo → Settings → Secrets and variables → Actions → New repository secret. Name: `GDRIVE_SA_KEY`. Value: paste the entire contents of the `.json` file.
7. **Pages source:** repo → Settings → Pages → Source: **GitHub Actions**.
8. **Test:** Actions → Build and deploy site → Run workflow. The run summary lists what was added or skipped.

Give creators **Editor** access to the Drive folder. Anything they add goes live automatically, so share it only with people you trust.

Note: GitHub pauses scheduled runs in a repo with no commits for 60 days. If uploads stop appearing, re-enable the workflow from the Actions tab.
