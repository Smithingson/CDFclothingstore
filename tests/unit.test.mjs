// Unit tests for the pure modules (no browser needed):  node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseName, buildCatalog } from "../js/catalog.js";
import { Outfit, TOP } from "../js/outfit.js";
import { conflicts, missing, outfitWarnings } from "../js/rules.js";

const config = { branches: [{ name: "A", slug: "a" }, { name: "B", slug: "b" }] };
const file = (name, n) => ({ name, src: `uploads/${n}.png`, x: n, y: n });
// Layout: A has two sections; "Gone" has no Drive file. B has one section.
const layout = {
  A: {
    shirt: [
      { section: "2. BASE", items: [{ name: "Tunic+ (DO NOT USE WITH COAT)", default: true }, { name: "Gone" }] },
      { section: "1. TOP", notes: ["A NOTE."], items: [{ name: "[MR1] Coat 1", group: "coat", default: true }, { name: "Coat 2", group: "coat" }] },
    ],
    pants: [{ section: "LEGS", items: [{ name: "Boots (DO NOT USE WITHOUT THE TROUSERS)", default: true }, { name: "Trousers" }] }],
  },
  B: { shirt: [{ section: "ONLY", items: [{ name: "Sash", default: true }] }] },
};
const uploads = {
  A: {
    shirt: [
      { section: "1. top", items: [file("Coat 1", 3), file("[MR1] Coat 1", 4), file("Coat 2", 5)] },     // "Coat 1" is new to the layout
      { section: "2. BASE", items: [file("Tunic+ (DO NOT USE WITH COAT)", 1)] },
      { section: "Extras", items: [file("Cape", 6)] },                                                      // new section
    ],
    pants: [{ section: "LEGS", items: [file("Boots (DO NOT USE WITHOUT THE TROUSERS)", 7), file("Trousers", 8)] }],
  },
  B: { shirt: [{ section: "ONLY", items: [file("Sash", 9)] }] },
};
const names = items => items.map(l => l.name);

test("parseName reads badges and rules", () => {
  assert.deepEqual(parseName("[LR2] Ingeld Gambeson 1+"), { label: "Ingeld Gambeson 1", tags: ["LR2"], rule: null, needs: null });
  assert.deepEqual(parseName("Willingman's Tunic+ (DO NOT USE WITH INGELD GAMBESON)"),
    { label: "Willingman's Tunic", tags: [], rule: "INGELD GAMBESON", needs: null });
  assert.equal(parseName("Avontal Boots (DO NOT USE WITHOUT THE LEBADE)").needs, "LEBADE");
  assert.deepEqual(parseName("[⛊] Proto-couters [MR1+]").tags, ["⛊", "MR1+"]);
});

test("buildCatalog merges the layout with Drive files", () => {
  const c = buildCatalog(config, layout, uploads);
  const shirt = c.garments.shirt;
  // drawing order: branch A bottom to top, then B; "Gone" dropped; new Drive item on top of its section; new section on top
  assert.deepEqual(names(shirt.items), ["Tunic+ (DO NOT USE WITH COAT)", "[MR1] Coat 1", "Coat 2", "Coat 1", "Cape", "Sash"]);
  assert.deepEqual(shirt.sections.map(s => `${s.branch}:${s.name}`), ["A:2. BASE", "A:1. TOP", "A:Extras", "B:ONLY"]);
  const coat = shirt.items[1];
  assert.equal(coat.label, "Coat 1");
  assert.deepEqual([coat.src, coat.x, coat.y, coat.group, coat.isDefault], ["uploads/4.png", 4, 4, "A/coat", true]);
  assert.equal(shirt.items[3].group, null);                    // Drive-only items start unticked, no group
  assert.deepEqual(shirt.sections[1].notes, ["A NOTE."]);
  assert.equal(new Set([...shirt.items, ...c.garments.pants.items].map(l => l.id)).size, 8);
  assert.equal(c.branches[1].frame.pants, "assets/b/pants-frame.png");
});

test("defaults, pick-one groups and clearing", () => {
  const o = new Outfit(buildCatalog(config, layout, uploads));
  o.useDefaults("A");
  const shirt = o.catalog.garments.shirt.items, on = () => names(shirt.filter(l => o.isOn(l)));
  assert.deepEqual(on(), ["Tunic+ (DO NOT USE WITH COAT)", "[MR1] Coat 1"]);
  o.set(shirt[2], true);                                         // Coat 2 replaces Coat 1 in its group
  assert.deepEqual(on(), ["Tunic+ (DO NOT USE WITH COAT)", "Coat 2"]);
  o.clearGroup("shirt", "A/coat");
  assert.ok(o.groupIsEmpty("shirt", "A/coat"));
  const mine = o.addCustom("shirt", { name: "mine", src: "blob:1", parsed: parseName("mine") });
  o.clearItems();
  assert.deepEqual(o.stack("shirt", "A"), [mine]);               // own PNGs survive Clear all
  o.useDefaults("B");
  assert.deepEqual(names(o.stack("shirt", "B")), ["Sash", "mine"]);
});

