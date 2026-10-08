'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/core/service');
const { BUILTINS } = require('../src/core/builtins');
const { parseSnippet } = require('../src/core/snippet');

const byId = (id) => service.validate(BUILTINS.find((d) => d.id === id));
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('every built-in service is a valid definition', () => {
  for (const d of BUILTINS) assert.doesNotThrow(() => service.validate(d), d.id);
});

test('SpicyAPI pictures: words only, key only in the header', () => {
  const d = byId('spicyapi-image');
  assert.equal(d.pictures.length, 0, 'SpicyAPI never takes a picture');
  const r = service.buildRequest(d, { prompt: 'a lighthouse', model: 'spicy-image-1', options: { n: 2 } }, 'sk-spicy-test');
  assert.equal(r.url, 'https://api.spicyapi.com/v1/images/generations');
  assert.equal(r.headers.Authorization, 'Bearer sk-spicy-test');
  const body = JSON.parse(r.body);
  assert.deepEqual(body, { model: 'spicy-image-1', prompt: 'a lighthouse', size: '832*1216', n: 2, style: 'photorealistic', enhance_prompt: false });
  assert.ok(!r.body.includes('sk-spicy-test'));
  assert.deepEqual(service.readStart(d, 200, { data: [{ url: 'https://cdn.spicyapi.com/a.png' }] }).media, [{ url: 'https://cdn.spicyapi.com/a.png' }]);
});

test('SpicyAPI video: Cinema settings go out under the shared field names, and tasks are read', () => {
  const d = byId('spicyapi-video');
  const body = JSON.parse(service.buildRequest(d, { prompt: 'waves', model: 'spicy-cinema-1', options: { cinema_shape: '21:9' } }, 'k-12345678').body);
  assert.deepEqual(body, { model: 'spicy-cinema-1', prompt: 'waves', aspect_ratio: '21:9', duration: 5, resolution: '720P' });
  const plain = JSON.parse(service.buildRequest(d, { prompt: 'waves', model: 'spicy-video-1', options: {} }, 'k-12345678').body);
  assert.deepEqual(plain, { model: 'spicy-video-1', prompt: 'waves', aspect_ratio: '16:9' });
  assert.deepEqual(service.readStart(d, 200, { id: 'task_1', status: 'queued' }), { state: 'running', status: 'queued', taskId: 'task_1' });
  assert.equal(service.pollRequest(d, 'task_1', 'k').url, 'https://api.spicyapi.com/v1/videos/tasks/task_1');
  assert.deepEqual(service.readPoll(d, 200, { status: 'succeeded', output: { video_url: 'https://cdn.spicyapi.com/v.mp4' } }).media, [{ url: 'https://cdn.spicyapi.com/v.mp4' }]);
  assert.equal(service.readPoll(d, 200, { status: 'failed', error: 'content refused' }).error, 'content refused');
});

const wan = { id: 'alibaba/wan-2.7', supported_resolutions: ['720p', '1080p'], supported_aspect_ratios: ['16:9', '9:16'], supported_durations: [2, 5, 10], supported_frame_images: ['first_frame', 'last_frame'], generate_audio: true, seed: true };
const hailuo = { id: 'minimax/hailuo-2.3', supported_resolutions: ['1080p'], supported_aspect_ratios: ['16:9'], supported_durations: [6, 10], supported_frame_images: ['first_frame'], generate_audio: false, seed: null };

test('OpenRouter video: the exact frame_images shape, with per-model settings', () => {
  const d = byId('openrouter-video');
  const r = service.buildRequest(d, { prompt: 'she dances', model: 'alibaba/wan-2.7', options: { duration: '10', generate_audio: true }, pictures: { first_frame: [PNG] } }, 'sk-or-x', wan);
  const body = JSON.parse(r.body);
  assert.deepEqual(body.frame_images, [{ type: 'image_url', image_url: { url: PNG }, frame_type: 'first_frame' }]);
  assert.equal(body.duration, 10, 'durations are sent as numbers');
  assert.equal(body.generate_audio, true);
  assert.ok(!('first_frame' in body) && !('last_frame' in body), 'no stray top-level frame fields');
  const labels = service.controls(d, 'minimax/hailuo-2.3', hailuo).map((c) => c.name);
  assert.ok(!labels.includes('generate_audio') && !labels.includes('seed'), 'settings a model lacks are hidden');
  assert.deepEqual(service.pictureInputs(d, hailuo).map((p) => p.name), ['first_frame'], 'only the frames the model takes');
  assert.throws(() => service.buildRequest(d, { prompt: 'x', model: 'alibaba/wan-2.7', options: { duration: 7 } }, 'k', wan), /cannot be "7"/);
});

