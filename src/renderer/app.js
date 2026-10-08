'use strict';
// The OT Studio window. It only talks to the rest of the app through window.ot (see src/main/preload.js).
// Text from services and models is always set as text, never as HTML.

// window.ot is the bridge; it is used directly as the global "ot".

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && !['list', 'type', 'for'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
const mediaUrl = (name) => `otmedia://m/${encodeURIComponent(name)}`;
const KIND_WORD = { image: 'picture', video: 'video' };
const KEY_NAMES = { replicate: 'Replicate', spicyapi: 'SpicyAPI', openrouter: 'OpenRouter' };
const STATE_WORDS = { sending: 'Sending', running: 'Working', downloading: 'Downloading', finishing: 'Finishing', done: 'Done', failed: 'Failed', canceled: 'Stopped', uncertain: 'Outcome unknown' };
const BUSY = ['sending', 'running', 'downloading', 'finishing'];
const TOOL_NAMES = { expand: 'Expand', upscale: 'Upscale', longer: 'Make it longer' };

let S = null;
const ui = {
  tab: 'image',
  forms: { image: blank('image'), video: blank('video') },
  adding: false, pasted: '', pastedKind: 'image', draft: null, test: null, testPrompt: 'A red apple on a wooden table', draftError: '', jsonText: '',
};
function blank(kind) { return { kind, service: 'replicate', model: '', prompt: '', options: {}, pictures: {}, form: null, models: [], error: '', busy: false, loading: false, newModel: '', hint: '', continueFrom: null }; }

// ---------- startup ----------

async function init() {
  S = await ot.state();
  for (const kind of ['image', 'video']) {
    const last = S.settings.last[kind];
    if (last && (last.service === 'replicate' || S.services.some((s) => s.id === last.service && s.kind === kind))) { ui.forms[kind].service = last.service; ui.forms[kind].model = last.model; }
  }
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => { ui.tab = b.dataset.tab; render(); }));
  document.getElementById('viewer').addEventListener('click', closeViewer);
  document.addEventListener('keydown', onKey);
  ot.onJob(onJob);
  render();
  await Promise.all(['image', 'video'].map((k) => chooseService(k, ui.forms[k].service, ui.forms[k].model)));
  setInterval(tickTimes, 1000);
}

function onJob(entry) {
  const i = S.history.findIndex((e) => e.id === entry.id);
  if (i >= 0) S.history[i] = entry; else S.history.unshift(entry);
  if (ui.tab === entry.kind) renderGallery();
}

function services(kind) {
  return [{ id: 'replicate', name: 'Replicate', kind }, ...S.services.filter((s) => s.kind === kind)];
}
const serviceDef = (id) => S.services.find((s) => s.id === id);

function replicateModels(kind) {
  const fixed = S.replicateModels[kind].map(([id, name]) => ({ id, name }));
  const added = (S.settings.replicateModels[kind] || []).filter((id) => !fixed.some((m) => m.id === id)).map((id) => ({ id, name: id, added: true }));
  return [...fixed, ...added];
}

async function chooseService(kind, id, model) {
  const f = ui.forms[kind];
  f.service = id; f.form = null; f.error = ''; f.loading = true;
  renderIf(kind);
  try {
    if (id === 'replicate') f.models = replicateModels(kind);
    else {
      f.models = await ot.models(id, false);
      const d = serviceDef(id);
      if (d && d.models && d.models.url && !f.models.some((m) => m.info)) { try { f.models = await ot.models(id, true); } catch { /* the short list still works */ } }
    }
  } catch (e) { f.error = e.message; f.models = []; }
  f.model = model && f.models.some((m) => m.id === model) ? model : (f.models[0] ? f.models[0].id : '');
  await loadForm(kind, false);
}

async function loadForm(kind, refresh) {
  const f = ui.forms[kind];
  f.loading = true; f.error = ''; f.form = null;
  renderIf(kind);
  if (f.model) {
    try { f.form = await ot.form(f.service, f.model, kind, refresh); }
    catch (e) { f.error = e.message; }
    ot.settingsSet({ last: { [kind]: { service: f.service, model: f.model } } }).catch(() => {});
  }
  f.loading = false;
  renderIf(kind);
}

function renderIf(kind) { if (ui.tab === kind) render(); }

// ---------- layout ----------

function render() {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const main = document.getElementById('main');
  const scroll = { c: document.querySelector('.composer')?.scrollTop, g: document.querySelector('.gallery')?.scrollTop, p: document.querySelector('.page')?.scrollTop };
  main.replaceChildren(ui.tab === 'settings' ? settingsPage() : studio(ui.tab));
  if (document.querySelector('.composer') && scroll.c) document.querySelector('.composer').scrollTop = scroll.c;
  if (document.querySelector('.gallery') && scroll.g) document.querySelector('.gallery').scrollTop = scroll.g;
  if (document.querySelector('.page') && scroll.p) document.querySelector('.page').scrollTop = scroll.p;
}

function studio(kind) {
  return h('div', { class: 'studio' }, h('aside', { class: 'composer' }, composer(kind)), h('section', { class: 'gallery', id: 'gallery' }, gallery(kind)));
}

// ---------- the composer ----------

