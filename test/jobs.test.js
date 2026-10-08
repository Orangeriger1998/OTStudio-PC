'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createJobs } = require('../src/main/jobs');
const { createNet } = require('../src/main/netguard');
const { createStore } = require('../src/main/store');
const { BUILTINS, BUILTIN_HOSTS } = require('../src/core/builtins');
const service = require('../src/core/service');
const { allowed } = require('../src/core/hosts');

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fe0dc8b2a10000000049454e44ae426082', 'hex');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(32)]);

function json(status, value) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }

function setup(routes, { approve = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otjobs-'));
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts.method, headers: opts.headers, body: opts.body });
    const route = routes.find((r) => (r.method || 'GET') === opts.method && (typeof r.url === 'string' ? r.url === url : r.url.test(url)));
    if (!route) throw new Error(`unexpected ${opts.method} ${url}`);
    return route.reply(opts);
  };
  const hosts = [...BUILTIN_HOSTS];
  const net = createNet(() => hosts, fetchImpl);
  const store = createStore(path.join(dir, 'data'));
  const saved = { spicyapi: 'sk-spicy-test1234', openrouter: 'sk-or-test1234', replicate: 'r8_test1234' };
  const keys = { get: (s) => saved[s] || '', has: (s) => !!saved[s] };
  const asked = [];
  const jobs = createJobs({
    store, keys, net, mediaDir: path.join(dir, 'media'), services: () => BUILTINS.map((d) => service.validate(d)),
    approveHost: async (h) => { asked.push(h); if (approve) hosts.push(h); return approve; }, approvedHosts: () => hosts, notify: () => {},
  });
  return { jobs, calls, asked, dir };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

test('a SpicyAPI picture is sent once, downloaded, and kept', async () => {
  const { jobs, calls } = setup([
    { method: 'POST', url: 'https://api.spicyapi.com/v1/images/generations', reply: () => json(200, { id: 'img_1', data: [{ url: 'https://cdn.spicyapi.com/out/1.png' }] }) },
    { url: 'https://cdn.spicyapi.com/out/1.png', reply: () => new Response(PNG) },
  ]);
  const entry = await jobs.generate({ kind: 'image', service: 'spicyapi-image', model: 'spicy-image-1', prompt: 'a lighthouse', options: {} });
  await settle();
  const done = jobs.list().find((e) => e.id === entry.id);
  assert.equal(done.state, 'done');
  assert.equal(done.files.length, 1);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 1);
  const download = calls.find((c) => c.url.startsWith('https://cdn.spicyapi.com'));
  assert.equal(download.headers.Authorization, undefined, 'the key never goes to the storage host');
});

test('a lost connection after sending leaves the outcome unknown and is never retried', async () => {
  let posts = 0;
  const { jobs } = setup([{ method: 'POST', url: 'https://api.spicyapi.com/v1/images/generations', reply: () => { posts++; throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }); } }]);
  const entry = await jobs.generate({ kind: 'image', service: 'spicyapi-image', model: 'spicy-image-1', prompt: 'x', options: {} });
  await settle();
  jobs.tick();
  await settle();
  assert.equal(jobs.list().find((e) => e.id === entry.id).state, 'uncertain');
  assert.equal(posts, 1);
});

test('an OpenRouter video task is checked until it finishes, then downloaded with the key on its own origin', async () => {
  let checks = 0;
  const { jobs, calls } = setup([
    { method: 'POST', url: 'https://openrouter.ai/api/v1/videos', reply: () => json(202, { id: 'vid-9', polling_url: 'https://openrouter.ai/api/v1/videos/vid-9', status: 'pending' }) },
    { url: 'https://openrouter.ai/api/v1/videos/vid-9', reply: () => (++checks < 2 ? json(200, { status: 'in_progress' }) : json(200, { status: 'completed', unsigned_urls: ['https://openrouter.ai/api/v1/videos/vid-9/content?index=0'], usage: { cost: 0.4 } })) },
    { url: 'https://openrouter.ai/api/v1/videos/vid-9/content?index=0', reply: () => new Response(MP4) },
  ]);
  const entry = await jobs.generate({ kind: 'video', service: 'openrouter-video', model: 'alibaba/wan-2.7', prompt: 'waves', options: {} });
  await settle();
  const e = jobs.list().find((x) => x.id === entry.id);
  assert.equal(e.state, 'running');
  for (let i = 0; i < 2; i++) { e.nextPoll = 0; jobs.tick(); await settle(); }
  assert.equal(e.state, 'done');
  assert.equal(e.cost, 0.4);
  const body = JSON.parse(calls[0].body);
  assert.ok(!('frame_images' in body), 'no frames were chosen, so none are sent');
  assert.equal(calls.find((c) => c.url.includes('/content')).headers.Authorization, 'Bearer sk-or-test1234');
});

