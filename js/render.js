// Drawing and file output. One function draws a template; the preview, the showcase and the
// downloads all use it, so they always match.

import { TEMPLATE, SHOWCASE } from "./config.js";

// Load an image once; resolves to null (instead of failing) when it can't be loaded.
const cache = new Map();
export function loadImage(src) {
  if (!cache.has(src)) cache.set(src, new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  }));
  return cache.get(src);
}

// Draw layers (bottom to top) and then the frame onto a 585×559 canvas.
export function drawTemplate(canvas, layers, images, frame) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, TEMPLATE.w, TEMPLATE.h);
  for (const l of layers) ctx.drawImage(images.get(l.src), l.x, l.y);
  if (frame) ctx.drawImage(frame, 0, 0);
}

export const newCanvas = (w = TEMPLATE.w, h = TEMPLATE.h) => Object.assign(document.createElement("canvas"), { width: w, height: h });

// Showcase card: the card, skin-coloured blocks, then slices of the finished pants and shirt templates.
export function drawShowcase(canvas, card, skin, templates) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, SHOWCASE.w, SHOWCASE.h);
  ctx.drawImage(card, 0, 0);
  ctx.fillStyle = skin;
  for (const [x, y, w, h] of SHOWCASE.skin) ctx.fillRect(x, y, w, h);
  for (const g of SHOWCASE.order)
    for (const { sx, sy, sw, dx, dy } of SHOWCASE.slices[g]) ctx.drawImage(templates[g], sx, sy, sw, 128, dx, dy, sw, 128);
}

export const canvasBlob = canvas => new Promise(r => canvas.toBlob(r, "image/png"));

// Each layer as its own full-size PNG, numbered from the bottom (01), in a .zip (JSZip, loaded by index.html).
export async function layersZip(layers, images) {
  if (typeof JSZip === "undefined") throw new Error("Layer download couldn't load. Reload the page and try again.");
  const c = newCanvas(), ctx = c.getContext("2d"), zip = new JSZip();
  for (const [i, l] of layers.entries()) {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(images.get(l.src), l.x, l.y);
    const name = l.name.replace(/[<>:"/\\|?*]/g, "_").trim();
    zip.file(`${String(i + 1).padStart(2, "0")} ${name}.png`, await canvasBlob(c));
  }
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}

export function saveBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