function composer(kind) {
  const f = ui.forms[kind];
  const out = [];
  out.push(h('label', { class: 'field' }, h('span', { class: 'name', text: 'Service' }),
    h('select', { onchange: (e) => chooseService(kind, e.target.value, '') }, services(kind).map((s) => h('option', { value: s.id, selected: s.id === f.service, text: s.name })))));

  const modelSelect = h('select', { onchange: (e) => { f.model = e.target.value; loadForm(kind, false); } },
    f.models.map((m) => h('option', { value: m.id, selected: m.id === f.model, text: m.name === m.id ? m.id : `${m.name}` })));
  const modelField = h('label', { class: 'field' }, h('span', { class: 'name', text: 'Model' }), modelSelect);
  const def = serviceDef(f.service);
  if (def && def.models && def.models.url) modelField.append(h('div', { class: 'row' }, h('button', { class: 'link', text: 'Load the full list of models', onclick: async () => { try { f.models = await ot.models(f.service, true); render(); } catch (e) { f.error = e.message; render(); } } })));
  if (f.service === 'replicate') {
    const current = f.models.find((m) => m.id === f.model);
    modelField.append(h('div', { class: 'row' },
      h('input', { type: 'text', class: 'grow', placeholder: 'Another Replicate model: owner/name', value: f.newModel, oninput: (e) => { f.newModel = e.target.value; } }),
      h('button', { class: 'btn small', text: 'Add', onclick: () => addReplicateModel(kind) })));
    if (current && current.added) modelField.append(h('div', {}, h('button', { class: 'link', text: 'Remove this model from the list', onclick: () => forgetReplicateModel(kind, current.id) })));
  }
  out.push(modelField);

  if (f.continueFrom) {
    out.push(h('div', { class: 'message info' }, 'Making a video longer. Its last frame is the starting picture, and the new part is joined to its end when it finishes. ',
      h('button', { class: 'link', text: 'Stop making it longer', onclick: () => { f.continueFrom = null; render(); } })));
  } else if (f.hint) out.push(h('div', { class: 'message info' }, f.hint, ' ', h('button', { class: 'link', text: 'Close', onclick: () => { f.hint = ''; render(); } })));
  if (f.loading) out.push(h('div', { class: 'note', text: 'Loading the model settings...' }));
  if (f.error) out.push(h('div', { class: 'message', text: f.error }));
  if (f.error && /key/i.test(f.error)) out.push(h('button', { class: 'btn', text: 'Open Settings', onclick: () => { ui.tab = 'settings'; render(); } }));

  if (f.form) {
    if (f.form.hasPrompt) {
      out.push(h('label', { class: 'field' }, h('span', { class: 'name', text: 'Describe it' }),
        h('textarea', { id: `prompt-${kind}`, value: f.prompt, placeholder: kind === 'video' ? 'What happens in the video' : 'What the picture shows', oninput: (e) => { f.prompt = e.target.value; } })));
    }
    for (const p of f.form.pictures) out.push(pictureInput(kind, p));
    const simple = S.settings.simpleView;
    const shown = f.form.controls.filter((c) => !simple || c.simple || c.required);
    for (const c of shown) out.push(control(f, c));
    const hidden = f.form.controls.length - shown.length;
    if (simple && hidden > 0) out.push(h('button', { class: 'link', text: `Show all settings (${hidden} more)`, onclick: () => setSimple(false) }));
    if (!simple && f.form.controls.some((c) => !c.simple)) out.push(h('button', { class: 'link', text: 'Show fewer settings', onclick: () => setSimple(true) }));
    out.push(h('button', { class: 'btn primary generate', disabled: f.busy, text: f.busy ? 'Sending...' : f.continueFrom ? 'Make the next part' : `Make the ${KIND_WORD[kind]}`, onclick: () => generate(kind) }));
    out.push(h('div', { class: 'note', text: 'Each request is billed by the service you chose. OT Studio never repeats a request on its own.' }));
  }
  return out;
}

async function setSimple(v) { S.settings = await ot.settingsSet({ simpleView: v }); render(); }

async function addReplicateModel(kind) {
  const f = ui.forms[kind];
  try {
    const id = await ot.replicateAdd(kind, f.newModel);
    S = { ...S, ...(await ot.state()) };
    f.newModel = '';
    await chooseService(kind, 'replicate', id);
  } catch (e) { f.error = e.message; render(); }
}

async function forgetReplicateModel(kind, id) {
  await ot.replicateForget(kind, id);
  S = await ot.state();
  await chooseService(kind, 'replicate', '');
}

function control(f, c) {
  const val = f.options[c.name] !== undefined ? f.options[c.name] : c.default;
  const set = (v) => { if (v === '' || v === undefined || (typeof v === 'number' && Number.isNaN(v))) delete f.options[c.name]; else f.options[c.name] = v; };
  const tech = c.label && c.label.toLowerCase() !== c.name.replace(/_/g, ' ').toLowerCase() ? h('span', { class: 'tech', text: c.name }) : null;
  const note = c.note ? h('span', { class: 'note', text: c.note }) : null;
  if (c.name === 'disable_safety_checker') {
    return h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: !val, onchange: (e) => set(!e.target.checked) }),
      h('span', {}, h('span', { text: 'Safety checker on' }), h('br'), h('span', { class: 'note', text: 'The provider may still refuse some requests.' })));
  }
  if (c.type === 'switch') {
    return h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: !!val, onchange: (e) => set(e.target.checked) }), h('span', {}, h('span', { text: c.label || c.name }), note ? h('br') : null, note));
  }
  let input;
  if (c.type === 'choice') {
    const choices = c.choices || [];
    input = h('select', { onchange: (e) => set(e.target.value === '' ? undefined : choices.find((x) => String(x) === e.target.value)) },
      val === undefined ? h('option', { value: '', text: 'Model default', selected: true }) : null,
      choices.map((x) => h('option', { value: String(x), text: String(x), selected: val !== undefined && String(x) === String(val) })));
  } else if (c.type === 'number') {
    input = h('input', { type: 'number', value: val === undefined ? '' : String(val), placeholder: 'Model default', min: c.min, max: c.max, step: c.integer ? 1 : 'any',
      onchange: (e) => set(e.target.value === '' ? undefined : Number(e.target.value)) });
  } else {
    input = h('input', { type: 'text', value: val === undefined ? '' : String(val), placeholder: 'Model default', oninput: (e) => set(e.target.value) });
  }
  const range = c.type === 'number' && (c.min !== undefined || c.max !== undefined) ? h('span', { class: 'note', text: `${c.min ?? ''} to ${c.max ?? ''}` }) : null;
  return h('label', { class: 'field' }, h('span', { class: 'name', text: c.label || c.name }), input, range, note, tech);
}

