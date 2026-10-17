// Fixed facts about the templates and the showcase card. Branch-specific settings live in data/branches.json.

export const GARMENTS = ["shirt", "pants"];
export const GARMENT_LABEL = { shirt: "Shirt", pants: "Pants" };

// Roblox classic clothing template size.
export const TEMPLATE = { w: 585, h: 559 };

// Each branch's artwork, by convention under assets/<slug>/.
export const branchAssets = slug => ({
  button: `assets/${slug}/button.png`,
  showcase: `assets/${slug}/showcase.png`,
  frame: { shirt: `assets/${slug}/shirt-frame.png`, pants: `assets/${slug}/pants-frame.png` },
});

// Showcase card: where slices of the finished templates go (coordinates from the Larova Showcase Generator).
// Each slice copies a sw×128 strip from (sx, sy) on the template to (dx, dy) on the 700×373 card.
export const SHOWCASE = {
  w: 700,
  h: 373,
  skin: [[31, 18, 64, 256], [96, 18, 256, 128], [160, 18, 128, 256], [353, 18, 256, 128], [417, 18, 128, 256], [610, 18, 64, 256]],
  slices: {
    shirt: [[151, 355, 64, 31], [231, 74, 128, 160], [217, 355, 64, 96], [308, 355, 64, 288], [440, 355, 64, 353], [427, 74, 128, 417], [85, 355, 64, 545], [374, 355, 64, 610]]
      .map(([sx, sy, sw, dx]) => ({ sx, sy, sw, dx, dy: 18 })),
    pants: [[151, 355, 64, 31, 146], [217, 355, 64, 160, 146], [308, 355, 64, 224, 146], [231, 74, 128, 160, 18], [440, 355, 64, 417, 146], [85, 355, 64, 481, 146], [427, 74, 128, 417, 18], [374, 355, 64, 610, 146]]
      .map(([sx, sy, sw, dx, dy]) => ({ sx, sy, sw, dx, dy })),
  },
  // Pants are drawn first, then the shirt over them.
  order: ["pants", "shirt"],
  skinDefault: "#EAB892",
};
