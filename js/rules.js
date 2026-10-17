// Outfit rules: "(DO NOT USE WITH X)" and "(DO NOT USE WITHOUT [THE] X)" read from item names, and
// "items from different branches can't be worn together" unless a branch's canMixWith allows the pair
// (data/branches.json). Pure functions over the items that are on.

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

// Two branches may share an outfit when either lists the other in canMixWith.
const listOf = names => names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
const mixable = (a, b) => a.name === b.name || a.canMixWith.includes(b.name) || b.canMixWith.includes(a.name);

// Warning sentences, plus the items to highlight. branches: [{name, canMixWith}] in button order.
export function outfitWarnings({ branches, allItems, garmentItems, isOn }) {
  const used = branchesInUse(branches.map(b => b.name), allItems, isOn).map(n => branches.find(b => b.name === n));
  const mixed = used.some(a => used.some(b => !mixable(a, b)));
  const allowances = used.filter(b => b.canMixWith.length).map(b => `${b.name} items can only be worn with ${listOf(b.canMixWith)} items.`);
  const pairs = conflicts(garmentItems, isOn), needs = missing(garmentItems, isOn);
  return {
    messages: [
      ...(mixed ? [`This outfit mixes items from ${listOf(used.map(b => b.name))}. Items from different branches can't be worn together.`, ...allowances] : []),
      ...pairs.map(([a, b]) => `${a.label} and ${b.label} shouldn't be worn together.`),
      ...needs.map(l => `${l.label} can't be worn without the ${titleCase(l.needs)}.`),
    ],
    flagged: new Set([...pairs.flat(), ...needs]),
  };
}