function pictureInput(kind, p) {
  const f = ui.forms[kind];
  const list = f.pictures[p.name] || [];
  const max = p.max || 1;
  return h('div', { class: 'field' },
    h('span', { class: 'name', text: `${p.label || p.name}${max > 1 ? ` (up to ${max})` : ''}${p.required ? ', needed' : ''}` }),
    h('div', { class: 'pics' }, list.map((name, i) => h('div', { class: 'pic' }, h('img', { src: mediaUrl(name), alt: '' }),
      h('button', { text: 'Remove', title: 'Remove this picture', onclick: () => { list.splice(i, 1); f.pictures[p.name] = list; render(); } })))),
    list.length < max ? h('div', {}, h('button', { class: 'btn small', text: list.length ? 'Add another picture' : 'Choose a picture', onclick: () => pickPictures(kind, p) })) : null,
    p.note ? h('span', { class: 'note', text: p.note }) : null);
}

async function pickPictures(kind, p) {
  const f = ui.forms[kind];
  try {
    const names = await ot.picturesPick((p.max || 1) > 1);
    const list = [...(f.pictures[p.name] || []), ...names].slice(0, p.max || 1);
    f.pictures[p.name] = list;
    render();
  } catch (e) { f.error = e.message; render(); }
}

async function generate(kind) {
  const f = ui.forms[kind];
  if (!f.form) return;
  f.error = '';
  const pictures = {};
  for (const p of f.form.pictures) if ((f.pictures[p.name] || []).length) pictures[p.name] = f.pictures[p.name];
  const options = {};
  for (const c of f.form.controls) {
    if (f.options[c.name] !== undefined) options[c.name] = f.options[c.name];
    else if (c.name === 'disable_safety_checker' && c.default !== undefined) options[c.name] = c.default;
  }
  f.busy = true;
  render();
  try {
    const req = { kind, service: f.service, model: f.model, prompt: f.prompt, options, pictures };
    if (f.continueFrom) req.op = { type: 'longer', parent: f.continueFrom };
    const entry = await ot.generate(req);
    onJob(entry);
    f.continueFrom = null;
    if (f.service === 'replicate' && S.editModels.includes(f.model) && S.settings.editModel !== f.model) S.settings = await ot.settingsSet({ editModel: f.model });
  } catch (e) { f.error = e.message; }
  f.busy = false;
  render();
}

// ---------- the gallery ----------

function gallery(kind) {
  const entries = S.history.filter((e) => e.kind === kind);
  const toolbar = h('div', { class: 'toolbar' },
    h('h2', { class: 'grow', text: kind === 'video' ? 'Your videos' : 'Your pictures' }),
    h('button', { class: 'btn small', text: 'Open save folder', onclick: () => ot.folderOpen(kind).catch((e) => snack(e.message)) }),
    entries.length ? h('button', { class: 'btn small danger', text: 'Clear history', onclick: () => clearHistory(kind) }) : null);
  if (!entries.length) return [toolbar, h('div', { class: 'empty', text: `Your ${KIND_WORD[kind]}s appear here.` })];
  return [toolbar, h('div', { class: 'grid' }, entries.map(card))];
}

function renderGallery() {
  const g = document.getElementById('gallery');
  if (!g) return;
  const top = g.scrollTop;
  g.replaceChildren(...gallery(ui.tab));
  g.scrollTop = top;
}

function card(e) {
  const mediaBox = h('div', { class: 'media' });
  if (e.state === 'done' && e.files.length) {
    const first = e.files[0];
    if (e.kind === 'video') mediaBox.append(h('video', { src: mediaUrl(first), controls: true, preload: 'metadata' }));
    else mediaBox.append(h('img', { src: mediaUrl(first), alt: e.prompt.slice(0, 100), onclick: () => openViewer(e.files, 0) }));
    if (e.files.length > 1) mediaBox.append(h('span', { class: 'count', text: `${e.files.length} ${e.kind === 'video' ? 'videos' : 'pictures'}` }));
  } else if (BUSY.includes(e.state)) mediaBox.append(h('div', { class: 'spinner' }));
  else mediaBox.append(h('div', { class: 'note', text: STATE_WORDS[e.state] || e.state }));

  const when = new Date(e.created);
  const meta = [modelName(e), e.serviceName, when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })];
  if (e.cost !== undefined) meta.push(`cost $${Number(e.cost).toFixed(3)}`);
  const running = BUSY.includes(e.state);
  const body = h('div', { class: 'body' },
    h('div', { class: `state ${e.state}` }, STATE_WORDS[e.state] || e.state, running ? h('span', { class: 'note', 'data-since': String(e.created), text: '' }) : null),
    e.prompt ? h('div', { class: 'prompt', text: e.prompt, title: e.prompt }) : null,
    e.op && e.op.type === 'upscale' ? h('div', { class: 'prompt', text: `${e.op.scale} times larger${e.op.faceEnhance ? ', faces enhanced' : ''}` }) : null,
    e.op && e.op.type === 'expand' && !e.prompt ? h('div', { class: 'prompt', text: `Expanded to ${e.op.ratio}` }) : null,
    h('div', { class: 'note', text: meta.join(' · ') }),
    running && e.status ? h('div', { class: 'note', text: e.status }) : null,
    e.error ? h('div', { class: 'message', text: e.error }) : null);

  const actions = h('div', { class: 'actions' });
  const add = (text, fn, cls = '') => actions.append(h('button', { class: `btn small ${cls}`, text, onclick: fn }));
  if (e.state === 'done') {
    add('Save', () => save(e));
    if (e.kind === 'image') {
      add('Edit', () => editPicture(e.files[0]));
      add('Expand', () => openExpand({ source: e.files[0] }));
      add('Upscale', () => openUpscale({ source: e.files[0] }));
      add('Make a video', () => usePicture(e, 'video'));
      add('Use as reference', () => usePicture(e, 'image'));
    } else add('Make it longer', () => makeLonger(e));
  }
  if (e.state === 'running' && e.service === 'replicate') add('Stop', () => ot.cancel(e.id).catch((x) => snack(x.message)));
  if (e.canRetryDownload && e.state === 'failed') add('Download again', () => ot.downloadRetry(e.id).catch((x) => snack(x.message)));
  if (!running) { add('Repeat', () => repeat(e)); add('Delete', () => removeEntries([e.id]), 'danger'); }
  return h('article', { class: 'card' }, mediaBox, body, actions);
}

