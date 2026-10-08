'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const lora = require('../src/core/lora');
const { zip } = require('../src/main/zip');
const { createLoras } = require('../src/main/loras');
const { createJobs } = require('../src/main/jobs');
const { createNet } = require('../src/main/netguard');
const { createStore } = require('../src/main/store');
const { BUILTIN_HOSTS } = require('../src/core/builtins');

const VERSION = 'a'.repeat(64);

test('library files from the phone app and the LoRA Trainer are read and written the same way', () => {
  const file = JSON.stringify({ format: 'otstudio-lora-v1', name: 'Anna face', reference: `orangetiger/lora-anna-face/${VERSION}`, trigger_word: 'ANNAFACE', scale: 1.0, base_model: 'flux-dev' });
  const item = lora.parse(file);
  assert.deepEqual(item, { name: 'Anna face', reference: `orangetiger/lora-anna-face/${VERSION}`, trigger: 'ANNAFACE', scale: 1, baseModel: 'flux-dev' });
  assert.deepEqual(lora.parse(lora.toFile(item)), item);
  assert.throws(() => lora.parse(JSON.stringify({ ...JSON.parse(file), extra: 1 })), /OT Studio LoRA file/);
  assert.throws(() => lora.validate({ ...item, baseModel: 'wan' }), /FLUX dev/);
  assert.throws(() => lora.validate({ ...item, reference: '../../x' }), /owner\/model/);
  assert.throws(() => lora.validate({ ...item, reference: 'https://user:pw@example.com/w.safetensors' }), /without a user name/);
  assert.throws(() => lora.validate({ ...item, scale: 5 }), /between -1 and 3/);
});

test('trigger words, model names, prompts, and progress', () => {
  assert.equal(lora.suggestTrigger('Mark face'), 'MARKFACE');
  assert.equal(lora.suggestTrigger('Al'), 'ALLORA');
  assert.equal(lora.suggestTrigger('2024 trip'), 'OT2024TRIP');
  assert.equal(lora.destinationSlug('Anna Face!'), 'lora-anna-face');
  assert.equal(lora.withTrigger('on a beach', 'ANNAFACE'), 'ANNAFACE on a beach');
  assert.equal(lora.withTrigger('photo of annaface on a beach', 'ANNAFACE'), 'photo of annaface on a beach');
  assert.equal(lora.progress('flux_train  250/1000 [01:00<03:00]\n 500/1000', 1000), 0.5);
  assert.equal(lora.progress('loading 3/12 shards', 1000), null, 'counts out of another total are ignored');
  assert.ok(lora.OWN.test(`me/lora-x/${VERSION}`));
});

test('the ZIP writer makes archives that standard tools open', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otzip-'));
  const file = path.join(dir, 'p.zip');
  fs.writeFileSync(file, zip([{ name: 'photo-01.jpg', data: Buffer.from('hello world '.repeat(100)) }, { name: 'photo-02.jpg', data: Buffer.from([1, 2, 3]) }]));
  const out = execFileSync('python', ['-I', '-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(",".join(z.namelist()), len(z.read("photo-01.jpg")))', file]).toString().trim();
  assert.equal(out, 'photo-01.jpg,photo-02.jpg 1200');
});

function json(status, value) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }

