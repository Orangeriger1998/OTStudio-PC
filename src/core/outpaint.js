'use strict';
// Geometry for Expand: the picture sits in the middle of a larger canvas of the new shape. FLUX Fill dev paints the
// new area on a copy of the canvas that fits in 1440 by 1440, and OT Studio then rebuilds the result at full size with
// the original picture on top, so the original part keeps every pixel.

const RATIOS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:3': [4, 3], '3:4': [3, 4], '3:2': [3, 2], '2:3': [2, 3], '21:9': [21, 9], '4:5': [4, 5], '5:4': [5, 4] };
const RATIO_NAMES = { '16:9': 'Wide (16:9)', '9:16': 'Tall (9:16)', '1:1': 'Square', '4:3': '4:3', '3:4': '3:4', '3:2': '3:2', '2:3': '2:3', '21:9': 'Very wide (21:9)', '4:5': '4:5', '5:4': '5:4' };
const MAX_SIDE = 1440;

class ShapeError extends Error {}

/** The plan for expanding a [width] by [height] picture to [ratio]. */
function plan(width, height, ratio, maxSide = MAX_SIDE) {
  const r = RATIOS[ratio];
  if (!r) throw new ShapeError('Choose a shape.');
  if (!(width > 0 && height > 0)) throw new ShapeError('The picture size is unknown.');
  const target = r[0] / r[1];
  const current = width / height;
  if (Math.abs(target - current) / current < 0.02) throw new ShapeError('The picture already has that shape.');
  let canvasW = width;
  let canvasH = height;
  if (target > current) canvasW = Math.round(height * target); else canvasH = Math.round(width / target);
  const left = Math.floor((canvasW - width) / 2);
  const top = Math.floor((canvasH - height) / 2);
  const scale = Math.min(1, maxSide / canvasW, maxSide / canvasH);
  const sendW = Math.max(256, Math.floor((canvasW * scale) / 16) * 16);
  const sendH = Math.max(256, Math.floor((canvasH * scale) / 16) * 16);
  return { ratio, width, height, canvasW, canvasH, left, top, sendW, sendH };
}

/** Where the picture sits on the canvas that is sent, and which sides border new area. */
function sendLayout(p) {
  const sx = p.sendW / p.canvasW;
  const sy = p.sendH / p.canvasH;
  const w = Math.max(1, Math.round(p.width * sx));
  const h = Math.max(1, Math.round(p.height * sy));
  const left = Math.min(p.sendW - w, Math.round(p.left * sx));
  const top = Math.min(p.sendH - h, Math.round(p.top * sy));
  return { w, h, left, top, right: p.sendW - w - left, bottom: p.sendH - h - top };
}

/** The sides of the picture that touch new area: { left, right, top, bottom } as booleans. */
function openSides(p) {
  return { left: p.left > 0, right: p.canvasW - p.width - p.left > 0, top: p.top > 0, bottom: p.canvasH - p.height - p.top > 0 };
}

/**
 * One alpha byte per pixel for the original picture: solid inside, fading to clear over [feather] pixels along the
 * sides that touch new area, so the seam blends into the painted part.
 */
function featherMask(width, height, sides, feather) {
  const out = Buffer.alloc(width * height, 255);
  if (feather <= 0) return out;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let d = feather;
      if (sides.left) d = Math.min(d, x);
      if (sides.right) d = Math.min(d, width - 1 - x);
      if (sides.top) d = Math.min(d, y);
      if (sides.bottom) d = Math.min(d, height - 1 - y);
      if (d < feather) out[y * width + x] = Math.round((255 * d) / feather);
    }
  }
  return out;
}

module.exports = { RATIOS, RATIO_NAMES, MAX_SIDE, plan, sendLayout, openSides, featherMask, ShapeError };