function modelName(e) {
  if (e.op && TOOL_NAMES[e.op.type] && e.op.type !== 'longer') return TOOL_NAMES[e.op.type];
  const f = ui.forms[e.kind];
  const m = f && f.service === e.service ? f.models.find((x) => x.id === e.model) : null;
  return m ? m.name : e.model;
}

function tickTimes() {
  document.querySelectorAll('[data-since]').forEach((el) => {
    const s = Math.max(0, Math.round((Date.now() - Number(el.dataset.since)) / 1000));
    el.textContent = ` for ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
}

async function save(e) {
  try {
    const r = await ot.save(e.id);
    snack(`Saved to ${r.dir}`, [['Open folder', () => ot.folderOpen(e.kind)], ['Change folder', async () => { const dir = await ot.folderChange(e.kind); snack(`New ${KIND_WORD[e.kind]}s will be saved to ${dir}`); }]]);
  } catch (x) { snack(x.message); }
}

async function removeEntries(ids) {
  try {
    const gone = await ot.remove(ids);
    S.history = S.history.filter((e) => !gone.includes(e.id));
    for (const f of Object.values(ui.forms)) {
      const left = new Set(S.history.flatMap((e) => [...e.files, ...Object.values(e.pictures || {}).flat()]));
      for (const k of Object.keys(f.pictures)) f.pictures[k] = f.pictures[k].filter((n) => left.has(n) || n.startsWith('in-'));
    }
    renderGallery();
  } catch (x) { snack(x.message); }
}

function clearHistory(kind) {
  const ids = S.history.filter((e) => e.kind === kind && !BUSY.includes(e.state)).map((e) => e.id);
  if (!ids.length) return;
  if (!window.confirm(`Remove all ${ids.length} ${KIND_WORD[kind]}s from this list? Copies you saved to your folders stay where they are.`)) return;
  removeEntries(ids);
}

/** Puts a finished picture into a picture input: a reference on the Pictures tab, or the starting picture of a video. */
function usePicture(e, kind) {
  const f = ui.forms[kind];
  const inputs = f.form ? f.form.pictures : [];
  const preferred = kind === 'video' ? ['first_frame', 'image', 'start_image', 'first_frame_image'] : [];
  const target = inputs.find((p) => preferred.includes(p.name)) || inputs.find((p) => (f.pictures[p.name] || []).length < (p.max || 1)) || inputs[0];
  ui.tab = kind;
  if (!target) {
    f.error = kind === 'video' ? 'This model does not start from a picture. Choose one that does, such as Wan 2.2 from a picture.' : 'This model takes no pictures. Choose an editing model, such as Seedream 4.5 or Qwen Image Edit Plus.';
    render();
    return;
  }
  const list = f.pictures[target.name] || [];
  if (!list.includes(e.files[0])) list.push(e.files[0]);
  f.pictures[target.name] = list.slice(-(target.max || 1));
  render();
}

/** Fills the form with a job's prompt, model, settings, and pictures, ready to change and send again. */
async function repeat(e) {
  if (e.op && e.op.type === 'expand') return openExpand({ source: e.op.source, ratio: e.op.ratio, prompt: e.prompt, safety: e.op.safety });
  if (e.op && e.op.type === 'upscale') return openUpscale({ source: e.op.source, scale: e.op.scale, faceEnhance: e.op.faceEnhance });
  if (e.op && e.op.type === 'longer') {
    const parent = S.history.find((x) => x.id === e.op.parent && x.state === 'done');
    if (parent) return makeLonger(parent, e);
  }
  ui.tab = e.kind;
  const f = ui.forms[e.kind];
  if (e.service !== f.service || e.model !== f.model) {
    const exists = e.service === 'replicate' || S.services.some((s) => s.id === e.service);
    if (!exists) { snack('The service for this job is not set up anymore.'); return; }
    await chooseService(e.kind, e.service, e.model);
    if (f.model !== e.model && e.service === 'replicate') { f.model = e.model; await loadForm(e.kind, false); }
  }
  f.prompt = e.prompt;
  f.options = { ...(e.options || {}) };
  f.pictures = JSON.parse(JSON.stringify(e.pictures || {}));
  render();
  const box = document.getElementById(`prompt-${e.kind}`);
  if (box) { box.focus(); box.scrollIntoView({ block: 'center' }); }
}

// ---------- picture and video tools ----------

/** Opens the Pictures form on the editing model last used, with this picture in it. */
async function editPicture(name) {
  ui.tab = 'image';
  const f = ui.forms.image;
  const model = S.settings.editModel || 'black-forest-labs/flux-kontext-dev';
  render();
  await chooseService('image', 'replicate', model);
  if (f.model !== model) { f.model = model; await loadForm('image', false); }
  const target = f.form && f.form.pictures[0];
  if (!target) { render(); return; }
  f.pictures = { [target.name]: [name] };
  f.prompt = '';
  f.options = {};
  f.hint = target.max > 1
    ? `Describe the change. You can add up to ${target.max - 1} more pictures as references.`
    : 'Describe the change. For several reference pictures, choose Seedream 4.5, FLUX.2 dev, or Qwen Image Edit Plus.';
  render();
  const box = document.getElementById('prompt-image');
  if (box) box.focus();
}

/** Starts a longer version of a video: its last frame becomes the starting picture of the next part. */
async function makeLonger(e, previous) {
  ui.tab = 'video';
  const f = ui.forms.video;
  snack('Taking the last frame of the video...');
  let frame;
  try { frame = await ot.videoLastFrame(e.id); } catch (x) { snack(x.message); return; }
  const usable = e.service === 'replicate' || S.services.some((s) => s.id === e.service);
  if (usable && (f.service !== e.service || f.model !== e.model)) {
    await chooseService('video', e.service, e.model);
    if (f.model !== e.model && e.service === 'replicate') { f.model = e.model; await loadForm('video', false); }
  }
  const inputs = f.form ? f.form.pictures : [];
  const target = inputs.find((p) => ['first_frame', 'image', 'start_image', 'first_frame_image'].includes(p.name)) || inputs[0];
  if (!target) {
    f.error = 'This model does not start from a picture. Choose one that does, such as Wan 2.2 from a picture or Wan 2.7 on OpenRouter, then click Make it longer again.';
    render();
    return;
  }
  const source = previous || e;
  f.options = { ...(source.options || {}) };
  f.pictures = { [target.name]: [frame] };
  f.prompt = source.prompt || '';
  f.continueFrom = e.id;
  f.error = '';
  document.getElementById('snack').hidden = true;
  render();
  const box = document.getElementById('prompt-video');
  if (box) { box.focus(); box.scrollIntoView({ block: 'center' }); }
}

function openModal(title, ...body) {
  const m = document.getElementById('modal');
  const panel = h('div', { class: 'panel', onclick: (ev) => ev.stopPropagation() }, h('h2', { text: title }), ...body);
  m.replaceChildren(panel);
  m.hidden = false;
  m.onclick = closeModal;
  return panel;
}
function closeModal() { document.getElementById('modal').hidden = true; }

const SHAPES = [['16:9', 'Wide'], ['9:16', 'Tall'], ['1:1', 'Square'], ['4:3', '4:3'], ['3:4', '3:4'], ['3:2', '3:2'], ['2:3', '2:3'], ['21:9', 'Very wide']];

/** The Expand dialog: choose the new shape, see where the picture sits, and describe the new area if you like. */
async function openExpand({ source, ratio, prompt, safety }) {
  let size;
  try { size = await ot.mediaSize(source); } catch (x) { snack(x.message); return; }
  const st = { ratio: ratio || (size.width >= size.height ? '9:16' : '16:9'), prompt: prompt || '', safety: safety === true, error: '', busy: false };
  const preview = h('div', { class: 'shape' });
  const shapes = h('div', { class: 'chips' });
  const errorBox = h('div', { class: 'message', hidden: true });
  const go = h('button', { class: 'btn primary', text: 'Expand' });
  function draw() {
    const [rw, rh] = st.ratio.split(':').map(Number);
    const target = rw / rh;
    const cur = size.width / size.height;
    const same = Math.abs(target - cur) / cur < 0.02;
    let cw = size.width; let ch = size.height;
    if (target > cur) cw = size.height * target; else ch = size.width / target;
    preview.style.setProperty('aspect-ratio', `${rw} / ${rh}`);
    preview.style.setProperty('width', target >= 1 ? '100%' : `min(100%, calc(46vh * ${target.toFixed(4)}))`);
    const pic = h('img', { src: mediaUrl(source), alt: '' });
    pic.style.setProperty('left', `${((cw - size.width) / 2 / cw) * 100}%`);
    pic.style.setProperty('top', `${((ch - size.height) / 2 / ch) * 100}%`);
    pic.style.setProperty('width', `${(size.width / cw) * 100}%`);
    pic.style.setProperty('height', `${(size.height / ch) * 100}%`);
    preview.replaceChildren(pic);
    shapes.replaceChildren(...SHAPES.map(([r, label]) => h('button', { class: `chip plain ${r === st.ratio ? 'on' : ''}`, text: label === r ? r : `${label} ${r}`, onclick: () => { st.ratio = r; draw(); } })));
    go.disabled = same || st.busy;
    errorBox.hidden = !st.error && !same;
    errorBox.textContent = same ? 'The picture already has this shape. Choose another.' : st.error;
  }
  go.onclick = async () => {
    st.busy = true; st.error = ''; go.textContent = 'Sending...'; draw();
    try { const entry = await ot.expand({ source, ratio: st.ratio, prompt: st.prompt, safety: st.safety }); onJob(entry); closeModal(); ui.tab = 'image'; render(); }
    catch (x) { st.error = x.message; st.busy = false; go.textContent = 'Expand'; draw(); }
  };
  openModal('Expand the picture',
    h('div', { class: 'note', text: `Your picture is ${size.width} by ${size.height}. FLUX Fill dev on Replicate paints the new area, and OT Studio keeps your picture's own pixels in the middle. About 4 cents.` }),
    shapes, preview,
    h('label', { class: 'field' }, h('span', { class: 'name', text: 'What fills the new area (optional)' }),
      h('input', { type: 'text', value: st.prompt, placeholder: 'For example: more of the beach and the sea', oninput: (ev) => { st.prompt = ev.target.value; } })),
    h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: st.safety, onchange: (ev) => { st.safety = ev.target.checked; } }), h('span', { text: 'Safety checker on' })),
    errorBox,
    h('div', { class: 'row' }, go, h('button', { class: 'btn', text: 'Cancel', onclick: closeModal })));
  draw();
}

