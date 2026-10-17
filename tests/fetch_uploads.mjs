// Copy the Drive items (uploads.json + uploads/) from the live site into a folder, so a local copy of the
// site shows the same items. No install needed:  node tests/fetch_uploads.mjs [folder] [site url]
// Defaults: the repo folder and https://smithingson.github.io/LarovanUniformGenerator/
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] || ".";
const site = (process.argv[3] || "https://smithingson.github.io/LarovanUniformGenerator/").replace(/\/?$/, "/");

const get = async url => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: error ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
};

const json = await get(site + "uploads.json");
const uploads = JSON.parse(json);
const srcs = Object.values(uploads).flatMap(g => Object.values(g).flatMap(secs => secs.flatMap(s => s.items.map(i => i.src))));
let done = 0;
for (let i = 0; i < srcs.length; i += 16) {
  await Promise.all(srcs.slice(i, i + 16).map(async src => {
    const out = path.join(dir, src);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, await get(site + src));
    done++;
  }));
}
fs.writeFileSync(path.join(dir, "uploads.json"), json);
console.log(`Saved uploads.json and ${done} item images to ${path.resolve(dir)}`);
