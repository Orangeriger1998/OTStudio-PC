'use strict';
// Picture work on this PC, with sharp: sizes, the canvas and mask for Expand, and the full-size Expand result.

const sharp = require('sharp');
const outpaint = require('../core/outpaint');

/** Real-ESRGAN on Replicate refuses pictures larger than this many pixels. */
const UPSCALE_MAX_PIXELS = 2096704;

/** The picture upright (camera rotation applied), as PNG, with its size. */
async function upright(input) {
  const { data, info } = await sharp(input, { failOn: 'none' }).rotate().removeAlpha().png().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function size(input) {
  const u = await upright(input);
  return { width: u.width, height: u.height };
}

/** The canvas and the mask that go to FLUX Fill dev. White in the mask is painted; black is kept. */
async function expandInputs(input, ratio) {
  const src = await upright(input);
  const p = outpaint.plan(src.width, src.height, ratio);
  const l = outpaint.sendLayout(p);
  const small = await sharp(src.data).resize(l.w, l.h, { fit: 'fill' }).toBuffer();
  let canvas;
  try {
    canvas = await sharp(small).extend({ top: l.top, bottom: l.bottom, left: l.left, right: l.right, extendWith: 'mirror' }).png().toBuffer();
  } catch {
    canvas = await sharp(small).extend({ top: l.top, bottom: l.bottom, left: l.left, right: l.right, background: '#808080' }).png().toBuffer();
  }
  // The kept area is a little smaller than the picture, so the painted part overlaps the edge and hides the seam.
  const sides = outpaint.openSides(p);
  const inset = 8;
  const mask = Buffer.alloc(p.sendW * p.sendH, 255);
  const x0 = l.left + (sides.left ? inset : 0);
  const x1 = l.left + l.w - (sides.right ? inset : 0);
  const y0 = l.top + (sides.top ? inset : 0);
  const y1 = l.top + l.h - (sides.bottom ? inset : 0);
  for (let y = Math.max(0, y0); y < Math.min(p.sendH, y1); y++) mask.fill(0, y * p.sendW + Math.max(0, x0), y * p.sendW + Math.min(p.sendW, x1));
  const maskPng = await sharp(mask, { raw: { width: p.sendW, height: p.sendH, channels: 1 } }).png().toBuffer();
  return { plan: p, canvas, mask: maskPng };
}

async function means(buf, region) {
  const { data } = await sharp(buf).extract(region).resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const m = [0, 0, 0];
  for (let i = 0; i < data.length; i += 3) { m[0] += data[i]; m[1] += data[i + 1]; m[2] += data[i + 2]; }
  return m.map((v) => v / (data.length / 3));
}

/**
 * The finished picture at full size: the painted canvas, color-matched to the original, with the original picture on
 * top and its open edges feathered into the painted part. Returns JPEG bytes.
 */
async function expandResult(input, result, p) {
  const src = await upright(input);
  if (src.width !== p.width || src.height !== p.height) throw new Error('The picture changed since the expand started.');
  const full = await sharp(result, { failOn: 'none' }).removeAlpha().resize(p.canvasW, p.canvasH, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const region = { left: p.left, top: p.top, width: p.width, height: p.height };
  const [want, got] = await Promise.all([means(src.data, { left: 0, top: 0, width: p.width, height: p.height }), means(full, region)]);
  const gains = want.map((w, i) => Math.min(1.25, Math.max(0.8, got[i] > 1 ? w / got[i] : 1)));
  const matched = await sharp(full).linear(gains, [0, 0, 0]).png().toBuffer();
  const feather = Math.max(8, Math.round(Math.min(p.width, p.height) * 0.02));
  const alpha = outpaint.featherMask(p.width, p.height, outpaint.openSides(p), feather);
  const top = await sharp(src.data).joinChannel(alpha, { raw: { width: p.width, height: p.height, channels: 1 } }).png().toBuffer();
  return sharp(matched).composite([{ input: top, left: p.left, top: p.top }]).jpeg({ quality: 95, mozjpeg: true }).toBuffer();
}

module.exports = { size, expandInputs, expandResult, UPSCALE_MAX_PIXELS };