/** The Upscale dialog. Pictures over about 2 megapixels are already large, and the upscaler cannot take them. */
async function openUpscale({ source, scale, faceEnhance }) {
  let size;
  try { size = await ot.mediaSize(source); } catch (x) { snack(x.message); return; }
  const st = { scale: scale || 4, face: !!faceEnhance };
  const large = size.width * size.height > 2096704;
  const result = h('div', { class: 'note' });
  const go = h('button', { class: 'btn primary', text: 'Upscale', disabled: large });
  const errorBox = h('div', { class: 'message', hidden: true });
  const scales = h('div', { class: 'chips' });
  function draw() {
    scales.replaceChildren(...[2, 4].map((n) => h('button', { class: `chip plain ${st.scale === n ? 'on' : ''}`, text: `${n} times`, onclick: () => { st.scale = n; draw(); } })));
    result.textContent = large ? '' : `The result is ${size.width * st.scale} by ${size.height * st.scale}.`;
  }
  go.onclick = async () => {
    go.disabled = true; go.textContent = 'Sending...';
    try { const entry = await ot.upscale({ source, scale: st.scale, faceEnhance: st.face }); onJob(entry); closeModal(); ui.tab = 'image'; render(); }
    catch (x) { errorBox.hidden = false; errorBox.textContent = x.message; go.disabled = false; go.textContent = 'Upscale'; }
  };
  openModal('Upscale the picture',
    large
      ? h('div', { class: 'message info', text: `This picture is already large: ${size.width} by ${size.height}. The upscaler takes pictures of up to about 2 megapixels, such as 1440 by 1440, so it has nothing to add here.` })
      : h('div', { class: 'note', text: `Your picture is ${size.width} by ${size.height}. Real-ESRGAN on Replicate makes it larger and sharper.` }),
    large ? null : scales, result,
    large ? null : h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: st.face, onchange: (ev) => { st.face = ev.target.checked; } }), h('span', { text: 'Enhance faces' })),
    errorBox,
    h('div', { class: 'row' }, large ? null : go, h('button', { class: 'btn', text: large ? 'Close' : 'Cancel', onclick: closeModal })));
  draw();
}

