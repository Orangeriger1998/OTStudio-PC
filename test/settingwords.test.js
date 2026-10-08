'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extract, stripSettingWords } = require('../src/core/settingwords');
const replicate = require('../src/core/replicate');
const service = require('../src/core/service');
const { BUILTINS } = require('../src/core/builtins');

// Setting lists as the app builds them from each model's own schema (names, kinds, ranges, and choices).
const fluxDev = [
  { name: 'num_outputs', label: 'Number of pictures', type: 'number', integer: true, min: 1, max: 4, default: 1 },
  { name: 'num_inference_steps', label: 'Steps', type: 'number', integer: true, min: 1, max: 50, default: 28 },
  { name: 'guidance', label: 'Prompt strength', type: 'number', min: 0, max: 10, default: 3 },
  { name: 'output_format', label: 'File type', type: 'choice', choices: ['webp', 'jpg', 'png'], default: 'webp' },
  { name: 'output_quality', label: 'File quality', type: 'number', integer: true, min: 0, max: 100, default: 80 },
  { name: 'megapixels', label: 'Size in megapixels', type: 'choice', choices: ['1', '0.25'], default: '1' },
  { name: 'go_fast', label: 'Fast mode', type: 'switch', default: true },
  { name: 'seed', label: 'Seed', type: 'number', integer: true },
  { name: 'disable_safety_checker', label: 'Safety checker', type: 'switch', default: false },
  { name: 'lora_scale', label: 'LoRA strength', type: 'number', min: -1, max: 3, default: 1 },
];
const seedream = [
  { name: 'size', label: 'Size', type: 'choice', choices: ['2K', '4K', 'custom'], default: '2K' },
  { name: 'aspect_ratio', label: 'Shape', type: 'choice', choices: ['match_input_image', '1:1', '4:3', '16:9'] },
  { name: 'max_images', label: 'Number of pictures', type: 'number', integer: true, min: 1, max: 15, default: 1 },
  { name: 'disable_safety_checker', label: 'Safety checker', type: 'switch', default: true },
];
const wan22 = [
  { name: 'resolution', label: 'Resolution', type: 'choice', choices: ['480p', '720p'], default: '480p' },
  { name: 'num_frames', label: 'Length in frames (81 is 5 s)', type: 'number', integer: true, min: 81, max: 121, default: 81 },
  { name: 'frames_per_second', label: 'Frames per second', type: 'number', integer: true, min: 5, max: 30, default: 16 },
  { name: 'go_fast', label: 'Fast mode', type: 'switch', default: true },
  { name: 'seed', label: 'Seed', type: 'number', integer: true },
];
const flux11pro = [{ name: 'safety_tolerance', label: 'Safety tolerance', type: 'number', integer: true, min: 1, max: 6, default: 2 }, { name: 'seed', label: 'Seed', type: 'number' }];

test('pictures: count, steps, guidance by its own name, file type, quality, seed, fast mode, and the reversed safety switch', () => {
  const r = extract('a red fox in snow, 3 pictures, 40 steps, prompt strength 4.5, as PNG, quality 95, seed 1234, fast mode off, safety off, lora strength 0.8', fluxDev);
  assert.deepEqual(r.set, { guidance: 4.5, lora_scale: 0.8, num_outputs: 3, seed: 1234, num_inference_steps: 40, output_format: 'png', disable_safety_checker: true, go_fast: false, output_quality: 95 });
  assert.ok(r.shown.includes('Safety checker off'));
  assert.ok(r.shown.includes('Number of pictures 3'));
  assert.deepEqual(r.missing, []);
  assert.deepEqual(extract('safety checker on please', fluxDev).set, { disable_safety_checker: false }, '"on" keeps the checker on');
});

test('values are checked against the model, and missing settings are named', () => {
  const r = extract('a cat, 9 pictures, 99 steps, with sound, 1080p', fluxDev);
  assert.deepEqual(r.set, {});
  assert.deepEqual(r.missing.sort(), ['Resolution', 'Sound']);
  assert.equal(r.problems.length, 2);
  assert.match(r.problems.join(' '), /Number of pictures 9 is outside 1 to 4/);
  assert.match(r.problems.join(' '), /Steps 99 is outside 1 to 50/);
});

test('Seedream: 4K and several pictures go into its own settings', () => {
  const r = extract('a mountain lake in 4K, 4 pictures, safety off', seedream);
  assert.deepEqual(r.set, { size: '4K', max_images: 4, disable_safety_checker: true });
});

test('Wan 2.2 counts frames, so seconds become frames; resolution and seed apply', () => {
  const r = extract('she turns and smiles, 7 seconds, 720p, seed 7', wan22);
  assert.equal(r.set.num_frames, 113);
  assert.equal(r.set.resolution, '720p');
  assert.equal(r.set.seed, 7);
  assert.ok(r.shown.includes('Length 7 seconds (113 frames)'));
  assert.match(extract('a 20 second video', wan22).problems.join(), /outside 81 to 121/);
});

test('OpenRouter video and SpicyAPI pictures: their per-model settings work the same way', () => {
  const orv = service.validate(BUILTINS.find((d) => d.id === 'openrouter-video'));
  const wan27 = { supported_resolutions: ['720p', '1080p'], supported_aspect_ratios: ['16:9'], supported_durations: [2, 5, 10], supported_frame_images: ['first_frame'], generate_audio: true, seed: true };
  const r = extract('waves at night, 10 seconds, 1080p, with sound, seed 5', service.controls(orv, 'alibaba/wan-2.7', wan27));
  assert.deepEqual(r.set, { seed: 5, duration: 10, resolution: '1080p', generate_audio: true });
  const spicy = service.validate(BUILTINS.find((d) => d.id === 'spicyapi-image'));
  const s = extract('a castle, anime style, 2 pictures, negative prompt: blurry, text', service.controls(spicy, 'spicy-image-1', null));
  assert.deepEqual(s.set, { n: 2, negative_prompt: 'blurry, text', style: 'anime' });
});

test('FLUX 1.1 pro has a safety tolerance instead of a switch', () => {
  assert.deepEqual(extract('safety off', flux11pro).set, { safety_tolerance: 6 });
});

test('ordinary words are not settings', () => {
  const r = extract('A professional studio photo of a man in a 1970s tuxedo shirt, two people dancing, high quality, sharp focus', fluxDev);
  assert.deepEqual(r.set, {});
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.missing, []);
  assert.equal(stripSettingWords('A fox in snow. Seed 42. Negative prompt: blurry, text.'), 'A fox in snow.');
});

test('the safety checker label is never matched the wrong way round', () => {
  const doc = { components: { schemas: { Input: { properties: { prompt: { type: 'string' }, disable_safety_checker: { type: 'boolean', default: false } } } } } };
  const controls = replicate.parseSchema(doc, 'image', 'black-forest-labs/flux-dev');
  assert.deepEqual(extract('safety checker off', controls).set, { disable_safety_checker: true });
});
