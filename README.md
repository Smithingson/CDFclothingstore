# Larovan Uniform Generator

Pick shirt and pants layers for the City of Larova uniform, preview the outfit showcase, and download the finished PNGs for Roblox.

Site: https://smithingson.github.io/LarovanUniformGenerator/

Artwork: Created by SkavenBlight & xLuckySam · Formatted by Smithingson · City Watch by NicolasCageGaming · Showcase card from the Larova Showcase Generator

## Adding items (for clothing creators)

Drop PNGs into the shared Google Drive folder **Larovan Uniform Generator Uploads**. The site picks them up within an hour.

```
Larovan Uniform Generator Uploads/
  Shirt/
    4. CHEST ARMOR & ACCESSORIES/
      Bannerman Tabard.png      ← appears as "Bannerman Tabard"
  Pants/
    ...
```

- **One item per PNG**, exactly **585×559** (the Roblox template), transparent everywhere except the item, just like a layer in the .pdn generator.
- **File name = item name.** Tags in brackets show as badges, e.g. `[MR2] Loyalty Sash.png`.
- **Folder = section.** Use an existing section folder, or make a new folder under Shirt or Pants to create a new section.
- New items appear **on top of their section** and start unticked.
- Under 5 MB, and no two files with the same name in one section.
- To remove an item, delete the file from Drive. To update one, replace the file, keeping the same name.
- The original Larovan items live in these folders too. If Drive returns no items at all, the update stops and the site keeps its last version. Their stacking order, pick-one groups and starting picks are remembered by name in `index.html`, so renaming an original makes it a new, unticked item on top of its section.
- The Larova Background frame and the showcase card stay in this repo and can't be changed from Drive.

Files that break a rule are skipped. The reason is listed in the latest run under the repo's **Actions** tab.

## How it updates

`.github/workflows/pages.yml` runs every hour, on every push to `main`, and on demand (Actions → Build and deploy site → Run workflow). It copies the site, runs `scripts/sync_drive.py` to pull and check the Drive PNGs into `uploads/` + `uploads.json`, and deploys to GitHub Pages.

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