// ---------- viewer and messages ----------

let viewer = null;
function openViewer(files, index) { viewer = { files, index }; showViewer(); }
function showViewer() {
  const v = document.getElementById('viewer');
  v.replaceChildren(h('img', { src: mediaUrl(viewer.files[viewer.index]), alt: '' }));
  v.hidden = false;
}
function closeViewer() { viewer = null; document.getElementById('viewer').hidden = true; }
function onKey(e) {
  if (e.key === 'Escape' && !document.getElementById('modal').hidden) { closeModal(); return; }
  if (!viewer) return;
  if (e.key === 'Escape') closeViewer();
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { viewer.index = (viewer.index + (e.key === 'ArrowRight' ? 1 : -1) + viewer.files.length) % viewer.files.length; showViewer(); }
}

let snackTimer = null;
function snack(text, actions = []) {
  const s = document.getElementById('snack');
  s.replaceChildren(h('span', { text }), ...actions.map(([label, fn]) => h('button', { class: 'btn small', text: label, onclick: () => { s.hidden = true; fn(); } })),
    h('button', { class: 'link', text: 'Close', onclick: () => { s.hidden = true; } }));
  s.hidden = false;
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => { s.hidden = true; }, 10000);
}

// ---------- settings ----------

function settingsPage() {
  return h('div', { class: 'page' }, keysSection(), servicesSection(), ui.adding ? addServiceSection() : null, foldersSection(), hostsSection(), viewSection(), aboutSection());
}

function keyName(slot) {
  if (KEY_NAMES[slot]) return KEY_NAMES[slot];
  const d = S.services.find((s) => s.keySlot === slot);
  return d ? d.name : slot;
}

function keysSection() {
  const items = Object.entries(S.keys).map(([slot, saved]) => {
    const input = h('input', { type: 'password', class: 'grow', placeholder: saved ? 'Enter a new key to replace the saved one' : 'Paste your key here', autocomplete: 'off' });
    return h('div', { class: 'item' },
      h('strong', { class: 'w110', text: keyName(slot) }),
      h('span', { class: `badge ${saved ? 'ok' : ''}`, text: saved ? 'Saved' : 'Not saved' }),
      input,
      h('button', { class: 'btn small primary', text: 'Save', onclick: async () => { try { S.keys = await ot.keySet(slot, input.value); input.value = ''; render(); snack(`${keyName(slot)} key saved.`); } catch (e) { snack(e.message); } } }),
      saved ? h('button', { class: 'btn small danger', text: 'Remove', onclick: async () => { if (window.confirm(`Remove the saved ${keyName(slot)} key?`)) { S.keys = await ot.keyClear(slot); render(); } } }) : null);
  });
  return h('section', {}, h('h2', { text: 'API keys' }), h('div', { class: 'box' },
    h('div', { class: 'note', text: 'Windows encrypts your keys for your account. Each key goes only to its own service, and updates keep them.' }),
    h('div', { class: 'list' }, items)));
}

function host(url) { try { return new URL(url).hostname; } catch { return ''; } }

function servicesSection() {
  const rows = [{ id: 'replicate', name: 'Replicate', kind: 'both', builtin: true, request: { url: 'https://api.replicate.com' } }, ...S.services].map((d) => h('div', { class: 'item' },
    h('div', { class: 'grow' }, h('strong', { text: d.name }), ' ', h('span', { class: 'note', text: `${d.kind === 'both' ? 'pictures and videos' : d.kind === 'video' ? 'videos' : 'pictures'} · ${host(d.request.url)}` })),
    d.builtin ? h('span', { class: 'badge', text: 'Built in' }) : null,
    d.id !== 'replicate' ? h('button', { class: 'btn small', text: 'Export', onclick: async () => { try { const p = await ot.serviceExport(d.id); if (p) snack(`Exported to ${p}`); } catch (e) { snack(e.message); } } }) : null,
    !d.builtin ? h('button', { class: 'btn small', text: 'Edit', onclick: () => { ui.adding = true; ui.draft = JSON.parse(JSON.stringify(d)); ui.jsonText = ''; ui.test = null; render(); } }) : null,
    !d.builtin ? h('button', { class: 'btn small danger', text: 'Remove', onclick: async () => { if (window.confirm(`Remove the service "${d.name}"? Its saved key stays until you remove it.`)) { S.services = await ot.serviceRemove(d.id); render(); } } }) : null));
  return h('section', {}, h('h2', { text: 'Services' }), h('div', { class: 'box' },
    h('div', { class: 'list' }, rows),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', text: 'Add a service', onclick: () => { ui.adding = true; ui.draft = null; ui.test = null; ui.draftError = ''; render(); } }),
      h('button', { class: 'btn', text: 'Import a service', onclick: async () => { try { const list = await ot.serviceImport(); if (list) { S = await ot.state(); snack('Service imported. Add its key above.'); render(); } } catch (e) { snack(e.message); } } }))));
}

const ROLE_WORDS = { prompt: 'Your prompt', model: 'The model', setting: 'A setting you can change', picture: 'A picture you choose', fixed: 'Always as in the example' };