test('a result on an address nobody allowed is not downloaded', async () => {
  const { jobs, asked } = setup([
    { method: 'POST', url: 'https://api.spicyapi.com/v1/images/generations', reply: () => json(200, { data: [{ url: 'https://unknown.example/1.png' }] }) },
  ]);
  const entry = await jobs.generate({ kind: 'image', service: 'spicyapi-image', model: 'spicy-image-1', prompt: 'x', options: {} });
  await settle();
  const e = jobs.list().find((x) => x.id === entry.id);
  assert.deepEqual(asked, ['unknown.example']);
  assert.equal(e.state, 'failed');
  assert.match(e.error, /did not allow/);
  assert.equal(e.canRetryDownload, true);
});

test('an HTML page is never saved as a picture', async () => {
  const { jobs } = setup([
    { method: 'POST', url: 'https://api.spicyapi.com/v1/images/generations', reply: () => json(200, { data: [{ url: 'https://cdn.spicyapi.com/x.png' }] }) },
    { url: 'https://cdn.spicyapi.com/x.png', reply: () => new Response('<html>error</html>') },
  ]);
  const entry = await jobs.generate({ kind: 'image', service: 'spicyapi-image', model: 'spicy-image-1', prompt: 'x', options: {} });
  await settle();
  assert.equal(jobs.list().find((x) => x.id === entry.id).state, 'failed');
});

test('the network guard refuses unapproved hosts, plain http, and drops the key on a cross-origin redirect', async () => {
  const seen = [];
  const net = createNet(() => ['api.example.com', 'files.example.net'], async (url, opts) => {
    seen.push({ url, headers: { ...opts.headers } });
    if (url.includes('/start')) return new Response(null, { status: 302, headers: { location: 'https://files.example.net/out' } });
    return new Response('ok');
  });
  await assert.rejects(net.request('https://evil.example/x'), /not allowed/);
  await assert.rejects(net.request('http://api.example.com/x'), /not allowed/);
  await net.request('https://api.example.com/start', { headers: { Authorization: 'Bearer k' }, keyHeaders: ['Authorization'] });
  assert.equal(seen[0].headers.Authorization, 'Bearer k');
  assert.equal(seen[1].headers.Authorization, undefined);
  assert.equal(allowed('https://a.replicate.delivery/x', BUILTIN_HOSTS), true);
  assert.equal(allowed('https://replicate.delivery.evil.com/x', BUILTIN_HOSTS), false);
  assert.equal(allowed('https://openrouter.ai:8443/x', BUILTIN_HOSTS), false);
});

test('Replicate: pictures are uploaded, the prediction is checked, and stop works', async () => {
  const schema = { components: { schemas: { Input: { properties: { prompt: { type: 'string' }, input_image: { type: 'string', format: 'uri' } }, required: ['prompt'] } } } };
  const { jobs, calls, dir } = setup([
    { url: 'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-dev', reply: () => json(200, { owner: 'black-forest-labs', name: 'flux-kontext-dev', latest_version: { openapi_schema: schema } }) },
    { method: 'POST', url: 'https://api.replicate.com/v1/files', reply: () => json(201, { urls: { get: 'https://api.replicate.com/v1/files/f1' } }) },
    { method: 'POST', url: 'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-dev/predictions', reply: () => json(201, { id: 'p1', status: 'starting' }) },
    { method: 'POST', url: 'https://api.replicate.com/v1/predictions/p1/cancel', reply: () => json(200, { id: 'p1', status: 'canceled' }) },
  ]);
  const src = path.join(dir, 'me.png');
  fs.writeFileSync(src, PNG);
  const pic = jobs.addPicture(src);
  const entry = await jobs.generate({ kind: 'image', service: 'replicate', model: 'black-forest-labs/flux-kontext-dev', prompt: 'make it night', options: {}, pictures: { input_image: [pic] } });
  await settle();
  const create = calls.find((c) => c.url.endsWith('/predictions'));
  assert.deepEqual(JSON.parse(create.body), { input: { prompt: 'make it night', input_image: 'https://api.replicate.com/v1/files/f1' } });
  assert.equal(jobs.list().find((e) => e.id === entry.id).state, 'running');
  await jobs.cancel(entry.id);
  assert.equal(jobs.list().find((e) => e.id === entry.id).state, 'canceled');
  assert.deepEqual(jobs.remove([entry.id]), [entry.id]);
  assert.equal(fs.existsSync(path.join(dir, 'media', pic)), false, 'pictures only that job used are removed with it');
});