test("layer order: other branches below the current one, own PNGs at their anchors", () => {
  const o = new Outfit(buildCatalog(config, layout, uploads));
  const shirt = o.catalog.garments.shirt.items;
  o.useDefaults("A");
  o.set(shirt[5], true);                                          // B's Sash, mixed in
  assert.deepEqual(names(o.stack("shirt", "A")), ["Sash", "Tunic+ (DO NOT USE WITH COAT)", "[MR1] Coat 1"]);
  assert.deepEqual(names(o.stack("shirt", "B")), ["Tunic+ (DO NOT USE WITH COAT)", "[MR1] Coat 1", "Sash"]);

  const p1 = o.addCustom("shirt", { name: "p1", src: "blob:1", parsed: parseName("p1") });
  const p2 = o.addCustom("shirt", { name: "p2", src: "blob:2", parsed: parseName("p2") });
  assert.deepEqual(names(o.stack("shirt", "A")), ["Sash", "Tunic+ (DO NOT USE WITH COAT)", "[MR1] Coat 1", "p1", "p2"]);
  o.moveCustom(p2, -1, "A");                                      // past p1
  assert.deepEqual(names(o.stack("shirt", "A")).slice(-2), ["p2", "p1"]);
  o.moveCustom(p2, -1, "A");                                      // below the coat: now anchored to the tunic
  assert.deepEqual(names(o.stack("shirt", "A")), ["Sash", "Tunic+ (DO NOT USE WITH COAT)", "p2", "[MR1] Coat 1", "p1"]);
  assert.equal(p2.anchor, shirt[0].id);
  o.set(shirt[0], false);                                         // anchor unticked: p2 keeps its place
  assert.deepEqual(names(o.stack("shirt", "A")), ["Sash", "p2", "[MR1] Coat 1", "p1"]);
  while (o.moveCustom(p2, -1, "A"));
  assert.deepEqual(names(o.stack("shirt", "A")), ["p2", "Sash", "[MR1] Coat 1", "p1"]);
  while (o.moveCustom(p2, 1, "A"));
  assert.equal(p2.anchor, TOP);
  assert.deepEqual(names(o.stack("shirt", "A")).at(-1), "p2");
  o.removeCustom(p1);
  assert.deepEqual(names(o.stack("shirt", "A")), ["Sash", "[MR1] Coat 1", "p2"]);
});

test("rules: conflicts, missing items and mixed branches", () => {
  const o = new Outfit(buildCatalog(config, layout, uploads));
  o.useDefaults("A");
  const isOn = l => o.isOn(l), { shirt, pants } = o.catalog.garments;
  assert.deepEqual(conflicts(shirt.items, isOn).map(p => names(p)), [["Tunic+ (DO NOT USE WITH COAT)", "[MR1] Coat 1"]]);
  assert.deepEqual(names(missing(pants.items, isOn)), ["Boots (DO NOT USE WITHOUT THE TROUSERS)"]);
  o.set(pants.items[1], true);
  assert.deepEqual(missing(pants.items, isOn), []);
  o.set(shirt.items[5], true);
  const w = outfitWarnings({ branches: o.catalog.branches, allItems: [...shirt.items, ...pants.items], garmentItems: shirt.items, isOn });
  assert.deepEqual(w.messages, [
    "This outfit mixes items from A and B. Items from different branches can't be worn together.",
    "Tunic and Coat 1 shouldn't be worn together.",
  ]);
  assert.equal(w.flagged.size, 2);
});

test("canMixWith lets two branches share an outfit without the mixed-branch warning", () => {
  const cfg = { branches: [{ name: "A", slug: "a" }, { name: "B", slug: "b" }, { name: "L", slug: "l", canMixWith: ["A"] }] };
  const lay = { ...layout, L: { shirt: [{ section: "RAGS", items: [{ name: "Rag" }] }] } };
  const up = { ...uploads, L: { shirt: [{ section: "RAGS", items: [file("Rag", 10)] }] } };
  const o = new Outfit(buildCatalog(cfg, lay, up));
  const { shirt } = o.catalog.garments, isOn = l => o.isOn(l), byName = n => shirt.items.find(l => l.name === n);
  const warn = () => outfitWarnings({ branches: o.catalog.branches, allItems: shirt.items, garmentItems: shirt.items, isOn }).messages
    .filter(m => !m.includes("shouldn't"));
  o.set(byName("Coat 2"), true); o.set(byName("Rag"), true);
  assert.deepEqual(warn(), []);                                    // A + L: allowed
  o.set(byName("Sash"), true);                                     // + B: not allowed
  assert.deepEqual(warn(), ["This outfit mixes items from A, B and L. Items from different branches can't be worn together.",
    "L items can only be worn with A items."]);
  o.set(byName("Coat 2"), false); o.set(byName("Sash"), true);
  assert.equal(warn().length, 2);                                   // B + L: not allowed
});

test("the shipped layout and branch config agree", () => {
  const cfg = JSON.parse(fs.readFileSync(new URL("../data/branches.json", import.meta.url)));
  const lay = JSON.parse(fs.readFileSync(new URL("../data/layout.json", import.meta.url)));
  assert.deepEqual(Object.keys(lay), cfg.branches.map(b => b.name));
  for (const b of cfg.branches) {
    for (const g of ["shirt", "pants"]) {
      for (const f of ["button", "showcase", `${g}-frame`]) assert.ok(fs.existsSync(new URL(`../assets/${b.slug}/${f}.png`, import.meta.url)), `${b.slug}/${f}`);
      const seen = new Set();
      for (const s of lay[b.name][g]) for (const it of s.items) {
        const k = `${s.section.toLowerCase()}|${it.name.toLowerCase()}`;
        assert.ok(!seen.has(k), `duplicate ${b.name} ${g} ${k}`);
        seen.add(k);
      }
    }
  }
});
