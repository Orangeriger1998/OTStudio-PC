'use strict';
// Runs picture and video jobs: sends the request, checks running tasks, downloads results into the media folder, and
// keeps the history. A paid request is sent once. It is never retried on its own; if the outcome is unknown, the job says
// so and the user decides. Task checks are free GET requests, so those continue until the task ends.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const service = require('../core/service');
const replicate = require('../core/replicate');
const { get, stringPaths } = require('../core/jsonpath');
const { sniff, NAME_RE, typeOf } = require('./media');
const { NetError } = require('./netguard');
const imaging = require('./imaging');
const video = require('./video');
const lora = require('../core/lora');

const REPLICATE = { id: 'replicate', name: 'Replicate', keySlot: 'replicate', keyLabel: 'Replicate', builtin: true, special: true };
const HISTORY_MAX = 2000;
const PICTURE_MAX = 30 * 1024 * 1024;
/** Models the picture tools use on Replicate. They take fixed inputs, so they are not in the model lists. */
const EXPANDER = 'black-forest-labs/flux-fill-dev';
const UPSCALER = 'nightmareai/real-esrgan';
const BUSY_STATES = ['sending', 'running', 'downloading', 'finishing'];

class JobError extends Error {}

function createJobs({ store, keys, net, mediaDir, services, approveHost, approvedHosts, notify, now = () => Date.now() }) {
  fs.mkdirSync(mediaDir, { recursive: true });
  let history = store.read('history', []);
  const busy = new Set();

  const save = () => store.write('history', history.slice(0, HISTORY_MAX));
  const find = (id) => history.find((e) => e.id === id);
  function update(entry, changes) {
    Object.assign(entry, changes);
    save();
    notify(entry);
  }
  function def(id) {
    if (id === 'replicate') return REPLICATE;
    const d = services().find((s) => s.id === id);
    if (!d) throw new JobError('That service is not set up anymore.');
    return d;
  }
  function key(d) {
    const k = keys.get(d.keySlot);
    if (!k) throw new JobError(`Add your ${d.keyLabel || d.name} key in Settings first.`);
    return k;
  }
  const bearer = (k) => ({ Authorization: `Bearer ${k}` });

  // ---- pictures the user chose ----

  function mediaPath(name) {
    if (!NAME_RE.test(String(name))) throw new JobError('That picture is not in the media folder.');
    return path.join(mediaDir, name);
  }

  /** Copies a picture into the media folder and returns its file name. */
  function addPicture(src) {
    const stat = fs.statSync(src);
    if (!stat.isFile() || stat.size > PICTURE_MAX) throw new JobError('Pictures must be files of up to 30 MB.');
    const buf = fs.readFileSync(src);
    const t = sniff(buf);
    if (!t || t.kind !== 'image') throw new JobError('That file is not a PNG, JPEG, WebP, or GIF picture.');
    const name = `in-${crypto.randomUUID()}.${t.ext}`;
    fs.writeFileSync(path.join(mediaDir, name), buf);
    return name;
  }

  function dataUri(name) {
    const buf = fs.readFileSync(mediaPath(name));
    const t = sniff(buf);
    if (!t || t.kind !== 'image') throw new JobError('A chosen picture is not readable.');
    return `data:${t.type};base64,${buf.toString('base64')}`;
  }

  // ---- model lists and inputs ----

  function cache() { return store.read('modelcache', {}); }
  function putCache(k, v) { const c = cache(); c[k] = { at: now(), value: v }; store.write('modelcache', c); }

  async function readJson(res) { return net.json(res); }

  async function replicateSchema(model, kind, refresh) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(model)) throw new JobError('The model must look like owner/name.');
    const c = cache()[`replicate:${model}`];
    if (c && !refresh) return replicate.parseSchema(c.value, kind, model);
    const res = await net.request(`${replicate.BASE}/models/${model}`, { headers: bearer(key(REPLICATE)), keyHeaders: ['Authorization'] });
    const body = await readJson(res);
    if (!res.ok) throw new JobError(res.status === 404 ? 'Replicate has no model with that name, or it is private to another account.' : service.errorText({ result: {} }, body) || `Replicate answered with status ${res.status}.`);
    if (`${body.owner}/${body.name}` !== model) throw new JobError('Replicate returned a different model.');
    const doc = body.latest_version?.openapi_schema;
    if (!doc) throw new JobError('This model has no readable input list.');
    const controls = replicate.parseSchema(doc, kind, model);
    putCache(`replicate:${model}`, doc);
    return controls;
  }

  /** The input list of one version of a Replicate model, such as a trained LoRA. */
  async function versionSchema(owner, name, version, k) {
    const id = `replicate:${owner}/${name}/${version}`;
    const c = cache()[id];
    if (c) return replicate.parseSchema(c.value, 'image', `${owner}/${name}`);
    const res = await net.request(`${replicate.BASE}/models/${owner}/${name}/versions/${version}`, { headers: bearer(k), keyHeaders: ['Authorization'] });
    const body = await readJson(res);
    if (!res.ok) throw new JobError(res.status === 404 ? 'Replicate cannot find this trained LoRA. It may belong to another account, or the model was deleted.' : service.errorText({ result: {} }, body) || `Replicate answered with status ${res.status}.`);
    if (body.id !== version || !body.openapi_schema) throw new JobError('Your trained LoRA has no readable input list.');
    putCache(id, body.openapi_schema);
    return replicate.parseSchema(body.openapi_schema, 'image', `${owner}/${name}`);
  }

  /** The service's models: its fixed list, plus the provider's own list once loaded. */
  async function models(id, refresh) {
    const d = def(id);
    if (d.special) return null;
    const fixed = (d.models?.fixed || []).map((m) => ({ id: m.id, name: m.name || m.id }));
    const k = `models:${d.id}`;
    let loaded = cache()[k]?.value || null;
    if (refresh && d.models?.url) {
      const headers = {};
      const saved = keys.has(d.keySlot) ? keys.get(d.keySlot) : '';
      if (saved && d.keyHeader) headers[d.keyHeader.name] = d.keyHeader.template.replace('{key}', saved);
      const res = await net.request(d.models.url, { headers, keyHeaders: d.keyHeader ? [d.keyHeader.name] : [] });
      const body = await readJson(res);
      if (!res.ok) throw new JobError(service.errorText(d, body) || `The model list answered with status ${res.status}.`);
      const items = get(body, d.models.list || '');
      if (!Array.isArray(items)) throw new JobError('The model list has an unexpected shape.');
      loaded = items.slice(0, 500).filter((m) => m && service.MODEL_RE.test(String(get(m, d.models.id || 'id')))).map((m) => {
        const info = { ...m };
        delete info.description;
        return { id: String(get(m, d.models.id || 'id')), name: String(get(m, d.models.name || 'name') || get(m, d.models.id || 'id')).slice(0, 80), info };
      });
      putCache(k, loaded);
    }
    // The short list comes first (with the provider's details once loaded), then everything else the provider offers.
    const all = loaded || [];
    const out = [...fixed.map((f) => { const m = all.find((x) => x.id === f.id); return m ? { ...m, name: f.name } : f; }), ...all.filter((m) => !fixed.some((f) => f.id === m.id))];
    return out.length ? out : [{ id: 'default', name: 'Default' }];
  }

  function modelInfo(d, model) {
    const loaded = cache()[`models:${d.id}`]?.value || [];
    return loaded.find((m) => m.id === model)?.info || null;
  }

  /** The form for one model: settings and picture inputs. */
  async function form(id, model, kind, refresh) {
    const d = def(id);
    if (d.special) {
      const controls = await replicateSchema(model, kind, refresh);
      return { controls: controls.filter((c) => !c.picture && c.name !== 'prompt'), pictures: controls.filter((c) => c.picture), hasPrompt: controls.some((c) => c.name === 'prompt') };
    }
    const info = modelInfo(d, model);
    return { controls: service.controls(d, model, info), pictures: service.pictureInputs(d, info), hasPrompt: true };
  }

  // ---- running jobs ----

  function entryFor(kind, d, req) {
    return {
      id: crypto.randomUUID(), kind, service: d.id, serviceName: d.name, model: req.model, prompt: String(req.prompt || '').slice(0, 10000),
      options: req.options || {}, pictures: req.pictures || {}, state: 'sending', files: [], created: now(),
    };
  }

  async function generate(req) {
    const kind = req.kind === 'video' ? 'video' : 'image';
    const d = def(req.service);
    if (!d.special && d.kind !== kind) throw new JobError('That service does not make this kind of media.');
    const k = key(d);
    for (const names of Object.values(req.pictures || {})) for (const n of names) mediaPath(n);
    const entry = entryFor(kind, d, req);
    if (req.op && req.op.type === 'longer') {
      const parent = find(String(req.op.parent));
      if (!parent || parent.kind !== 'video' || parent.state !== 'done' || !parent.files.length) throw new JobError('The video to continue is gone.');
      if (kind !== 'video') throw new JobError('Only videos can be made longer.');
      entry.op = { type: 'longer', parent: parent.id, parentFile: parent.files[0] };
    }
    let request;
    const own = d.special && req.model === lora.MODEL && typeof (req.options || {}).lora_weights === 'string' ? lora.OWN.exec(req.options.lora_weights) : null;
    if (own) {
      // A LoRA trained into the user's own private model: the public FLUX dev LoRA model cannot download it, so the
      // trained model's own version runs instead. That version already carries the LoRA.
      const [, owner, name, version] = own;
      const controls = await versionSchema(owner, name, version, k);
      const names = new Set(controls.map((c) => c.name));
      const options = {};
      for (const [n, v] of Object.entries(req.options || {})) {
        if (n === 'lora_weights') continue;
        if (names.has(n)) options[n] = v;
        else if (n === 'guidance' && names.has('guidance_scale')) options.guidance_scale = v;
      }
      const links = {};
      for (const [field, list] of Object.entries(req.pictures || {})) {
        if (!controls.some((c) => c.picture && c.name === field)) continue;
        links[field] = [];
        for (const n of list) links[field].push(await uploadToReplicate(n, k));
      }
      const input = replicate.buildInput(controls, req.prompt, options, links);
      request = { method: 'POST', url: `${replicate.BASE}/predictions`, body: JSON.stringify({ version, input }), headers: { ...bearer(k), 'Content-Type': 'application/json' }, keyHeaders: ['Authorization'] };
    } else if (d.special) {
      const controls = await replicateSchema(req.model, kind, false);
      const links = {};
      for (const [field, names] of Object.entries(req.pictures || {})) {
        if (!controls.some((c) => c.picture && c.name === field)) continue;
        links[field] = [];
        for (const n of names) links[field].push(await uploadToReplicate(n, k));
      }
      const input = replicate.buildInput(controls, req.prompt, req.options || {}, links);
      const r = replicate.createRequest(req.model, input);
      request = { ...r, headers: { ...bearer(k), 'Content-Type': 'application/json' }, keyHeaders: ['Authorization'] };
    } else {
      const pictures = {};
      for (const [field, names] of Object.entries(req.pictures || {})) pictures[field] = names.map(dataUri);
      const r = service.buildRequest(d, { prompt: req.prompt, model: req.model, options: req.options, pictures }, k, modelInfo(d, req.model));
      request = { ...r, keyHeaders: d.keyHeader ? [d.keyHeader.name] : [] };
      entry.options = r.sent.options;
    }
    history.unshift(entry);
    save();
    notify(entry);
    send(entry, d, request);
    return entry;
  }

  async function uploadToReplicate(name, k) {
    return uploadBuffer(fs.readFileSync(mediaPath(name)), name, typeOf(name), k);
  }

  async function uploadBuffer(buf, filename, type, k) {
    const form = new FormData();
    form.append('content', new Blob([buf], { type }), filename);
    const res = await net.request(`${replicate.BASE}/files`, { method: 'POST', headers: bearer(k), body: form, keyHeaders: ['Authorization'], timeout: 180000 });
    const body = await readJson(res);
    const url = body?.urls?.get;
    if (!res.ok || typeof url !== 'string' || !url.startsWith('https://')) throw new JobError(service.errorText({ result: {} }, body) || 'Replicate did not accept the picture.');
    return url;
  }

  /** Starts a Replicate job with fixed inputs, for the picture tools. */
  function startReplicate(entry, model, input, k) {
    const r = replicate.createRequest(model, input);
    history.unshift(entry);
    save();
    notify(entry);
    send(entry, REPLICATE, { ...r, headers: { ...bearer(k), 'Content-Type': 'application/json' }, keyHeaders: ['Authorization'] });
    return entry;
  }

  function existing(name) {
    const file = mediaPath(name);
    if (!fs.existsSync(file)) throw new JobError('That picture is gone.');
    return file;
  }

  /** Expand: paints new area around a picture so it takes a new shape, then rebuilds it at full size. */
  async function expand({ source, ratio, prompt, safety }) {
    const file = existing(source);
    const k = key(REPLICATE);
    const { plan, canvas, mask } = await imaging.expandInputs(file, ratio);
    const text = String(prompt || '').trim().slice(0, 2000);
    const entry = {
      ...entryFor('image', REPLICATE, { model: EXPANDER, prompt: text, options: { shape: ratio }, pictures: { source: [source] } }),
      op: { type: 'expand', source, ratio, plan, safety: safety !== false },
    };
    const image = await uploadBuffer(canvas, 'canvas.png', 'image/png', k);
    const maskUrl = await uploadBuffer(mask, 'mask.png', 'image/png', k);
    return startReplicate(entry, EXPANDER, {
      prompt: text || 'a natural continuation of the photo, with the same light and style',
      image, mask: maskUrl, megapixels: 'match_input', output_format: 'png', num_inference_steps: 28, disable_safety_checker: safety === false,
    }, k);
  }

  /** Upscale with Real-ESRGAN. Pictures that are already large are refused, because the provider's GPU cannot take them. */
  async function upscale({ source, scale, faceEnhance }) {
    const file = existing(source);
    const k = key(REPLICATE);
    const { width, height } = await imaging.size(file);
    if (width * height > imaging.UPSCALE_MAX_PIXELS) throw new JobError(`This picture is already large (${width} by ${height}). The upscaler takes pictures of up to about 2 megapixels, such as 1440 by 1440.`);
    const factor = Number(scale) === 2 ? 2 : 4;
    const entry = {
      ...entryFor('image', REPLICATE, { model: UPSCALER, prompt: '', options: { scale: factor, face_enhance: !!faceEnhance }, pictures: { source: [source] } }),
      op: { type: 'upscale', source, scale: factor, faceEnhance: !!faceEnhance, from: { width, height } },
    };
    const image = await uploadToReplicate(source, k);
    return startReplicate(entry, UPSCALER, { image, scale: factor, face_enhance: !!faceEnhance }, k);
  }

  /** The size of a picture in the media folder. */
  async function size(name) {
    return imaging.size(existing(name));
  }

  /** The last frame of a finished video, as a picture in the media folder. */
  async function lastFrame(id) {
    const e = find(String(id));
    if (!e || e.kind !== 'video' || e.state !== 'done' || !e.files.length) throw new JobError('That video is not finished.');
    const name = `in-${crypto.randomUUID()}.png`;
    await video.lastFrame(mediaPath(e.files[0]), path.join(mediaDir, name));
    return name;
  }

  /** The local step after a download: rebuilding an expanded picture, or joining a new part to its video. */
  async function finish(entry) {
    if (!entry.op || !['expand', 'longer'].includes(entry.op.type)) return;
    entry.raw = [...entry.files];
    update(entry, { state: 'finishing', status: entry.op.type === 'expand' ? 'Rebuilding at full size' : 'Joining the videos' });
    try {
      let name;
      if (entry.op.type === 'expand') {
        const out = await imaging.expandResult(mediaPath(entry.op.source), fs.readFileSync(mediaPath(entry.raw[0])), entry.op.plan);
        name = `img-${entry.id.slice(0, 8)}-full.jpg`;
        fs.writeFileSync(path.join(mediaDir, name), out);
      } else {
        name = `vid-${entry.id.slice(0, 8)}-joined.mp4`;
        await video.join([mediaPath(entry.op.parentFile), mediaPath(entry.raw[0])], path.join(mediaDir, name));
      }
      update(entry, { state: 'done', files: [name], status: '', error: undefined });
    } catch (e) {
      const what = entry.op.type === 'expand' ? 'The full-size picture could not be built, so this is the smaller result.' : 'The videos could not be joined, so this is the new part alone.';
      update(entry, { state: 'done', files: entry.raw, status: '', error: `${what} ${e.message}` });
    }
  }

  async function send(entry, d, request) {
    let res;
    try {
      res = await net.request(request.url, { method: request.method, headers: request.headers, body: request.body, keyHeaders: request.keyHeaders, timeout: d.special ? 60000 : 300000 });
    } catch (e) {
      const sent = !(e instanceof NetError) || e.sent;
      update(entry, sent
        ? { state: 'uncertain', error: `${e.message} The request may have reached ${d.name}. Check your account there before you try again.` }
        : { state: 'failed', error: e.message });
      return;
    }
    let body;
    try { body = await readJson(res); } catch (e) { update(entry, { state: 'uncertain', error: `${e.message} Check your account at ${d.name} before you try again.` }); return; }
    try {
      const r = d.special ? (res.ok ? replicate.readPrediction(body) : { state: 'failed', error: service.errorText({ result: {} }, body) || `Replicate answered with status ${res.status}.` }) : service.readStart(d, res.status, body);
      await apply(entry, d, r);
    } catch (e) {
      update(entry, { state: 'failed', error: e.message });
    }
  }

  async function apply(entry, d, r) {
    if (r.taskId) entry.taskId = r.taskId;
    if (r.cost !== undefined) entry.cost = r.cost;
    if (r.state === 'running') {
      const wait = d.special ? 3 : d.result.interval;
      update(entry, { state: 'running', status: r.status || '', nextPoll: now() + wait * 1000 });
    } else if (r.state === 'done') {
      update(entry, { state: 'downloading', remote: r.media.filter((m) => m.url).map((m) => m.url) });
      await download(entry, d, r.media);
    } else if (r.state === 'canceled') {
      update(entry, { state: 'canceled', finished: now() });
    } else {
      update(entry, { state: 'failed', error: r.error || 'The job failed.', finished: now() });
    }
  }

  async function download(entry, d, items) {
    const files = [];
    try {
      for (const [i, m] of items.entries()) {
        let buf;
        if (m.data) buf = Buffer.from(m.data, 'base64');
        else {
          const u = new URL(m.url);
          const sameOrigin = !d.special && u.origin === new URL(d.request.url).origin;
          const replicateApi = d.special && u.origin === new URL(replicate.BASE).origin;
          const known = approvedHosts().concat(d.mediaHosts || []);
          if (!require('../core/hosts').allowed(m.url, known) && !(await approveHost(u.hostname, `${d.name} put the finished ${entry.kind === 'video' ? 'video' : 'picture'} there.`))) {
            throw new JobError(`The result is on ${u.hostname}, which you did not allow.`);
          }
          const headers = {};
          let keyHeaders = [];
          if (sameOrigin && d.keyHeader) { headers[d.keyHeader.name] = d.keyHeader.template.replace('{key}', key(d)); keyHeaders = [d.keyHeader.name]; }
          if (replicateApi) { Object.assign(headers, bearer(key(d))); keyHeaders = ['Authorization']; }
          const res = await net.request(m.url, { headers, keyHeaders, timeout: 600000 });
          if (!res.ok) throw new JobError(`The download answered with status ${res.status}.`);
          buf = await net.bytes(res, entry.kind === 'video' ? 2 * 1024 * 1024 * 1024 : 200 * 1024 * 1024);
        }
        const t = sniff(buf);
        if (!t || t.kind !== entry.kind) throw new JobError(`The result is not a ${entry.kind === 'video' ? 'video' : 'picture'} OT Studio can show.`);
        const name = `${entry.kind === 'video' ? 'vid' : 'img'}-${entry.id.slice(0, 8)}-${i}.${t.ext}`;
        fs.writeFileSync(path.join(mediaDir, name), buf);
        files.push(name);
      }
      const more = entry.op && ['expand', 'longer'].includes(entry.op.type);
      // A job with a step on this PC is done only after that step, so nothing saves the unfinished result.
      if (more) Object.assign(entry, { files, error: undefined, finished: now() });
      else update(entry, { state: 'done', files, error: undefined, finished: now() });
    } catch (e) {
      update(entry, { state: 'failed', files, error: `The result is ready but could not be downloaded. ${e.message}`, canRetryDownload: !!(entry.remote && entry.remote.length), finished: now() });
      return;
    }
    await finish(entry);
  }

  async function retryDownload(id) {
    const entry = find(id);
    if (!entry || !entry.canRetryDownload) throw new JobError('There is nothing to download again.');
    const d = def(entry.service);
    update(entry, { state: 'downloading', canRetryDownload: false });
    await download(entry, d, entry.remote.map((url) => ({ url })));
  }

  async function poll(entry) {
    if (busy.has(entry.id)) return;
    busy.add(entry.id);
    try {
      const d = def(entry.service);
      const k = key(d);
      let r;
      if (d.special) {
        const res = await net.request(`${replicate.BASE}/predictions/${encodeURIComponent(entry.taskId)}`, { headers: bearer(k), keyHeaders: ['Authorization'] });
        const body = await readJson(res);
        r = res.ok ? replicate.readPrediction(body) : { state: 'unknown' };
      } else {
        const p = service.pollRequest(d, entry.taskId, k);
        const res = await net.request(p.url, { headers: p.headers, keyHeaders: d.keyHeader ? [d.keyHeader.name] : [] });
        r = service.readPoll(d, res.status, await readJson(res));
      }
      if (r.state === 'unknown') { update(entry, { nextPoll: now() + 30000, status: 'checking again soon' }); return; }
      await apply(entry, d, r);
    } catch (e) {
      // A failed check costs nothing: try again later, and show why in the meantime.
      update(entry, { nextPoll: now() + 30000, status: e.message });
    } finally {
      busy.delete(entry.id);
    }
  }

  function tick() {
    for (const e of history) if (e.state === 'running' && (e.nextPoll || 0) <= now()) poll(e);
  }

  async function cancel(id) {
    const entry = find(id);
    if (!entry || entry.state !== 'running') throw new JobError('This job is not running.');
    const d = def(entry.service);
    if (!d.special) throw new JobError(`${d.name} tasks cannot be stopped from OT Studio. The task finishes on its own.`);
    const res = await net.request(`${replicate.BASE}/predictions/${encodeURIComponent(entry.taskId)}/cancel`, { method: 'POST', headers: bearer(key(d)), keyHeaders: ['Authorization'] });
    const body = await readJson(res);
    if (!res.ok) throw new JobError(service.errorText({ result: {} }, body) || 'Replicate did not stop the job.');
    await apply(entry, d, replicate.readPrediction(body));
  }

  /** On start: a job that was being sent when OT Studio closed has an unknown outcome. */
  function resume() {
    let changed = false;
    for (const e of history) {
      if (e.state === 'sending') { e.state = 'uncertain'; e.error = 'OT Studio closed while sending this job. Check your account at the provider before you try again.'; changed = true; }
      if (e.state === 'downloading') { e.state = 'failed'; e.error = 'OT Studio closed during the download.'; e.canRetryDownload = !!(e.remote && e.remote.length); changed = true; }
      if (e.state === 'finishing') { e.state = 'done'; e.files = e.raw || e.files; e.error = 'OT Studio closed before this was finished, so this is the unfinished result.'; changed = true; }
      if (e.state === 'running') e.nextPoll = 0;
    }
    if (changed) save();
  }

  /** Every media file an entry refers to. */
  function namesOf(e) {
    return [...e.files, ...(e.raw || []), ...Object.values(e.pictures || {}).flat(), e.op && e.op.source, e.op && e.op.parentFile].filter(Boolean);
  }

  function inUse(name) {
    return history.some((e) => namesOf(e).includes(name));
  }

  /** Removes entries and every media file only they use. */
  function remove(ids) {
    const gone = history.filter((e) => ids.includes(e.id) && !BUSY_STATES.includes(e.state));
    history = history.filter((e) => !gone.includes(e));
    save();
    for (const e of gone) {
      for (const name of namesOf(e)) {
        if (!inUse(name)) { try { fs.rmSync(mediaPath(name), { force: true }); } catch { /* a locked file stays; it is harmless */ } }
      }
    }
    return gone.map((e) => e.id);
  }

  /** Sends a test request for a service that is being set up, and returns the answer so the user can map it. */
  async function test(draft, input) {
    const d = service.validate({ ...draft, result: { mode: 'sync', media: 'x' } });
    const host = new URL(d.request.url).hostname;
    if (!require('../core/hosts').allowed(d.request.url, approvedHosts()) && !(await approveHost(host, 'This test sends your prompt and the key you saved for this service there.'))) throw new JobError(`You did not allow ${host}.`);
    const pictures = {};
    for (const [field, names] of Object.entries(input.pictures || {})) pictures[field] = names.map(dataUri);
    const r = service.buildRequest(d, { ...input, pictures }, keys.has(d.keySlot) ? keys.get(d.keySlot) : '', null);
    let res;
    try {
      res = await net.request(r.url, { method: r.method, headers: r.headers, body: r.body, keyHeaders: d.keyHeader ? [d.keyHeader.name] : [], timeout: 300000 });
    } catch (e) {
      throw new JobError(e.message);
    }
    const answer = await readJson(res);
    const paths = stringPaths(answer).map((p) => ({ path: p.path, sample: p.sample, looks: /^https:\/\//.test(p.sample) ? 'link' : p.sample.length >= 80 && /^[A-Za-z0-9+/=]+$/.test(p.sample) ? 'picture data' : '' }));
    return { status: res.status, answer: shorten(answer), paths };
  }

  /** Records which chat message started a job, and where its copies were saved. */
  function mark(id, patch) {
    const e = find(id);
    if (!e) return;
    if (typeof patch.chat === 'string') e.chat = patch.chat;
    if (Array.isArray(patch.saved)) e.saved = patch.saved.map(String);
    save();
    notify(e);
  }

  /** Deletes pictures the user attached (in-...) that no job uses anymore. */
  function discard(names) {
    for (const n of names) {
      if (!/^in-[\w-]+\.\w+$/.test(n) || inUse(n)) continue;
      try { fs.rmSync(mediaPath(n), { force: true }); } catch { /* a locked file stays; it is harmless */ }
    }
  }

  function info(id, model) { try { const d = def(id); return d.special ? null : modelInfo(d, model); } catch { return null; } }

  return { list: () => history, info, uploadBuffer, mark, discard, generate, expand, upscale, size, lastFrame, cancel, remove, retryDownload, tick, resume, addPicture, mediaPath, models, form, test, REPLICATE };
}

/** A copy of [v] with long strings cut, so a test answer with picture data stays readable. */
function shorten(v) {
  if (typeof v === 'string') return v.length > 200 ? `${v.slice(0, 120)}... (${v.length} characters)` : v;
  if (Array.isArray(v)) return v.slice(0, 20).map(shorten);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 60).map(([k, x]) => [k, shorten(x)]));
  return v;
}

module.exports = { createJobs, JobError, REPLICATE, shorten };
