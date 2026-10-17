// Outfit rules, all read from item names: "(DO NOT USE WITH X)", "(DO NOT USE WITHOUT [THE] X)",
// and "items from different branches can't be worn together". Pure functions over the items that are on.

export const titleCase = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

const mentions = (item, text) => item.name.toUpperCase().includes(text.toUpperCase());

// Pairs [item, other] where item says not to wear it with something whose name contains its rule text.
export function conflicts(items, isOn) {
  const on = items.filter(isOn), pairs = [];
  for (const l of on) {
    if (!l.rule) continue;
    for (const o of on) if (o !== l && mentions(o, l.rule)) pairs.push([l, o]);
  }
  return pairs;
}

// Items that need something ("DO NOT USE WITHOUT") that isn't on.
export function missing(items, isOn) {
  const on = items.filter(isOn);
  return on.filter(l => l.needs && !on.some(o => o !== l && mentions(o, l.needs)));
}

// Branches with ticked generator items (the player's own PNGs have no branch), in branch order.
export function branchesInUse(branchNames, items, isOn) {
  const used = new Set(items.filter(l => l.branch && isOn(l)).map(l => l.branch));
  return branchNames.filter(b => used.has(b));
}

// Warning sentences, plus the items to highlight.
export function outfitWarnings({ branchNames, allItems, garmentItems, isOn }) {
  const used = branchesInUse(branchNames, allItems, isOn);
  const pairs = conflicts(garmentItems, isOn), needs = missing(garmentItems, isOn);
  return {
    messages: [
      ...(used.length > 1 ? [`This outfit mixes items from ${used.join(" and ")}. Items from different branches can't be worn together.`] : []),
      ...pairs.map(([a, b]) => `${a.label} and ${b.label} shouldn't be worn together.`),
      ...needs.map(l => `${l.label} can't be worn without the ${titleCase(l.needs)}.`),
    ],
    flagged: new Set([...pairs.flat(), ...needs]),
  };
}