test('training: photos are screened, the private model is made, training starts once, and the result joins the library', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otlora-'));
  const media = path.join(dir, 'media');
  fs.mkdirSync(media);
  const calls = [];
  let polls = 0;
  const routes = [
    { url: 'https://api.replicate.com/v1/account', reply: () => json(200, { username: 'tiger' }) },
    { url: 'https://api.replicate.com/v1/models/tiger/lora-anna-face', reply: () => json(404, { detail: 'not found' }) },
    { method: 'POST', url: 'https://api.replicate.com/v1/models', reply: (o) => { const b = JSON.parse(o.body); assert.equal(b.visibility, 'private'); return json(201, { owner: b.owner, name: b.name, visibility: 'private' }); } },
    { method: 'POST', url: `https://api.replicate.com/v1/models/${lora.TRAINER}/versions/${lora.TRAINER_VERSION}/trainings`, reply: (o) => { const b = JSON.parse(o.body); assert.equal(b.destination, 'tiger/lora-anna-face'); assert.equal(b.input.trigger_word, 'ANNAFACE'); assert.equal(b.input.input_images, 'https://api.replicate.com/v1/files/zip1'); return json(201, { id: 'tr1', status: 'starting' }); } },
    { url: 'https://api.replicate.com/v1/trainings/tr1', reply: () => (++polls === 1 ? json(200, { id: 'tr1', status: 'processing', logs: ' 400/1000 ' }) : json(200, { id: 'tr1', status: 'succeeded', output: { version: `tiger/lora-anna-face:${VERSION}`, weights: 'https://replicate.delivery/w.tar' } })) },
  ];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts.method });
    const r = routes.find((x) => (x.method || 'GET') === opts.method && x.url === url);
    if (!r) throw new Error(`unexpected ${opts.method} ${url}`);
    return r.reply(opts);
  };
  const net = createNet(() => BUILTIN_HOSTS, fetchImpl);
  let clock = 1000;
  const uploads = [];
  const loras = createLoras({
    store: createStore(path.join(dir, 'data')), keys: { get: () => 'r8_test1234' }, net, mediaDir: media,
    upload: async (buf, name, type) => { uploads.push({ size: buf.length, name, type }); return 'https://api.replicate.com/v1/files/zip1'; },
    notify: () => {}, now: () => clock,
  });
  const good = path.join(dir, 'good.png');
  const small = path.join(dir, 'small.png');
  fs.writeFileSync(good, await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#a06040' } }).png().toBuffer());
  fs.writeFileSync(small, await sharp({ create: { width: 400, height: 300, channels: 3, background: '#a06040' } }).png().toBuffer());
  const a = await loras.addPhoto(good);
  const b = await loras.addPhoto(small);
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
  assert.match(b.reason, /too small/);
  const meta = await sharp(path.join(media, a.name)).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(Math.max(meta.width, meta.height), 2048, 'large photos are reduced to 2048 pixels');
  const record = await loras.train({ name: 'Anna face', trigger: 'ANNAFACE', photos: [a.name], steps: 1000, rank: 16 });
  assert.equal(record.state, 'starting');
  assert.equal(uploads[0].type, 'application/zip');
  assert.equal(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/trainings')).length, 1);
  clock += 31000; loras.tick(); await new Promise((r) => setTimeout(r, 30));
  assert.equal(loras.state().trainings[0].progress, 0.4);
  clock += 31000; loras.tick(); await new Promise((r) => setTimeout(r, 30));
  const st = loras.state();
  assert.equal(st.trainings[0].state, 'succeeded');
  assert.deepEqual(st.library.map((l) => [l.name, l.reference, l.trigger]), [['Anna face', `tiger/lora-anna-face/${VERSION}`, 'ANNAFACE']]);
  await assert.rejects(loras.train({ name: 'x', trigger: '9bad', photos: [a.name] }), /trigger word/);
});

test('pictures with a trained LoRA run on its own version, with guidance renamed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otown-'));
  let created;
  const schema = { components: { schemas: { Input: { properties: { prompt: { type: 'string' }, guidance_scale: { type: 'number' }, num_outputs: { type: 'integer' } }, required: ['prompt'] } } } };
  const fetchImpl = async (url, opts) => {
    if (url === `https://api.replicate.com/v1/models/tiger/lora-anna-face/versions/${VERSION}`) return json(200, { id: VERSION, openapi_schema: schema });
    if (url === 'https://api.replicate.com/v1/predictions' && opts.method === 'POST') { created = JSON.parse(opts.body); return json(201, { id: 'p9', status: 'starting' }); }
    throw new Error(`unexpected ${url}`);
  };
  const jobs = createJobs({
    store: createStore(path.join(dir, 'data')), keys: { get: () => 'r8_test1234', has: () => true }, net: createNet(() => BUILTIN_HOSTS, fetchImpl),
    mediaDir: path.join(dir, 'media'), services: () => [], approveHost: async () => false, approvedHosts: () => BUILTIN_HOSTS, notify: () => {},
  });
  await jobs.generate({ kind: 'image', service: 'replicate', model: lora.MODEL, prompt: 'ANNAFACE on a beach', options: { lora_weights: `tiger/lora-anna-face/${VERSION}`, lora_scale: 1, guidance: 3, num_outputs: 2, go_fast: true } });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(created, { version: VERSION, input: { prompt: 'ANNAFACE on a beach', guidance_scale: 3, num_outputs: 2 } });
});