function addServiceSection() {
  const d = ui.draft;
  const steps = h('div', { class: 'steps' });
  steps.append(h('div', { class: 'step' },
    h('h3', { text: '1. Paste the provider\'s example request' }),
    h('div', { class: 'note', text: 'Copy an example from the provider\'s documentation: curl, Python requests, or Node fetch. OT Studio only reads the example. It never runs it.' }),
    h('div', { class: 'row' }, h('span', { text: 'It makes' }), h('select', { onchange: (e) => { ui.pastedKind = e.target.value; } },
      h('option', { value: 'image', text: 'pictures', selected: ui.pastedKind === 'image' }), h('option', { value: 'video', text: 'videos', selected: ui.pastedKind === 'video' }))),
    h('textarea', { class: 'code', value: ui.pasted, placeholder: 'curl -X POST https://api.example.com/v1/images \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -d \'{"model": "...", "prompt": "..."}\'', oninput: (e) => { ui.pasted = e.target.value; } }),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', text: 'Read the example', onclick: readExample }),
      h('button', { class: 'btn', text: 'Cancel', onclick: () => { ui.adding = false; ui.draft = null; render(); } }))));
  if (ui.draftError) steps.append(h('div', { class: 'message', text: ui.draftError }));
  if (d) {
    for (const w of (d.notes && d.notes.warnings) || []) steps.append(h('div', { class: 'message info', text: w }));
    steps.append(describeStep(d), fieldsStep(d), resultStep(d), saveStep(d));
  }
  return h('section', {}, h('h2', { text: d && S.services.some((s) => s.id === d.id) ? `Edit ${d.name}` : 'Add a service' }), h('div', { class: 'box' }, steps));
}

async function readExample() {
  ui.draftError = '';
  try { ui.draft = await ot.snippetParse(ui.pasted, ui.pastedKind); ui.test = null; ui.jsonText = ''; }
  catch (e) { ui.draftError = e.message; ui.draft = null; }
  render();
}

function textField(label, value, onchange, note) {
  return h('label', { class: 'field' }, h('span', { class: 'name', text: label }), h('input', { type: 'text', value: value ?? '', onchange: (e) => onchange(e.target.value) }), note ? h('span', { class: 'note', text: note }) : null);
}

function describeStep(d) {
  return h('div', { class: 'step' },
    h('h3', { text: '2. Name it and add its key' }),
    h('div', { class: 'note', text: `${d.request.method} ${d.request.url}` }),
    h('div', { class: 'two' },
      textField('Name', d.name, (v) => { d.name = v; }),
      textField('Short id', d.id, (v) => { d.id = v.trim().toLowerCase(); }, 'Lowercase letters, numbers, and dashes.')),
    d.keyHeader ? h('div', { class: 'note', text: `The key travels in the ${d.keyHeader.name} header as "${d.keyHeader.template}".` })
      : h('div', { class: 'message info', text: 'The example sends no key. If the service needs one, add the key header in the definition below.' }),
    h('div', { class: 'row' },
      h('div', { class: 'grow' }, textField('Key name', d.keySlot, (v) => { d.keySlot = v.trim().toLowerCase(); }, 'Services from the same provider can share one key name.')),
      h('span', { class: `badge ${S.keys[d.keySlot] ? 'ok' : ''}`, text: S.keys[d.keySlot] ? 'Key saved' : 'No key yet' })),
    (() => { const input = h('input', { type: 'password', class: 'grow', placeholder: 'Paste the key for this service', autocomplete: 'off' });
      return h('div', { class: 'row' }, input, h('button', { class: 'btn small', text: 'Save key', onclick: async () => { try { S.keys = await ot.keySet(d.keySlot, input.value); render(); } catch (e) { snack(e.message); } } })); })());
}

function fieldsStep(d) {
  const example = (d.notes && d.notes.example) || {};
  const roles = (d.notes && d.notes.roles) || {};
  const rows = Object.entries(example).map(([k, v]) => h('div', { class: 'item' },
    h('div', { class: 'grow' }, h('span', { class: 'chip', text: k }), ' ', h('span', { class: 'note', text: JSON.stringify(v).slice(0, 80) })),
    h('select', { onchange: async (e) => { d.notes.roles[k] = e.target.value; ui.draft = await ot.serviceRebuild(d); render(); } },
      Object.entries(ROLE_WORDS).map(([role, word]) => h('option', { value: role, text: word, selected: roles[k] === role })))));
  const models = (d.models && d.models.fixed) || [];
  return h('div', { class: 'step' },
    h('h3', { text: '3. Say what each field is' }),
    rows.length ? h('div', { class: 'list' }, rows) : h('div', { class: 'note', text: 'The example has no JSON body. Use the definition below to write one.' }),
    textField('Models to offer, separated by commas', models.map((m) => m.id).join(', '), (v) => { d.models = { ...(d.models || {}), fixed: v.split(',').map((x) => x.trim()).filter(Boolean).map((id) => ({ id, name: id })) }; }),
    d.pictures.length ? h('div', { class: 'list' }, d.pictures.map((p) => h('div', { class: 'item' },
      h('span', { class: 'chip', text: p.name }), h('span', { text: 'up to' }),
      h('input', { type: 'number', min: 1, max: 16, value: String(p.max), class: 'w70', onchange: (e) => { p.max = Number(e.target.value) || 1; } }),
      h('span', { class: 'note', text: 'pictures, sent as data: addresses' })))) : null);
}

