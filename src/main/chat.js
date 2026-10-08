'use strict';
// The Chat tab. Each request goes to the local model for a plan (see src/core/chatplan.js); the app checks the plan,
// picks the service, the model, and the settings, and shows one line with the price and a Go button. Only Go starts a
// paid job, and the job is an ordinary history entry, so its card also appears on the Pictures or Videos tab.

const crypto = require('crypto');
const chatplan = require('../core/chatplan');
const replicate = require('../core/replicate');

const PRICES = {
  'black-forest-labs/flux-schnell': 'about 0.3 cents', 'black-forest-labs/flux-dev': 'about 2.5 cents', 'black-forest-labs/flux-1.1-pro': 'about 4 cents',
  'black-forest-labs/flux-dev-lora': 'about 3 cents', 'black-forest-labs/flux-kontext-dev': 'about 2.5 cents', 'qwen/qwen-image-edit-plus': 'about 3 cents',
  'qwen/qwen-image-edit': 'about 3 cents', 'bytedance/seedream-4.5': 'about 4 cents', 'black-forest-labs/flux-2-dev': 'about 3 cents',
  'black-forest-labs/flux-2-klein-9b': 'about 1.5 cents', 'prunaai/p-image-edit': 'about 1 cent',
};
const START_INPUTS = ['first_frame', 'image', 'start_image', 'first_frame_image'];
const PICTURE_TO_VIDEO = { service: 'replicate', model: 'wan-video/wan-2.2-i2v-fast' };
const WORDS_TO_VIDEO = { service: 'replicate', model: 'wan-video/wan-2.7-t2v' };
const ACTION_WORDS = { make_picture: 'Make a picture', make_video: 'Make a video', edit: 'Edit', expand: 'Expand', upscale: 'Upscale', make_longer: 'Make the video longer' };
const SHAPE_WORDS = { '16:9': 'wide (16:9)', '9:16': 'tall (9:16)', '1:1': 'square' };

class ChatError extends Error {}