test('OpenRouter video tasks: finished, failed, and the actual cost', () => {
  const d = byId('openrouter-video');
  const start = service.readStart(d, 202, { id: 'job-1', polling_url: 'https://openrouter.ai/api/v1/videos/job-1', status: 'pending' });
  assert.equal(start.state, 'running');
  assert.equal(start.taskId, 'job-1');
  const done = service.readPoll(d, 200, { status: 'completed', unsigned_urls: ['https://openrouter.ai/api/v1/videos/job-1/content?index=0'], usage: { cost: 0.5 } });
  assert.equal(done.state, 'done');
  assert.equal(done.cost, 0.5);
  for (const s of ['failed', 'cancelled', 'expired']) assert.equal(service.readPoll(d, 200, { status: s }).state, 'failed');
  assert.equal(service.readPoll(d, 200, { status: 'in_progress' }).state, 'running');
});

test('OpenRouter pictures: references repeat, base64 results are read with their type', () => {
  const d = byId('openrouter-image');
  const info = { supported_parameters: { aspect_ratio: { type: 'enum', values: ['1:1', '16:9'] }, n: { type: 'range', min: 1, max: 4 }, input_references: { type: 'range', min: 0, max: 2 } } };
  const body = JSON.parse(service.buildRequest(d, { prompt: 'p', model: 'x/y', options: { aspect_ratio: '16:9' }, pictures: { references: [PNG, PNG] } }, 'k', info).body);
  assert.equal(body.input_references.length, 2);
  assert.throws(() => service.buildRequest(d, { prompt: 'p', model: 'x/y', pictures: { references: [PNG, PNG, PNG] } }, 'k', info), /at most 2/);
  const r = service.readStart(d, 200, { data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUg', media_type: 'image/png' }] });
  assert.deepEqual(r.media, [{ data: 'iVBORw0KGgoAAAANSUhEUg', type: 'image/png' }]);
});

test('definitions that would leak the key or wander to other hosts are refused', () => {
  const base = service.validate(BUILTINS[0]);
  const bad = (change) => assert.throws(() => service.validate({ ...JSON.parse(JSON.stringify(base)), ...change }), service.ServiceError);
  bad({ request: { ...base.request, body: { prompt: '{prompt}', token: '{key}' } } });
  bad({ request: { ...base.request, url: 'http://api.spicyapi.com/v1/x' } });
  bad({ request: { ...base.request, url: 'https://api.spicyapi.com/v1/x?key={key}' } });
  bad({ request: { ...base.request, headers: { Cookie: 'a' } } });
  bad({ request: { ...base.request, body: { text: 'no prompt here' } } });
  bad({ result: { mode: 'task', media: 'x', taskId: 'id', status: 's', done: ['ok'], poll: { url: 'https://elsewhere.example/{id}' } } });
});

test('a pasted example becomes a usable draft once the result is mapped', () => {
  const parsed = parseSnippet(`curl https://api.example.com/v1/images -H "Authorization: Bearer $KEY" -d '{"model":"m1","prompt":"x","steps":20,"image_url":"https://a/b.png","extra":{"a":1}}'`);
  const draft = service.draftFromSnippet(parsed, 'image');
  assert.equal(draft.request.body.prompt, '{prompt}');
  assert.equal(draft.request.body.model, '{model}');
  assert.equal(draft.request.body.steps, '{steps}');
  assert.equal(draft.request.body.image_url, '{image_url}');
  assert.deepEqual(draft.request.body.extra, { a: 1 });
  assert.deepEqual(draft.models.fixed, [{ id: 'm1', name: 'm1' }]);
  assert.deepEqual(draft.pictures.map((p) => p.name), ['image_url']);
  draft.result.media = 'data[*].url';
  const d = service.validate(draft);
  const body = JSON.parse(service.buildRequest(d, { prompt: 'a dog', model: 'm1', options: {} }, 'k-1234567').body);
  assert.deepEqual(body, { model: 'm1', prompt: 'a dog', steps: 20, extra: { a: 1 } });
  draft.notes.roles.steps = 'fixed';
  const again = service.applyRoles(draft);
  assert.equal(again.request.body.steps, 20);
  assert.ok(!again.options.some((o) => o.name === 'steps'));
});
