'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const outpaint = require('../src/core/outpaint');
const imaging = require('../src/main/imaging');
const video = require('../src/main/video');
const { execFileSync } = require('child_process');

test('expand geometry: wide and tall canvases, sizes the model accepts', () => {
  const wide = outpaint.plan(1000, 1000, '16:9');
  assert.deepEqual([wide.canvasW, wide.canvasH, wide.left, wide.top], [1778, 1000, 389, 0]);
  assert.ok(wide.sendW <= 1440 && wide.sendH <= 1440 && wide.sendW % 16 === 0 && wide.sendH % 16 === 0);
  const tall = outpaint.plan(1600, 900, '9:16');
  assert.equal(tall.canvasW, 1600);
  assert.equal(tall.canvasH, 2844);
  assert.deepEqual(outpaint.openSides(tall), { left: false, right: false, top: true, bottom: true });
  assert.throws(() => outpaint.plan(1600, 900, '16:9'), /already has that shape/);
  assert.throws(() => outpaint.plan(1600, 900, '7:2'), /Choose a shape/);
});

test('the feather fades only along open sides', () => {
  const m = outpaint.featherMask(10, 4, { left: true, right: false, top: false, bottom: false }, 4);
  assert.equal(m[0], 0);
  assert.equal(m[2], 128);
  assert.equal(m[9], 255, 'the closed right side stays solid');
  assert.equal(m[3 * 10 + 9], 255);
});

test('expand inputs and the full-size result keep the original pixels', async () => {
  const src = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer();
  const { plan, canvas, mask } = await imaging.expandInputs(src, '9:16');
  const cm = await sharp(canvas).metadata();
  const mm = await sharp(mask).metadata();
  assert.deepEqual([cm.width, cm.height], [plan.sendW, plan.sendH]);
  assert.deepEqual([mm.width, mm.height], [plan.sendW, plan.sendH]);
  const maskRaw = await sharp(mask).extractChannel(0).raw().toBuffer();
  assert.equal(maskRaw[0], 255, 'the new area at the top is painted');
  assert.equal(maskRaw[Math.floor(plan.sendH / 2) * plan.sendW + Math.floor(plan.sendW / 2)], 0, 'the middle is kept');
  // A stand-in for the model's answer: a blue canvas of the size that was sent.
  const painted = await sharp({ create: { width: plan.sendW, height: plan.sendH, channels: 3, background: { r: 30, g: 30, b: 220 } } }).png().toBuffer();
  const out = await imaging.expandResult(src, painted, plan);
  const meta = await sharp(out).metadata();
  assert.deepEqual([meta.width, meta.height], [plan.canvasW, plan.canvasH]);
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
  const mid = at(Math.floor(plan.canvasW / 2), Math.floor(plan.canvasH / 2));
  assert.ok(mid[0] > 180 && mid[2] < 70, `the middle is the original red, got ${mid}`);
  assert.ok(at(5, 5)[2] > 100, 'the top is the painted area');
});

test('upscale limit matches the provider', () => {
  assert.equal(imaging.UPSCALE_MAX_PIXELS, 2096704);
  assert.ok(1440 * 1440 <= imaging.UPSCALE_MAX_PIXELS);
});

test('videos: last frame and joining parts with and without sound', { timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otvid-'));
  const ff = video.ffmpegPath();
  const a = path.join(dir, 'a.mp4');
  const b = path.join(dir, 'b.mp4');
  execFileSync(ff, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=16:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', a]);
  execFileSync(ff, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=24:duration=1.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', b]);
  const info = await video.probe(a);
  assert.equal(info.width, 320);
  assert.equal(info.hasAudio, true);
  const frame = path.join(dir, 'last.png');
  await video.lastFrame(a, frame);
  assert.deepEqual([(await sharp(frame).metadata()).width, (await sharp(frame).metadata()).height], [320, 240]);
  const out = path.join(dir, 'joined.mp4');
  await video.join([a, b], out);
  const j = await video.probe(out);
  assert.equal(j.width, 320, 'the joined video keeps the first part\'s size');
  assert.ok(Math.abs(j.duration - 3.5) < 0.3, `about 3.5 seconds, got ${j.duration}`);
  assert.equal(j.hasAudio, true);
});
