// Page controller: loads the catalog and images, owns what's on screen (garment, branch, skin colour),
// turns clicks into Outfit changes and redraws. Data, rules, ordering and drawing live in their own modules.

import { GARMENTS, GARMENT_LABEL, TEMPLATE, SHOWCASE } from "./config.js";
import { loadCatalog, parseName } from "./catalog.js";
import { Outfit } from "./outfit.js";
import { outfitWarnings } from "./rules.js";
import { loadImage, drawTemplate, drawShowcase, newCanvas, canvasBlob, layersZip, saveBlob } from "./render.js";
import { itemSections, customSection, updateCounts, updateCustomPositions, branchButtons, loadError } from "./ui.js";

const $ = id => document.getElementById(id);
const view = { garment: "shirt", branch: null, skin: SHOWCASE.skinDefault };
const addMsg = { shirt: "", pants: "" };
const templates = { shirt: newCanvas(), pants: newCanvas() };     // off-screen, for the showcase
const images = new Map();                                          // src -> loaded image
let catalog = null, outfit = null, ready = false;
const branchOf = name => catalog.branches.find(b => b.name === name);
const fileName = kind => `${view.branch} ${kind}.png`;

// ---- Loading -------------------------------------------------------------------------------------------

async function start() {
  ready = false;
  setDownloads(false);
  $("count").textContent = "Loading layers…";
  $("list").replaceChildren(Object.assign(document.createElement("p"), { className: "msg", textContent: "Loading items…" }));
  try {
    catalog = await loadCatalog();
  } catch (e) {
    $("count").textContent = "";
    $("list").replaceChildren(loadError(`${e.message} Reload the page or try again.`, start));
    return;
  }
  if (!GARMENTS.some(g => catalog.garments[g].items.length)) {
    $("count").textContent = "";
    $("list").replaceChildren(loadError("No items were found. The Drive update may not have run yet.", start));
    return;
  }
  outfit = new Outfit(catalog);
  $("branches").replaceChildren(...branchButtons(catalog.branches, setBranch));
  setBranch(catalog.branches[0].name, { defaults: true });

  // Every item image, frame and showcase card. A missing item is dropped (and reported) instead of
  // blocking the page; a missing frame or card is reported and skipped.
  const srcs = [...new Set([
    ...GARMENTS.flatMap(g => catalog.garments[g].items.map(l => l.src)),
    ...catalog.branches.flatMap(b => [b.showcase, ...GARMENTS.map(g => b.frame[g])]),
  ])];
  const loaded = await Promise.all(srcs.map(loadImage));
  srcs.forEach((src, i) => loaded[i] && images.set(src, loaded[i]));
  const broken = dropBrokenItems();
  const brokenArt = catalog.branches.flatMap(b => [b.showcase, ...GARMENTS.map(g => b.frame[g])]).filter(s => !images.has(s));
  showNotice([
    broken.length ? `${broken.length} item${broken.length === 1 ? "" : "s"} couldn't load and ${broken.length === 1 ? "is" : "are"} hidden: ${broken.join(", ")}.` : "",
    brokenArt.length ? `Some branch artwork couldn't load (${brokenArt.join(", ")}).` : "",
  ].filter(Boolean).join(" ") + (broken.length || brokenArt.length ? " Reload the page to try again." : ""));

  ready = true;
  renderList();
  refresh();
  setDownloads(true);
}

function dropBrokenItems() {
  const names = [];
  for (const g of GARMENTS) {
    const gar = catalog.garments[g];
    for (const l of gar.items) if (!images.has(l.src)) { names.push(l.label); outfit.on[g].delete(l.id); }
    gar.items = gar.items.filter(l => images.has(l.src));
    for (const s of gar.sections) s.items = s.items.filter(l => images.has(l.src));
  }
  return names;
}

function showNotice(text) {
  $("notice").hidden = !text;
  $("notice").textContent = text;
}

function setDownloads(on) {
  $("save").disabled = $("save-layers").disabled = !on;
  $("save-sc").disabled = !on || !images.has(branchOf(view.branch)?.showcase);
}

// ---- Drawing -------------------------------------------------------------------------------------------

const frameImage = g => images.get(branchOf(view.branch).frame[g]);

function refresh() {
  if (!ready) return;
  const g = view.garment, stack = outfit.stack(g, view.branch);
  drawTemplate($("out"), stack, images, frameImage(g));
  showStatus();
  updateCounts(document, id => outfit.on[g].has(id));
  updateCustomPositions($("mine"), stack);
  showShowcase();
}

function showShowcase() {
  const card = images.get(branchOf(view.branch).showcase);
  $("save-sc").disabled = !ready || !card;
  if (!ready || !card) return;
  for (const g of GARMENTS) drawTemplate(templates[g], outfit.stack(g, view.branch), images, frameImage(g));
  drawShowcase($("sc"), card, view.skin, templates);
}

