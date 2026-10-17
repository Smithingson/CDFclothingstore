// Selection state for both garments, the player's own PNG layers, and the drawing order.
// No DOM here: the page reads from an Outfit and redraws after changing it.

import { GARMENTS } from "./config.js";

export const TOP = "top";      // custom layer anchor: above everything
export const BOTTOM = null;    // custom layer anchor: below everything

export class Outfit {
  constructor(catalog) {
    this.catalog = catalog;
    this.on = Object.fromEntries(GARMENTS.map(g => [g, new Set()]));     // item ids that are ticked
    this.custom = Object.fromEntries(GARMENTS.map(g => [g, []]));        // player's PNGs; order breaks anchor ties
    this.nextCustomId = -1;                                                // negative: never clashes with catalog ids
  }

  items(garment) { return [...this.catalog.garments[garment].items, ...this.custom[garment]]; }
  isOn(item) { return this.on[item.garment].has(item.id); }

  // Tick or untick one item. Ticking an item in a pick-one group unticks the rest of its group.
  set(item, on) {
    const set = this.on[item.garment];
    if (on && item.group) this.clearGroup(item.garment, item.group);
    if (on) set.add(item.id); else set.delete(item.id);
  }
  clearGroup(garment, group) {
    for (const o of this.catalog.garments[garment].items) if (o.group === group) this.on[garment].delete(o.id);
  }
  groupIsEmpty(garment, group) {
    return !this.catalog.garments[garment].items.some(o => o.group === group && this.isOn(o));
  }

  // A branch's default uniform on both garments. Ticked custom PNGs stay ticked.
  useDefaults(branch) {
    for (const g of GARMENTS) {
      const keep = this.custom[g].filter(c => this.isOn(c)).map(c => c.id);
      const defaults = this.catalog.garments[g].items.filter(l => l.branch === branch && l.isDefault).map(l => l.id);
      this.on[g] = new Set([...defaults, ...keep]);
    }
  }

  // Untick every generator item on both garments; custom PNGs keep their state.
  clearItems() {
    for (const g of GARMENTS) for (const l of this.catalog.garments[g].items) this.on[g].delete(l.id);
  }

  // Custom PNG layers go on top (anchor TOP) and start ticked.
  addCustom(garment, { name, src, parsed }) {
    const item = { id: this.nextCustomId--, custom: true, branch: null, garment, section: null, name, ...parsed,
      group: null, src, x: 0, y: 0, anchor: TOP };
    this.custom[garment].push(item);
    this.on[garment].add(item.id);
    return item;
  }
  removeCustom(item) {
    const list = this.custom[item.garment];
    list.splice(list.indexOf(item), 1);
    this.on[item.garment].delete(item.id);
  }

  /**
   * Drawing order for one garment, bottom to top (the branch frame is drawn after these):
   *   1. items still ticked from other branches, in branch order, each branch in its own section order
   *   2. the current branch's ticked items, first section at the bottom
   *   3. ticked custom PNGs, each directly above its anchor item (anchor TOP = above everything,
   *      BOTTOM = below everything); custom PNGs with the same anchor keep the order of this.custom.
   * Anchors refer to items whether or not they are ticked, so a moved PNG keeps its place as items change.
   */
  stack(garment, branch) {
    const base = this.baseOrder(garment, branch);
    const pos = c => c.anchor === TOP ? Infinity : c.anchor === BOTTOM ? -1 : base.findIndex(l => l.id === c.anchor);
    const mine = this.custom[garment].filter(c => this.isOn(c))
      .map((c, i) => ({ c, p: pos(c), i }))
      .sort((a, b) => a.p - b.p || a.i - b.i);
    const out = [];
    let k = 0;
    base.forEach((l, i) => {
      while (k < mine.length && mine[k].p < i) out.push(mine[k++].c);
      if (this.isOn(l)) out.push(l);
    });
    while (k < mine.length) out.push(mine[k++].c);
    return out;
  }
  baseOrder(garment, branch) {
    const all = this.catalog.garments[garment].items;
    return [...all.filter(l => l.branch !== branch), ...all.filter(l => l.branch === branch)];
  }

  // Move a ticked custom PNG past the next shown layer: dir +1 up, -1 down.
  moveCustom(item, dir, branch) {
    const S = this.stack(item.garment, branch), j = S.indexOf(item), list = this.custom[item.garment];
    if (j < 0 || !S[j + dir]) return false;
    const x = dir > 0 ? S[j + 1] : S[j - 2];          // the PNG ends up directly above x (none = bottom)
    list.splice(list.indexOf(item), 1);
    if (x?.custom) {
      item.anchor = x.anchor;
      list.splice(list.indexOf(x) + 1, 0, item);
    } else {
      item.anchor = !x ? BOTTOM : dir > 0 && j + 1 === S.length - 1 ? TOP : x.id;
      const first = list.findIndex(l => l.anchor === item.anchor);
      list.splice(first < 0 ? list.length : first, 0, item);
    }
    return true;
  }
}
