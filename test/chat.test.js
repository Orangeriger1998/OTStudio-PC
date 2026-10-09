'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const chatplan = require('../src/core/chatplan');
const { createChat } = require('../src/main/chat');
const { createStore } = require('../src/main/store');
const { createNet } = require('../src/main/netguard');

const pic = { id: 'p1', kind: 'image', state: 'done', files: ['img-p1-0.png'], prompt: 'a woman on a beach' };
const vid = { id: 'v1', kind: 'video', state: 'done', files: ['vid-v1-0.mp4'], prompt: 'she walks', service: 'replicate', model: 'wan-video/wan-2.2-i2v-fast', options: {} };
const raw = (o) => ({ action: 'answer', target: 'none', shape: 'keep', seconds: 0, prompt: '', reply: '', ...o });

test('plans: the app, not the model, decides which picture is used', () => {
  const ctx = { attached: [], lastPicture: pic, lastVideo: vid };
  assert.deepEqual(chatplan.resolve(raw({ action: 'edit', target: 'attached_photo', prompt: 'remove the person' }), 'remove the person', ctx),
    { action: 'edit', source: 'img-p1-0.png', sourceKind: 'last', prompt: 'remove the person' });
  const withPhoto = { ...ctx, attached: ['in-a.png'] };
  assert.equal(chatplan.resolve(raw({ action: 'edit', target: 'last_picture', prompt: 'beach behind her' }), 'put a beach behind her', withPhoto).source, 'in-a.png');
  assert.deepEqual(chatplan.resolve(raw({ action: 'edit', prompt: 'x' }), 'x', { attached: [] }), { error: 'Attach a photo with the photo button, or make a picture first.' });
});

test('plans: continuing a video and shapes are corrected by plain rules', () => {
  const ctx = { attached: [], lastPicture: pic, lastVideo: vid };
  const longer = chatplan.resolve(raw({ action: 'make_video', target: 'last_video', prompt: 'she walks into the sea' }), 'continue the video, she walks into the sea', ctx);
  assert.equal(longer.action, 'make_longer');
  assert.equal(longer.parent, 'v1');
  assert.equal(chatplan.resolve(raw({ action: 'make_longer', prompt: 'continue the video' }), 'make the video longer', ctx).prompt, 'she walks', 'a bare request keeps the earlier description');
  assert.equal(chatplan.resolve(raw({ action: 'expand', shape: 'keep', prompt: 'keep' }), 'make it taller for my phone screen', ctx).shape, '9:16');
  assert.equal(chatplan.resolve(raw({ action: 'expand', shape: 'wide', prompt: 'keep' }), 'make it wide', ctx).prompt, '', 'filler prompts are dropped for expand');
  assert.deepEqual(chatplan.resolve(raw({ action: 'expand', shape: 'keep' }), 'expand it', ctx), { error: 'Which shape should the picture take: wide, tall, square, or a ratio such as 4:3?' });
  assert.equal(chatplan.resolve(raw({ action: 'make_video', prompt: 'waves', seconds: 500 }), 'waves', ctx).seconds, 0, 'odd lengths are ignored');
  assert.deepEqual(chatplan.resolve({ action: 'rm -rf' }, 'x', ctx), { action: 'answer' }, 'unknown actions do nothing');
});

