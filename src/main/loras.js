'use strict';
// The LoRA library and LoRA training on Replicate (ostris/flux-dev-lora-trainer). Training photos are screened and
// turned into upright JPEG copies on this PC, packed into a ZIP, and sent to a private model in the user's own Replicate
// account. Starting a training is billed, so it is sent once and never repeated on its own.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const lora = require('../core/lora');
const { zip } = require('./zip');
const { NetError } = require('./netguard');

const BASE = 'https://api.replicate.com/v1';
const MIN_SIDE = 512;
const MAX_PHOTO = 50 * 1024 * 1024;
const MAX_ZIP = 95 * 1024 * 1024;
const POLL_MS = 30000;

class TrainError extends Error {}

function createLoras({ store, keys, net, mediaDir, upload, notify, now = () => Date.now() }) {
  let library = store.read('loras', []);
  let trainings = store.read('trainings', []);
  const busy = new Set();

  const state = () => ({ library, trainings });
  function saveAll() { store.write('loras', library); store.write('trainings', trainings); notify(state()); }
  function key() {
    const k = keys.get('replicate');
    if (!k) throw new TrainError('Add your Replicate key in Settings first.');
    return k;
  }
  const auth = (k) => ({ Authorization: `Bearer ${k}` });
  async function api(method, url, k, body) {
    const res = await net.request(url, { method, headers: { ...auth(k), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, keyHeaders: ['Authorization'] });
    const json = await net.json(res);
    return { res, json };
  }
  const reason = (json, fallback) => String((json && (json.detail || json.error || json.title)) || fallback).replace(/[\p{Cc}]+/gu, ' ').slice(0, 300);

  // ---- the library ----

  function add(item) {
    const v = lora.validate(item);
    const existing = library.find((l) => l.reference === v.reference);
    if (existing) { Object.assign(existing, v); saveAll(); return existing; }
    const entry = { id: crypto.randomUUID(), ...v, added: now() };
    library.push(entry);
    saveAll();
    return entry;
  }
  function edit(id, patch) {
    const item = library.find((l) => l.id === id);
    if (!item) throw new TrainError('That LoRA is gone.');
    Object.assign(item, lora.validate({ ...item, ...patch }));
    saveAll();
    return item;
  }
  function remove(id) { library = library.filter((l) => l.id !== id); saveAll(); }
  function importText(text) { return add(lora.parse(text)); }
  function exportText(id) {
    const item = library.find((l) => l.id === id);
    if (!item) throw new TrainError('That LoRA is gone.');
    return { name: item.name, text: lora.toFile(item) };
  }

  // ---- training photos ----

  /** Checks one photo and keeps an upright JPEG copy (at most 2048 pixels on the long side) for training. */
  async function addPhoto(src) {
    const base = path.basename(src);
    let stat;
    try { stat = fs.statSync(src); } catch { return { file: base, ok: false, reason: 'could not be opened' }; }
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_PHOTO) return { file: base, ok: false, reason: 'is empty or larger than 50 MB' };
    let img;
    try {
      img = await sharp(fs.readFileSync(src), { failOn: 'error' }).rotate().removeAlpha().toBuffer({ resolveWithObject: true });
    } catch {
      return { file: base, ok: false, reason: /\.hei[cf]$/i.test(base) ? 'is a HEIC photo, which OT Studio cannot read. Save it as JPEG first (Photos app: Save as).' : 'is not a photo OT Studio can read' };
    }
    const { width, height } = img.info;
    if (Math.min(width, height) < MIN_SIDE) return { file: base, ok: false, reason: `is too small (${width} by ${height} pixels)` };
    const jpeg = await sharp(img.data).resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 95, mozjpeg: true }).toBuffer();
    const name = `tr-${crypto.randomUUID()}.jpg`;
    fs.writeFileSync(path.join(mediaDir, name), jpeg);
    return { file: base, ok: true, name, width, height };
  }

  // ---- training ----

  async function ensureDestination(k, owner, slug) {
    const dest = `${owner}/${slug}`;
    const found = await api('GET', `${BASE}/models/${dest}`, k);
    if (found.res.status === 404) {
      const made = await api('POST', `${BASE}/models`, k, { owner, name: slug, visibility: 'private', hardware: 'cpu', description: 'FLUX dev LoRA trained with OT Studio' });
      if (!made.res.ok || made.json.owner !== owner || made.json.name !== slug) throw new TrainError(reason(made.json, 'Replicate did not create the private model for this LoRA.'));
      return dest;
    }
    if (!found.res.ok) throw new TrainError(reason(found.json, `Replicate answered with status ${found.res.status}.`));
    if (found.json.visibility !== 'private') throw new TrainError(`The model ${dest} exists but is not private. Choose another LoRA name.`);
    return dest;
  }

  /** Starts a training. [photos] are names from addPhoto. This request is billed by Replicate. */
  async function train({ name, trigger, photos, steps = 1000, rank, base = 'flux-dev' }) {
    const n = String(name || '').trim();
    const qwen = base === 'qwen-image';
    if (!lora.BASES[base]) throw new TrainError('Choose a trainer.');
    if (!n || n.length > 80 || /\p{Cc}/u.test(n)) throw new TrainError('Give the LoRA a name of up to 80 characters.');
    if (qwen && !lora.QWEN_PHRASE.test(String(trigger || ''))) throw new TrainError('Describe the subject in a few plain words, such as "a person named Pao".');
    if (!qwen && !lora.TRIGGER.test(String(trigger || ''))) throw new TrainError('Use a trigger word of letters, digits, or underscores that starts with a letter, such as MARKFACE.');
    const s = Number(steps);
    const r = Number(rank ?? (qwen ? 64 : 16));
    const limits = qwen ? { s: [100, 6000], r: [8, 128] } : { s: [3, 6000], r: [1, 128] };
    if (!Number.isInteger(s) || s < limits.s[0] || s > limits.s[1] || !Number.isInteger(r) || r < limits.r[0] || r > limits.r[1]) throw new TrainError(`Steps must be ${limits.s[0]} to ${limits.s[1]}, and rank ${limits.r[0]} to ${limits.r[1]}.`);
    const list = Array.isArray(photos) ? photos.map(String) : [];
    if (list.length < 1 || list.length > 20) throw new TrainError('Choose 1 to 20 photos. 10 or more work best.');
    if (new Set(list).size !== list.length || list.some((p) => !/^tr-[\w-]+\.jpg$/.test(p) || !fs.existsSync(path.join(mediaDir, p)))) throw new TrainError('A chosen photo is gone. Choose the photos again.');
    const k = key();
    const files = list.map((p, i) => ({ name: `photo-${String(i + 1).padStart(2, '0')}.jpg`, data: fs.readFileSync(path.join(mediaDir, p)) }));
    const archive = zip(files);
    if (archive.length > MAX_ZIP) throw new TrainError('The photos are larger than 95 MB together. Remove a few.');
    const account = await api('GET', `${BASE}/account`, k);
    const owner = account.json && account.json.username;
    if (!account.res.ok || typeof owner !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(owner)) throw new TrainError(reason(account.json, 'Replicate did not report your account name.'));
    // The Qwen trainer is run on its newest version, read from Replicate; the FLUX trainer stays on its checked version.
    let trainer = lora.TRAINER;
    let version = lora.TRAINER_VERSION;
    if (qwen) {
      trainer = lora.QWEN_TRAINER;
      const m = await api('GET', `${BASE}/models/${trainer}`, k);
      version = m.json && m.json.latest_version && m.json.latest_version.id;
      if (!m.res.ok || typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version)) throw new TrainError(reason(m.json, 'Replicate did not report the Qwen trainer version.'));
    }
    const destination = await ensureDestination(k, owner, lora.destinationSlug(n, base));
    const fileUrl = await upload(archive, 'photos.zip', 'application/zip', k);
    const record = { id: crypto.randomUUID(), name: n, trigger, steps: s, rank: r, base, trainer, trainerVersion: version, destination, photos: list, state: 'sending', progress: null, created: now() };
    trainings.unshift(record);
    saveAll();
    let sent;
    try {
      const input = qwen
        // Qwen has no captioning step: every photo gets this one plain description.
        ? { dataset: fileUrl, steps: s, lora_rank: r, default_caption: `A photo of ${trigger}`, batch_size: 1 }
        : { input_images: fileUrl, trigger_word: trigger, steps: s, lora_rank: r, autocaption: true };
      sent = await api('POST', `${BASE}/models/${trainer}/versions/${version}/trainings`, k, { destination, input });
    } catch (e) {
      const unknown = !(e instanceof NetError) || e.sent;
      Object.assign(record, unknown
        ? { state: 'uncertain', error: `${e.message} The training may have started. Check replicate.com/trainings before you start another.` }
        : { state: 'failed', error: e.message });
      saveAll();
      return record;
    }
    if (!sent.res.ok || typeof sent.json.id !== 'string' || !/^[\w-]{1,160}$/.test(sent.json.id)) {
      Object.assign(record, { state: 'failed', error: reason(sent.json, `Replicate answered with status ${sent.res.status}.`) });
    } else Object.assign(record, { trainingId: sent.json.id, state: sent.json.status || 'starting', nextPoll: now() + POLL_MS });
    saveAll();
    return record;
  }

  async function check(record) {
    if (busy.has(record.id)) return;
    busy.add(record.id);
    try {
      const { res, json } = await api('GET', `${BASE}/trainings/${encodeURIComponent(record.trainingId)}`, key());
      if (!res.ok || json.id !== record.trainingId) { record.nextPoll = now() + POLL_MS; return; }
      const st = json.status;
      record.progress = lora.progress(json.logs, record.steps) ?? record.progress;
      record.phase = lora.phase(json.logs, record.progress) || record.phase || null;
      record.checked = now();
      if (record.progress !== null && record.progress !== undefined && !record.firstStepAt) Object.assign(record, { firstStepAt: now(), firstProgress: record.progress });
      record.minutesLeft = lora.minutesLeft(record.firstStepAt, record.firstProgress, now(), record.progress);
      if (st === 'succeeded') {
        const version = json.output && typeof json.output.version === 'string' ? json.output.version.replace(':', '/') : '';
        const weights = json.output && typeof json.output.weights === 'string' && /^https:\/\//.test(json.output.weights) ? json.output.weights : '';
        const ownVersion = new RegExp(`^${record.destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[a-f0-9]{64}$`).test(version);
        // FLUX LoRAs must come back as a version of the private model. A Qwen LoRA may come back as a weights file
        // instead, which Qwen Image with a LoRA can run.
        const reference = ownVersion ? version : record.base === 'qwen-image' && weights ? weights : '';
        if (!reference) {
          Object.assign(record, { state: 'failed', error: 'The finished training did not return a model version from your private model.' });
        } else {
          const item = add({ name: record.name, reference, trigger: record.trigger, scale: 1, baseModel: record.base || 'flux-dev' });
          Object.assign(record, { state: 'succeeded', progress: 1, reference, loraId: item.id, finished: now() });
        }
      } else if (st === 'failed' || st === 'canceled') {
        Object.assign(record, { state: st, error: st === 'failed' ? reason({ error: json.error }, 'The training failed.') : undefined, finished: now() });
      } else {
        Object.assign(record, { state: st === 'processing' ? 'processing' : 'starting', nextPoll: now() + POLL_MS });
      }
    } catch (e) {
      record.nextPoll = now() + POLL_MS;
      record.note = e.message;
    } finally {
      busy.delete(record.id);
      saveAll();
    }
  }

  function tick() {
    for (const t of trainings) if (['starting', 'processing'].includes(t.state) && t.trainingId && (t.nextPoll || 0) <= now()) check(t);
  }

  async function cancel(id) {
    const t = trainings.find((x) => x.id === id);
    if (!t || !t.trainingId || !['starting', 'processing'].includes(t.state)) throw new TrainError('This training is not running.');
    const { res, json } = await api('POST', `${BASE}/trainings/${encodeURIComponent(t.trainingId)}/cancel`, key(), {});
    if (!res.ok) throw new TrainError(reason(json, 'Replicate did not stop the training.'));
    Object.assign(t, { state: 'canceled', finished: now() });
    saveAll();
  }

  function forget(id) {
    const t = trainings.find((x) => x.id === id);
    if (!t || ['sending', 'starting', 'processing'].includes(t.state)) throw new TrainError('A running training stays in the list until it ends.');
    trainings = trainings.filter((x) => x !== t);
    for (const p of t.photos || []) if (!trainings.some((x) => (x.photos || []).includes(p))) fs.rm(path.join(mediaDir, p), { force: true }, () => {});
    saveAll();
  }

  /** On start: a training that was being sent when OT Studio closed has an unknown outcome. */
  function resume() {
    for (const t of trainings) {
      if (t.state === 'sending') Object.assign(t, { state: 'uncertain', error: 'OT Studio closed while starting this training. Check replicate.com/trainings before you start another.' });
      if (['starting', 'processing'].includes(t.state)) t.nextPoll = 0;
    }
    store.write('trainings', trainings);
    // Photos chosen for a training that was never started are not needed after a restart.
    const kept = new Set(trainings.flatMap((t) => t.photos || []));
    try {
      for (const f of fs.readdirSync(mediaDir)) if (/^tr-[\w-]+\.jpg$/.test(f) && !kept.has(f)) fs.rmSync(path.join(mediaDir, f), { force: true });
    } catch { /* the folder may not exist yet */ }
  }

  return { state, add, edit, remove, importText, exportText, addPhoto, train, tick, cancel, forget, resume };
}

module.exports = { createLoras, TrainError, MIN_SIDE };