function createChat({ store, jobs, llm, settings, services, trash, notify, now = () => Date.now() }) {
  let messages = store.read('chat', []);
  const save = () => { store.write('chat', messages.slice(-500)); notify(messages); };
  const add = (m) => { const msg = { id: crypto.randomUUID(), at: now(), ...m }; messages.push(msg); save(); return msg; };
  const find = (id) => messages.find((m) => m.id === id);

  function serviceName(id) {
    if (id === 'replicate') return 'Replicate';
    const d = services().find((s) => s.id === id);
    return d ? d.name : id;
  }
  function modelName(model) {
    for (const kind of ['image', 'video']) { const m = replicate.MODELS[kind].find(([id]) => id === model); if (m) return m[1]; }
    return model;
  }

  function context(attached) {
    const done = jobs.list().filter((e) => e.state === 'done' && e.files.length);
    return { attached, lastPicture: done.find((e) => e.kind === 'image') || null, lastVideo: done.find((e) => e.kind === 'video') || null };
  }

  function stateLine(ctx) {
    const pic = ctx.lastPicture ? `The last picture shows: ${ctx.lastPicture.prompt || 'a picture'}.` : 'There is no picture yet.';
    const vid = ctx.lastVideo ? `The last video shows: ${ctx.lastVideo.prompt || 'a video'}.` : 'There is no video yet.';
    return `App state: ${pic} ${vid} The user attached a photo: ${ctx.attached.length ? 'yes' : 'no'}.`.slice(0, 2000);
  }

  /** The service and model a plan uses, and its form, chosen by the app (never by the chat model). */
  async function choose(plan) {
    const s = settings();
    const valid = (pick, kind) => pick && pick.model && (pick.service === 'replicate' || services().some((d) => d.id === pick.service && d.kind === kind));
    const picks = s.chatPicks || {};
    let pick;
    // The models chosen in the Chat tab come first; then the ones last used on the tabs; then plain defaults.
    if (plan.action === 'make_picture') pick = valid(picks.image, 'image') ? picks.image : valid(s.last.image, 'image') ? s.last.image : { service: 'replicate', model: 'black-forest-labs/flux-dev' };
    else if (plan.action === 'edit') pick = { service: 'replicate', model: picks.edit || s.editModel || 'black-forest-labs/flux-kontext-dev' };
    else if (plan.action === 'make_video') pick = valid(picks.video, 'video') ? picks.video : valid(s.last.video, 'video') ? s.last.video : plan.source ? PICTURE_TO_VIDEO : WORDS_TO_VIDEO;
    else if (plan.action === 'make_longer') {
      const parent = jobs.list().find((e) => e.id === plan.parent);
      pick = parent ? { service: parent.service, model: parent.model } : PICTURE_TO_VIDEO;
    } else return null;
    const kind = plan.action === 'make_picture' || plan.action === 'edit' ? 'image' : 'video';
    let form = await jobs.form(pick.service, pick.model, kind, false);
    const needsStart = plan.source || plan.action === 'make_longer';
    if (kind === 'video' && needsStart && !form.pictures.some((p) => START_INPUTS.includes(p.name))) {
      pick = PICTURE_TO_VIDEO;
      form = await jobs.form(pick.service, pick.model, kind, false);
    }
    if (kind === 'video' && !needsStart && form.pictures.some((p) => p.required)) {
      pick = WORDS_TO_VIDEO;
      form = await jobs.form(pick.service, pick.model, kind, false);
    }
    return { ...pick, kind, form };
  }

  function summary(plan, pick) {
    const what = ACTION_WORDS[plan.action];
    const src = plan.sourceKind === 'attached' ? 'your photo' : plan.source ? 'the last picture' : '';
    if (plan.action === 'expand') return { line: `${what} ${src} to ${SHAPE_WORDS[plan.shape] || plan.shape} with FLUX Fill dev on Replicate.`, price: 'about 4 cents' };
    if (plan.action === 'upscale') return { line: `${what} ${src} 4 times with Real-ESRGAN on Replicate.`, price: 'less than 1 cent' };
    const where = `${modelName(pick.model)} on ${serviceName(pick.service)}`;
    const len = plan.seconds ? `, ${plan.seconds} seconds` : '';
    const lines = {
      make_picture: `${what} with ${where}.`,
      edit: `${what} ${src} with ${where}.`,
      make_video: `${what}${src ? ` from ${src}` : ''} with ${where}${len}.`,
      make_longer: `${what}: the next part starts from its last frame, with ${where}${len}.`,
    };
    return { line: lines[plan.action], price: PRICES[pick.model] || `billed by ${serviceName(pick.service)}` };
  }

  /** Handles one message: a plan with a Go button, an answer, or a question back. */
  async function send(text, attachments = []) {
    const words = String(text || '').trim().slice(0, 4000);
    const attached = (Array.isArray(attachments) ? attachments : []).map(String).slice(0, 14);
    for (const n of attached) jobs.mediaPath(n);
    if (!words && !attached.length) throw new ChatError('Write a message first.');
    const model = settings().chatModel;
    add({ role: 'user', text: words, attachments: attached });
    if (!model) return add({ role: 'assistant', text: 'Choose a chat model at the top of the Chat tab first.' });
    const ctx = context(attached);
    let raw;
    try { raw = await llm.plan(model, stateLine(ctx), words || 'Use the attached photo.'); }
    catch (e) { return add({ role: 'assistant', text: e.message, error: true }); }
    const plan = chatplan.resolve(raw, words, ctx);
    if (plan.error) return add({ role: 'assistant', text: plan.error });
    if (plan.action === 'answer') {
      const turns = messages.filter((m) => m.text).slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
      try { return add({ role: 'assistant', text: (await llm.reply(model, turns)) || 'I am not sure. Ask me for a picture or a video.' }); }
      catch (e) { return add({ role: 'assistant', text: e.message, error: true }); }
    }
    let pick = null;
    if (!['expand', 'upscale'].includes(plan.action)) {
      try { pick = await choose(plan); } catch (e) { return add({ role: 'assistant', text: e.message, error: true }); }
    }
    const { line, price } = summary(plan, pick || {});
    // The model's own sentence is left out: small models often say the work is already done.
    return add({ role: 'assistant', text: '', plan: { ...plan, service: pick && pick.service, model: pick && pick.model }, summary: line, price, state: 'proposed' });
  }

  function setOption(options, controls, name, value) {
    const c = controls.find((x) => x.name === name);
    if (!c || value === undefined || value === null) return;
    if (c.type === 'choice') { const m = (c.choices || []).find((x) => String(x) === String(value)); if (m !== undefined) options[name] = m; }
    else if (c.type === 'number') { if ((c.min === undefined || value >= c.min) && (c.max === undefined || value <= c.max)) options[name] = value; }
    else options[name] = value;
  }

  /** Starts the job a proposed plan describes. This is the only place a chat request can cost money. */
  async function go(id) {
    const msg = find(id);
    if (!msg || msg.state !== 'proposed' || !msg.plan) throw new ChatError('This plan was already used.');
    const plan = msg.plan;
    msg.state = 'starting';
    save();
    try {
      let entry;
      if (plan.action === 'expand') entry = await jobs.expand({ source: plan.source, ratio: plan.shape, prompt: plan.prompt, safety: false });
      else if (plan.action === 'upscale') entry = await jobs.upscale({ source: plan.source, scale: 4 });
      else {
        const pick = await choose(plan);
        const { controls, pictures: inputs } = pick.form;
        const options = {};
        for (const c of controls) if (c.name === 'disable_safety_checker' && c.default !== undefined) options[c.name] = c.default;
        const pictures = {};
        let op;
        let prompt = plan.prompt;
        if (plan.action === 'make_longer') {
          const parent = jobs.list().find((e) => e.id === plan.parent);
          if (!parent) throw new ChatError('The video to continue is gone.');
          if (parent.service === pick.service && parent.model === pick.model) Object.assign(options, parent.options || {});
          const target = inputs.find((p) => START_INPUTS.includes(p.name));
          pictures[target.name] = [await jobs.lastFrame(parent.id)];
          op = { type: 'longer', parent: parent.id };
        } else if (plan.action === 'edit') {
          const target = inputs[0];
          if (!target) throw new ChatError(`${modelName(pick.model)} takes no picture. Choose an editing model on the Pictures tab once, and the chat uses it from then on.`);
          const attached = messages.slice().reverse().find((m) => m.role === 'user' && m.attachments && m.attachments.includes(plan.source));
          const list = plan.sourceKind === 'attached' && attached ? attached.attachments : [plan.source];
          pictures[target.name] = list.slice(0, target.max || 1);
        } else if (plan.action === 'make_video' && plan.source) {
          const target = inputs.find((p) => START_INPUTS.includes(p.name)) || inputs[0];
          pictures[target.name] = [plan.source];
        }
        if (plan.shape) setOption(options, controls, 'aspect_ratio', plan.shape);
        if (plan.seconds) setOption(options, controls, 'duration', plan.seconds);
        entry = await jobs.generate({ kind: pick.kind, service: pick.service, model: pick.model, prompt, options, pictures, op });
      }
      jobs.mark(entry.id, { chat: msg.id });
      Object.assign(msg, { state: 'started', jobId: entry.id });
    } catch (e) {
      Object.assign(msg, { state: 'failed', error: e.message });
    }
    save();
    return msg;
  }

  function cancel(id) {
    const msg = find(id);
    if (msg && msg.state === 'proposed') { msg.state = 'canceled'; save(); }
    return msg;
  }

  /** Clears the conversation. With [deleteMedia], the chat's results leave the app too, and their saved copies go to the Recycle Bin. */
  async function clear(deleteMedia) {
    const attachments = messages.flatMap((m) => m.attachments || []);
    let removed = 0;
    let trashed = 0;
    if (deleteMedia) {
      const ids = new Set(messages.map((m) => m.jobId).filter(Boolean));
      const entries = jobs.list().filter((e) => ids.has(e.id) || (e.chat && messages.some((m) => m.id === e.chat)));
      for (const e of entries) for (const p of e.saved || []) { if (await trash(p)) trashed++; }
      removed = jobs.remove(entries.map((e) => e.id)).length;
    }
    messages = [];
    save();
    jobs.discard(attachments);
    return { removed, trashed };
  }

  return { list: () => messages, send, go, cancel, clear };
}

module.exports = { createChat, ChatError };
