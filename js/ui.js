// Interface pieces: item rows, sections, the custom layers panel and the branch buttons.
// These only build DOM; main.js decides what to show and what happens on input.

import { titleCase } from "./rules.js";

const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children.filter(c => c != null));
  return e;
};

// One selectable item: checkbox (or radio inside a pick-one group), thumbnail, name, rank badges and rule notes.
export function itemRow(item, { type = "checkbox", groupName, checked, onChange }) {
  const input = el("input", { type, id: `L-${item.garment}-${item.id}`, checked });
  if (groupName) input.name = groupName;
  input.addEventListener("change", () => onChange(input.checked));
  const thumb = el("span", { className: "thumb" }, el("img", { src: item.src, alt: "", loading: "lazy" }));
  const lbl = el("span", { className: "lbl" }, el("b", { textContent: item.label }));
  if (item.tags.length) lbl.append(el("span", { className: "chips" }, ...item.tags.map(t => el("span", { className: "chip", textContent: t }))));
  if (item.rule) lbl.append(el("span", { className: "note", textContent: `Not with ${titleCase(item.rule)}` }));
  if (item.needs) lbl.append(el("span", { className: "note", textContent: `Only with the ${titleCase(item.needs)}` }));
  const row = el("label", { className: "row" }, input, thumb, lbl);
  row.dataset.id = item.id;
  return row;
}

function noneRow(groupName, checked, onPick) {
  const input = el("input", { type: "radio", name: groupName, id: `${groupName}-none`.replace(/[^\w-]/g, "_"), checked });
  input.addEventListener("change", onPick);
  return el("label", { className: "row" }, input, el("span", { className: "thumb none", textContent: "—" }),
    el("span", { className: "lbl" }, el("b", { textContent: "None" })));
}

// A collapsible section; its "k of n" counter is filled in by updateCounts.
function section(title, items, ...content) {
  const sec = el("details", { className: "sec", open: true },
    el("summary", { title: "Show or hide this section" }, el("h2", { textContent: title }), el("span", { className: "n" })),
    el("div", { className: "items" }, ...content));
  sec.dataset.items = items.map(l => l.id).join(",");
  return sec;
}

const sentenceCase = text => text.toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g, (m, s, c) => s + c.toUpperCase());

/**
 * The current branch's sections for one garment, top section first (as stacked in the template).
 * Pick-one groups become a fieldset with a "None" choice.
 */
export function itemSections(sections, { isOn, groupIsEmpty, onToggle, onGroupNone }) {
  const out = [];
  for (const s of [...sections].reverse()) {
    const items = [...s.items].reverse();
    if (!items.length) continue;
    const content = s.notes.map(t => el("p", { className: "secnote", textContent: sentenceCase(t) }));
    const seen = new Set();
    for (const l of items) {
      if (!l.group) { content.push(itemRow(l, { checked: isOn(l), onChange: on => onToggle(l, on) })); continue; }
      if (seen.has(l.group)) continue;
      seen.add(l.group);
      const groupName = `${l.garment}-${l.group}`;
      content.push(el("fieldset", { className: "pick" },
        el("legend", { textContent: "Choose one" }),
        noneRow(groupName, groupIsEmpty(l.group), () => onGroupNone(l.group)),
        ...items.filter(o => o.group === l.group).map(o => itemRow(o, { type: "radio", groupName, checked: isOn(o), onChange: on => onToggle(o, on) }))));
    }
    out.push(section(s.name, items, ...content));
  }
  return out;
}

// "Custom Shirt Layers": the player's own PNGs, newest first, each with ▲ ▼ to change its layer and Remove.
export function customSection({ title, garment, size, items, message, isOn, onAdd, onToggle, onMove, onRemove }) {
  const input = el("input", { type: "file", accept: "image/png", multiple: true, id: `add-${garment}`, hidden: true });
  input.addEventListener("change", () => { onAdd([...input.files]); input.value = ""; });
  const add = el("button", { type: "button", className: "save alt add-btn", textContent: "Add PNG",
    title: `Add your own ${size.w}×${size.h} transparent PNGs on top of the outfit. They stay on this device.` });
  add.addEventListener("click", () => input.click());
  const note = el("p", { className: message ? "msg err" : "msg",
    textContent: message || `Your own ${size.w}×${size.h} transparent PNGs. They stay on this device and clear when you reload.` });
  note.setAttribute("aria-live", "polite");
  const rows = items.map(l => {
    const row = itemRow(l, { checked: isOn(l), onChange: on => onToggle(l, on) });
    const order = el("span", { className: "order" });
    order.dataset.id = l.id;
    for (const [cls, sym, dir, word] of [["up", "▲", 1, "up"], ["down", "▼", -1, "down"]]) {
      const b = el("button", { type: "button", className: cls, textContent: sym, title: `Move this PNG ${word} one layer` });
      b.setAttribute("aria-label", `Move ${l.label} ${word} one layer`);
      b.addEventListener("click", e => { e.preventDefault(); if (b.getAttribute("aria-disabled") !== "true") onMove(l, dir); });
      order.append(b);
    }
    order.append(el("span", { className: "pos" }));
    const rm = el("button", { type: "button", className: "remove", textContent: "Remove", title: "Remove this PNG from your outfit" });
    rm.setAttribute("aria-label", `Remove ${l.label}`);
    rm.addEventListener("click", e => { e.preventDefault(); onRemove(l); });
    row.querySelector(".lbl").append(order, rm);
    return row;
  });
  return section(title, items, el("div", { className: "add" }, add, input, note), ...rows);
}

// "k of n" next to each section title.
export function updateCounts(root, isOnId) {
  root.querySelectorAll(".sec").forEach(sec => {
    const ids = sec.dataset.items ? sec.dataset.items.split(",").map(Number) : [];
    sec.querySelector(".n").textContent = `${ids.filter(isOnId).length} of ${ids.length}`;
  });
}

// "layer n of m" for each custom PNG, and which arrows can move it. Arrows that can't move are marked
// aria-disabled rather than disabled, so keyboard focus stays on them at the top or bottom.
export function updateCustomPositions(root, stack) {
  root.querySelectorAll(".order[data-id]").forEach(o => {
    const j = stack.findIndex(l => l.id === +o.dataset.id);
    o.querySelector(".pos").textContent = j < 0 ? "hidden" : `layer ${j + 1} of ${stack.length}`;
    o.querySelector(".up").setAttribute("aria-disabled", String(j < 0 || j === stack.length - 1));
    o.querySelector(".down").setAttribute("aria-disabled", String(j <= 0));
  });
}

// One button per branch; a divider goes between tiers (noble retinues, then lesser ones).
export function branchButtons(branches, onPick) {
  return branches.flatMap((b, i) => {
    const btn = el("button", { type: "button", title: `${b.name}: show the ${b.name} items and frame` },
      el("img", { src: b.button, alt: "" }), el("span", { textContent: b.name }));
    btn.dataset.branch = b.name;
    btn.addEventListener("click", () => onPick(b.name));
    if (i === 0 || branches[i - 1].tier === b.tier) return [btn];
    const divider = el("span", { className: "divider" });
    divider.setAttribute("role", "separator");
    divider.setAttribute("aria-orientation", "vertical");
    return [divider, btn];
  });
}

export function loadError(message, onRetry) {
  const retry = el("button", { type: "button", className: "save alt", textContent: "Try again" });
  retry.addEventListener("click", onRetry);
  const box = el("div", { className: "load-error" }, el("p", { textContent: message }), retry);
  box.setAttribute("role", "alert");
  return box;
}