function showStatus() {
  const g = view.garment, isOn = l => outfit.isOn(l);
  const n = outfit.items(g).filter(isOn).length;
  const { messages, flagged } = outfitWarnings({
    branchNames: catalog.branches.map(b => b.name),
    allItems: GARMENTS.flatMap(x => catalog.garments[x].items),
    garmentItems: outfit.items(g),
    isOn,
  });
  $("count").innerHTML = `${n} item${n === 1 ? "" : "s"} on` + (messages.length ? `<span class="pill">Conflict</span>` : "");
  $("warn").hidden = !messages.length;
  $("warn").textContent = messages.join(" ");
  const ids = new Set([...flagged].map(l => l.id));
  document.querySelectorAll(".row[data-id]").forEach(r => r.classList.toggle("clash", ids.has(+r.dataset.id)));
}

// ---- Lists ---------------------------------------------------------------------------------------------

function renderList() {
  const g = view.garment;
  const sections = catalog.garments[g].sections.filter(s => s.branch === view.branch);
  $("list").replaceChildren(...itemSections(sections, {
    isOn: l => outfit.isOn(l),
    groupIsEmpty: group => outfit.groupIsEmpty(g, group),
    onToggle: (l, on) => { outfit.set(l, on); refresh(); },
    onGroupNone: group => { outfit.clearGroup(g, group); refresh(); },
  }));
  $("mine").replaceChildren(customSection({
    title: `Custom ${GARMENT_LABEL[g]} Layers`,
    garment: g,
    size: TEMPLATE,
    items: [...outfit.custom[g]].sort((a, b) => a.id - b.id),     // newest first
    message: addMsg[g],
    isOn: l => outfit.isOn(l),
    onAdd: files => addCustom(g, files),
    onToggle: (l, on) => { outfit.set(l, on); refresh(); },
    onMove: (l, dir, button) => {
      if (!outfit.moveCustom(l, dir, view.branch)) return;
      refresh();
      if (button.disabled) button.parentElement.querySelector(dir > 0 ? ".down" : ".up").focus();
    },
    onRemove: l => {
      outfit.removeCustom(l);
      images.delete(l.src);
      URL.revokeObjectURL(l.src);
      addMsg[g] = "";
      renderList();
      refresh();
      $("mine").querySelector(".add-btn").focus();
    },
  }));
}

async function addCustom(g, files) {
  const errors = [];
  for (const file of files) {
    if (file.type !== "image/png") { errors.push(`${file.name} isn't a PNG.`); continue; }
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    if (!img || img.naturalWidth !== TEMPLATE.w || img.naturalHeight !== TEMPLATE.h) {
      errors.push(img ? `${file.name} is ${img.naturalWidth}×${img.naturalHeight}; it must be ${TEMPLATE.w}×${TEMPLATE.h}.` : `${file.name} couldn't be read.`);
      URL.revokeObjectURL(url);
      continue;
    }
    const name = file.name.replace(/\.png$/i, "");
    images.set(url, img);
    outfit.addCustom(g, { name, src: url, parsed: parseName(name) });
  }
  addMsg[g] = errors.join(" ");
  if (view.garment === g) { renderList(); refresh(); }
}

// ---- Controls ------------------------------------------------------------------------------------------

function setGarment(g) {
  view.garment = g;
  document.querySelectorAll(".switch button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.file === g)));
  if (!outfit) return;
  renderList();
  refresh();
}

// Switching branch shows its items and frame; ticked items stay ticked (one shared outfit).
function setBranch(b, { defaults = false } = {}) {
  view.branch = b;
  document.querySelectorAll("#branches button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.branch === b)));
  $("defaults").textContent = `Use ${b} defaults`;
  $("defaults").title = `Replace the outfit with the ${b} default uniform on both the shirt and the pants. Your own PNGs stay.`;
  if (defaults) outfit.useDefaults(b);
  renderList();
  refresh();
}

document.querySelectorAll(".switch button").forEach(b => b.addEventListener("click", () => setGarment(b.dataset.file)));

$("defaults").addEventListener("click", () => { if (!outfit) return; outfit.useDefaults(view.branch); renderList(); refresh(); });
$("clear").addEventListener("click", () => { if (!outfit) return; outfit.clearItems(); renderList(); refresh(); });

$("skin").addEventListener("input", e => {
  const v = e.target.value.trim().replace(/^#?/, "#");
  const ok = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
  e.target.setAttribute("aria-invalid", String(!ok));
  if (ok) { view.skin = v; showShowcase(); }
});

$("save").addEventListener("click", async () => {
  refresh();
  saveBlob(await canvasBlob($("out")), fileName(GARMENT_LABEL[view.garment]));
});

$("save-sc").addEventListener("click", async () => {
  showShowcase();
  saveBlob(await canvasBlob($("sc")), fileName("Showcase"));
});

// Ticked items (not the frame) as full-size PNGs in a .zip, numbered from the bottom layer (01) up.
$("save-layers").addEventListener("click", async () => {
  const msg = $("msg"), btn = $("save-layers"), g = view.garment;
  const layers = outfit.stack(g, view.branch);
  msg.hidden = true;
  if (!layers.length) { msg.hidden = false; msg.textContent = "Tick at least one item to download its layers."; return; }
  btn.disabled = true;
  try {
    saveBlob(await layersZip(layers, images), fileName(GARMENT_LABEL[g]).replace(".png", " layers.zip"));
  } catch (e) {
    msg.hidden = false;
    msg.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
});

start();