function setup({ plan, reply = 'A LoRA teaches the model a face.', picks = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otchat-'));
  const started = [];
  const history = [pic, vid];
  const jobs = {
    list: () => history,
    mediaPath: (n) => path.join(dir, n),
    form: async (service, model, kind) => (kind === 'image'
      ? { controls: [{ name: 'aspect_ratio', type: 'choice', choices: model.includes('schnell') ? ['1:1', '16:9', '9:16'] : ['1:1', '4:3', '16:9', '9:16'] }, { name: 'disable_safety_checker', type: 'switch', default: true }], pictures: model.includes('kontext') ? [{ name: 'input_image', max: 1 }] : [] }
      : { controls: [{ name: 'duration', type: 'number', min: 2, max: 10 }], pictures: [{ name: 'image', max: 1, required: !model.includes('alibaba') }] }),
    generate: async (req) => { started.push(req); const e = { id: `j${started.length}`, kind: req.kind, state: 'running', files: [], prompt: req.prompt }; history.unshift(e); return e; },
    expand: async (req) => { started.push({ expand: req }); return { id: 'x1' }; },
    upscale: async (req) => { started.push({ upscale: req }); return { id: 'u1' }; },
    lastFrame: async () => 'in-frame.png',
    info: (svc, model) => (model === 'alibaba/wan-2.7' ? { pricing_skus: { duration_seconds: '0.1' } } : null),
    mark: (id, patch) => { const e = history.find((x) => x.id === id); if (e) Object.assign(e, patch); },
    remove: (ids) => { const gone = history.filter((e) => ids.includes(e.id)); gone.forEach((g) => history.splice(history.indexOf(g), 1)); return gone.map((g) => g.id); },
    discard: () => {},
  };
  const trashed = [];
  const chat = createChat({
    store: createStore(path.join(dir, 'data')), jobs, services: () => [],
    llm: { plan: async () => plan, reply: async () => reply },
    settings: () => ({ chatModel: 'gemma4-e2b:latest', last: {}, chatPicks: picks, editModel: 'black-forest-labs/flux-kontext-dev' }),
    trash: async (p) => { trashed.push(p); return true; }, notify: () => {},
  });
  return { chat, started, history, trashed };
}

test('chat: a plan waits for Go, and only Go starts the job', async () => {
  const { chat, started, history } = setup({ plan: raw({ action: 'edit', target: 'last_picture', prompt: 'change the jacket to a red top', reply: 'Here is the plan.' }) });
  const msg = await chat.send('change her jacket to a red top');
  assert.equal(msg.state, 'proposed');
  assert.match(msg.summary, /Edit the last picture with FLUX Kontext dev \(edit\) on Replicate/);
  assert.equal(msg.price, 'about 2.5 cents');
  assert.equal(started.length, 0, 'nothing is sent before Go');
  await chat.go(msg.id);
  assert.equal(started.length, 1);
  assert.deepEqual(started[0].pictures, { input_image: ['img-p1-0.png'] });
  assert.equal(started[0].options.disable_safety_checker, true);
  assert.equal(history[0].chat, msg.id, 'the job knows its chat message, and its card shows on the Pictures tab');
  await assert.rejects(chat.go(msg.id), /already used/, 'Go works once');
});

test('chat: expand, make it longer, and questions', async () => {
  let s = setup({ plan: raw({ action: 'expand', shape: 'tall', prompt: 'keep' }) });
  let m = await s.chat.send('make it tall');
  await s.chat.go(m.id);
  assert.deepEqual(s.started[0], { expand: { source: 'img-p1-0.png', ratio: '9:16', prompt: '', safety: false } });

  s = setup({ plan: raw({ action: 'make_longer', prompt: 'she dives in', seconds: 5 }) });
  m = await s.chat.send('keep going, she dives in, 5 seconds');
  await s.chat.go(m.id);
  assert.deepEqual(s.started[0].pictures, { image: ['in-frame.png'] });
  assert.deepEqual(s.started[0].op, { type: 'longer', parent: 'v1' });
  assert.equal(s.started[0].options.duration, 5);

  s = setup({ plan: raw({ action: 'answer' }) });
  m = await s.chat.send('what is a LoRA?');
  assert.equal(m.text, 'A LoRA teaches the model a face.');
  assert.equal(m.plan, undefined);
});

test('chat: clearing keeps pictures, unless asked to delete them, and then only the chat ones go', async () => {
  const s = setup({ plan: raw({ action: 'make_picture', prompt: 'a lighthouse' }) });
  const m = await s.chat.send('a lighthouse');
  await s.chat.go(m.id);
  s.history[0].state = 'done';
  s.history[0].saved = ['C:/Pictures/OT Studio/OTStudio-1.png'];
  await s.chat.clear(false);
  assert.equal(s.chat.list().length, 0);
  assert.equal(s.history.length, 3, 'clear chat keeps every picture');
  const m2 = await s.chat.send('a lighthouse');
  await s.chat.go(m2.id);
  s.history[0].state = 'done';
  s.history[0].saved = ['C:/Pictures/OT Studio/OTStudio-2.png'];
  const r = await s.chat.clear(true);
  assert.equal(r.removed, 1);
  assert.deepEqual(s.trashed, ['C:/Pictures/OT Studio/OTStudio-2.png']);
  assert.ok(s.history.some((e) => e.id === 'p1'), 'pictures from the other tabs stay');
});

test('only the local Ollama port is reachable without https', async () => {
  const net = createNet(() => [], async () => new Response('{}'), () => ['http://127.0.0.1:11434']);
  await net.request('http://127.0.0.1:11434/api/tags');
  await assert.rejects(net.request('http://127.0.0.1:8080/x'), /not allowed/);
  await assert.rejects(net.request('http://localhost.evil.com:11434/x'), /not allowed/);
  await assert.rejects(net.request('http://192.168.1.5:11434/api/tags'), /not allowed/);
});

test('a ratio the user types reaches the model shape setting, even when the chat model leaves it in the prompt', async () => {
  const words = 'A professional studio photo of a bald man with black glasses. 4:3 aspect ratio.';
  const plan = chatplan.resolve(raw({ action: 'make_picture', shape: 'keep', prompt: words }), words, { attached: [] });
  assert.equal(plan.shape, '4:3');
  assert.equal(plan.prompt, 'A professional studio photo of a bald man with black glasses.');
  assert.equal(chatplan.ratioFromText('a city skyline at 10:30 pm'), null, 'clock times are not shapes');
  assert.equal(chatplan.nearestRatio('4:3', ['match_input_image', '1:1', '16:9', '3:2']), '3:2');
  assert.equal(chatplan.resolve(raw({ action: 'expand', shape: 'keep' }), 'expand it to 7:5', { attached: [], lastPicture: pic }).shape, '4:3', 'expand takes the closest shape it knows');

  const s = setup({ plan: raw({ action: 'make_picture', shape: 'keep', prompt: words }) });
  const m = await s.chat.send(words);
  assert.equal(m.settingsLine, 'Settings: Shape 4:3.');
  await s.chat.go(m.id);
  assert.equal(s.started[0].options.aspect_ratio, '4:3');

  // A model without 4:3 gets its closest shape, and the plan line says so before Go.
  const t = setup({ plan: raw({ action: 'make_picture', shape: 'keep', prompt: words }), picks: { image: { service: 'replicate', model: 'black-forest-labs/flux-schnell' } } });
  const n = await t.chat.send(words);
  assert.equal(n.settingsLine, 'Settings: Shape 16:9 (the closest this model offers to 4:3).');
  await t.chat.go(n.id);
  assert.equal(t.started[0].options.aspect_ratio, '16:9');
});

test('settings named in a message reach the request and the Go line; ones the model lacks are named', async () => {
  const words = 'a lighthouse at dusk, 4:3, safety off, with sound';
  const s = setup({ plan: raw({ action: 'make_picture', prompt: 'a lighthouse at dusk' }) });
  const m = await s.chat.send(words);
  assert.equal(m.settingsLine, 'Settings: Shape 4:3 · Safety checker off.');
  assert.equal(m.notesLine, 'Not on this model: Sound.');
  await s.chat.go(m.id);
  assert.equal(s.started[0].options.aspect_ratio, '4:3');
  assert.equal(s.started[0].options.disable_safety_checker, true);

  const u = setup({ plan: raw({ action: 'upscale' }) });
  const n = await u.chat.send('upscale it 2x and enhance the faces');
  assert.equal(n.settingsLine, 'Settings: 2 times larger · Faces enhanced.');
  await u.chat.go(n.id);
  assert.deepEqual(u.started[0], { upscale: { source: 'img-p1-0.png', scale: 2, faceEnhance: true } });
});

test('an OpenRouter video price comes from its own per-second price and the length asked for', async () => {
  const s = setup({ plan: raw({ action: 'make_video', prompt: 'waves at night' }), picks: { video: { service: 'replicate', model: 'alibaba/wan-2.7' } } });
  const m = await s.chat.send('waves at night, 10 seconds');
  assert.equal(m.price, 'about $1.00');
  assert.ok(m.settingsLine.includes('Length 10 seconds'));
});

test('chat: picture labels survive the chat model, and a one-picture editing model is named before Go', async () => {
  const words = 'Take the facial expression of @img1 and apply it to the woman in @img2';
  const s = setup({ plan: raw({ action: 'edit', target: 'attached_photo', prompt: 'Apply the facial expression to the woman.' }) });
  const m = await s.chat.send(words, ['in-a.png', 'in-b.png']);
  assert.equal(m.plan.prompt, words, 'the labels are kept even when the chat model drops them');
  assert.match(m.notesLine, /takes only 1 picture/);
});