function resultStep(d) {
  const r = d.result;
  const box = h('div', { class: 'step' }, h('h3', { text: '4. Find the result in the answer' }),
    h('div', { class: 'row' },
      h('label', { class: 'switch' }, h('input', { type: 'radio', name: 'mode', checked: r.mode === 'sync', onchange: () => { r.mode = 'sync'; render(); } }), h('span', { text: 'The answer has the result' })),
      h('label', { class: 'switch' }, h('input', { type: 'radio', name: 'mode', checked: r.mode === 'task', onchange: () => { r.mode = 'task'; r.done = r.done || ['succeeded']; r.failed = r.failed || ['failed']; render(); } }), h('span', { text: 'The answer has a task to check later' }))),
    h('div', { class: 'note', text: `A test sends one real request to ${host(d.request.url)}. The service may bill it.` }),
    h('div', { class: 'row' },
      h('input', { type: 'text', class: 'grow', value: ui.testPrompt, oninput: (e) => { ui.testPrompt = e.target.value; } }),
      h('button', { class: 'btn', text: 'Send a test request', onclick: () => runTest(d) })));
  if (ui.test) {
    const pick = (field) => (p) => { r[field] = field === 'media' ? p.replace(/\[0\]/, '[*]') : p; render(); };
    box.append(h('div', { class: 'note', text: `The service answered with status ${ui.test.status}. Click a field to use it.` }),
      h('pre', { class: 'answer', text: JSON.stringify(ui.test.answer, null, 2) }),
      chips('Result', ui.test.paths, r.media, pick('media')));
    if (r.mode === 'task') box.append(chips('Task id', ui.test.paths, r.taskId, pick('taskId')), chips('Task status', ui.test.paths, r.status, pick('status')));
  }
  box.append(textField('Where the result is', r.media, (v) => { r.media = v.trim(); }, 'For example data[*].url or output.video_url. [*] collects every item.'));
  if (r.mode === 'task') {
    box.append(h('div', { class: 'two' },
      textField('Where the task id is', r.taskId, (v) => { r.taskId = v.trim(); }),
      textField('Where the task status is', r.status, (v) => { r.status = v.trim(); })),
      textField('Address to check the task', (r.poll && r.poll.url) || '', (v) => { r.poll = { url: v.trim() }; }, 'From the provider\'s documentation, with {id} where the task id goes.'),
      h('div', { class: 'two' },
        textField('Status values that mean finished', (r.done || []).join(', '), (v) => { r.done = v.split(',').map((x) => x.trim()).filter(Boolean); }),
        textField('Status values that mean failed', (r.failed || []).join(', '), (v) => { r.failed = v.split(',').map((x) => x.trim()).filter(Boolean); })),
      textField('Seconds between checks', String(r.interval || 15), (v) => { r.interval = Number(v) || 15; }));
  }
  return box;
}

function chips(label, paths, current, onPick) {
  return h('div', { class: 'field' }, h('span', { class: 'name', text: label }), h('div', { class: 'chips' },
    paths.slice(0, 60).map((p) => h('button', { class: `chip ${current === p.path || current === p.path.replace(/\[0\]/, '[*]') ? 'on' : ''}`, title: p.sample, text: p.looks ? `${p.path} (${p.looks})` : p.path, onclick: () => onPick(p.path) }))));
}

async function runTest(d) {
  ui.draftError = '';
  try {
    const models = (d.models && d.models.fixed) || [];
    ui.test = await ot.serviceTest(d, { prompt: ui.testPrompt, model: models[0] ? models[0].id : '' });
  } catch (e) { ui.draftError = e.message; }
  render();
}

function saveStep(d) {
  if (!ui.jsonText) ui.jsonText = JSON.stringify(d, null, 2);
  const area = h('textarea', { class: 'code', value: JSON.stringify(d, null, 2), oninput: (e) => { ui.jsonText = e.target.value; } });
  return h('div', { class: 'step' },
    h('h3', { text: '5. Save' }),
    h('details', {}, h('summary', { text: 'Edit the full definition' }),
      h('div', { class: 'note', text: 'Every part of the service is here as data. Changes apply when you click Apply.' }),
      area, h('button', { class: 'btn small', text: 'Apply', onclick: () => { try { ui.draft = JSON.parse(area.value); ui.draftError = ''; } catch { ui.draftError = 'The definition is not valid JSON.'; } render(); } })),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', text: 'Save the service', onclick: async () => {
        ui.draftError = '';
        try { S.services = await ot.serviceSave(d); S = await ot.state(); ui.adding = false; ui.draft = null; snack(`Saved. Choose ${d.name} on the ${d.kind === 'video' ? 'Videos' : 'Pictures'} tab.`); }
        catch (e) { ui.draftError = e.message; }
        render();
      } })));
}

function foldersSection() {
  const row = (kind, label) => h('div', { class: 'item' }, h('strong', { class: 'w80', text: label }), h('span', { class: 'grow note', text: S.saveDirs[kind] }),
    h('button', { class: 'btn small', text: 'Open', onclick: () => ot.folderOpen(kind).catch((e) => snack(e.message)) }),
    h('button', { class: 'btn small', text: 'Change', onclick: async () => { S.saveDirs[kind] = await ot.folderChange(kind); render(); } }));
  return h('section', {}, h('h2', { text: 'Save folders' }), h('div', { class: 'box' }, h('div', { class: 'list' }, row('image', 'Pictures'), row('video', 'Videos'))));
}

function hostsSection() {
  return h('section', {}, h('h2', { text: 'Allowed addresses' }), h('div', { class: 'box' },
    h('div', { class: 'note', text: 'OT Studio reaches only Replicate, SpicyAPI, OpenRouter, and the addresses you allowed here. It sends nothing anywhere else.' }),
    S.hosts.length ? h('div', { class: 'list' }, S.hosts.map((x) => h('div', { class: 'item' }, h('span', { class: 'grow', text: x }),
      h('button', { class: 'btn small danger', text: 'Remove', onclick: async () => { S.hosts = await ot.hostsRemove(x); render(); } })))) : h('div', { class: 'note', text: 'You have not allowed any other address.' })));
}

function viewSection() {
  return h('section', {}, h('h2', { text: 'View' }), h('div', { class: 'box' },
    h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: S.settings.simpleView, onchange: (e) => setSimple(e.target.checked) }),
      h('span', { text: 'Simple view: show only the main settings for each model' }))));
}

function aboutSection() {
  return h('section', {}, h('h2', { text: 'About' }), h('div', { class: 'box' },
    h('div', { text: `OT Studio for Windows, version ${S.version}. Created by OrangeTiger.` }),
    h('div', { class: 'note', text: 'Free software under the GNU General Public License, version 3.' }),
    h('div', {}, h('button', { class: 'btn small', text: 'Open the project page', onclick: () => ot.linkOpen('repo') }))));
}

init().catch((e) => { document.getElementById('main').replaceChildren(h('div', { class: 'page' }, h('div', { class: 'message', text: `OT Studio could not start: ${e.message}` }))); });
