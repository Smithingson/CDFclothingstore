// The item catalog: which items exist, where they sit in the stack, and what rules their names carry.
//
//   data/branches.json  branch names and slugs (also read by scripts/sync_drive.py)
//   data/layout.json    per branch and garment: sections bottom to top, each with its items bottom to top,
//                       pick-one groups and default items, matched to Drive files by section + name
//   uploads.json        written by the deploy workflow from Google Drive: every item's image and position
//
// Layout items without a Drive file are dropped. Drive files the layout doesn't know go on top of their
// section, or into a new section above all the others when the section is new. buildCatalog is pure.

import { GARMENTS, branchAssets } from "./config.js";

// "[LR2] Ingeld Gambeson 1+ (DO NOT USE WITH X)" -> label "Ingeld Gambeson 1", tags ["LR2"], rule "X".
export function parseName(name) {
  const tags = [];
  let rule = null, needs = null;
  const label = name.replace(/\[([^\]]+)\]/g, (_, t) => { tags.push(t); return ""; })
    .replace(/\(DO NOT USE WITH ([^)]+)\)/i, (_, t) => { rule = t.trim(); return ""; })
    .replace(/\(DO NOT USE WITHOUT (?:THE )?([^)]+)\)/i, (_, t) => { needs = t.trim(); return ""; })
    .replace(/\s+/g, " ").trim().replace(/\s*[+-]$/, "").trim();
  return { label, tags, rule, needs };
}

const key = (section, name) => `${section.trim().toLowerCase()}\u0000${name.trim().toLowerCase()}`;

/**
 * @returns {{
 *   branches: {name, slug, tier, button, showcase, frame: {shirt, pants}}[],
 *   garments: {shirt: Garment, pants: Garment},
 * }}
 * Garment = { items: Item[] (every branch, drawing order), sections: Section[] }
 * Section = { branch, name, notes: string[], items: Item[] (bottom to top) }
 * Item    = { id, branch, garment, section, name, label, tags, rule, needs, group, isDefault, src, x, y }
 *           group is unique per branch and garment ("Ingeld/gambeson"); null when the item isn't in a pick-one group.
 */
export function buildCatalog(config, layout, uploads) {
  const branches = config.branches.map(b => ({ name: b.name, slug: b.slug, tier: b.tier || "noble", ...branchAssets(b.slug) }));
  let nextId = 1;
  const garments = {};
  for (const garment of GARMENTS) {
    const sections = [];
    for (const { name: branch } of branches) {
      const drive = new Map();
      for (const s of uploads[branch]?.[garment] || []) for (const it of s.items) drive.set(key(s.section, it.name), it);
      const item = (section, name, extra, file) => ({
        id: nextId++, branch, garment, section, name, ...parseName(name),
        group: extra.group ? `${branch}/${extra.group}` : null, isDefault: !!extra.default,
        src: file.src, x: file.x, y: file.y,
      });
      const own = (layout[branch]?.[garment] || []).map(s => {
        const sec = { branch, name: s.section, notes: s.notes || [], items: [] };
        for (const it of s.items) {
          const file = drive.get(key(s.section, it.name));
          if (!file) continue;                       // no Drive file: the item is gone
          drive.delete(key(s.section, it.name));
          sec.items.push(item(s.section, it.name, it, file));
        }
        return sec;
      });
      // Drive files the layout doesn't list: top of their section, or a new section on top.
      for (const s of uploads[branch]?.[garment] || []) {
        const extra = s.items.filter(it => drive.has(key(s.section, it.name)));
        if (!extra.length) continue;
        let sec = own.find(x => x.name.trim().toLowerCase() === s.section.trim().toLowerCase());
        if (!sec) own.push(sec = { branch, name: s.section, notes: [], items: [] });
        for (const it of extra) {
          drive.delete(key(s.section, it.name));
          sec.items.push(item(sec.name, it.name, {}, it));
        }
      }
      sections.push(...own);
    }
    garments[garment] = { sections, items: sections.flatMap(s => s.items) };
  }
  return { branches, garments };
}

async function getJson(url, what) {
  let r;
  try { r = await fetch(url, { cache: "no-store" }); } catch { throw new Error(`Couldn't load the ${what}. Check your connection.`); }
  if (!r.ok) throw new Error(`Couldn't load the ${what} (error ${r.status}).`);
  try { return await r.json(); } catch { throw new Error(`The ${what} is damaged.`); }
}

export async function loadCatalog() {
  const [config, layout, uploads] = await Promise.all([
    getJson("data/branches.json", "branch list"),
    getJson("data/layout.json", "item layout"),
    getJson("uploads.json", "item list"),
  ]);
  return buildCatalog(config, layout, uploads);
}
