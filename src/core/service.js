'use strict';
// A service definition describes one provider endpoint as data: where to send the request, how the key travels, which
// settings and pictures it takes, and where the result is in the answer. Built-in services and services a user adds
// from a pasted example both use this shape. Nothing in a definition is ever run as code.

const { get } = require('./jsonpath');
const { fill, fillText, names } = require('./template');

const KINDS = ['image', 'video'];
const OPTION_TYPES = ['choice', 'number', 'text', 'switch'];
const NAME_RE = /^[A-Za-z_][\w]{0,63}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const MODEL_RE = /^[\w.:/-]{1,200}$/;
const TASK_ID_RE = /^[\w.:-]{1,200}$/;
const BLOCKED_HEADERS = /^(host|cookie|content-length|connection|transfer-encoding|origin|referer)$/i;
const RESERVED = new Set(['prompt', 'model', 'key', 'id']);

class ServiceError extends Error {}

function origin(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new ServiceError('Service addresses must start with https://.');
  if (u.username || u.password) throw new ServiceError('Service addresses cannot carry a user name or password.');
  return u.origin;
}

const list = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

/** Checks a definition and returns a clean copy. Throws ServiceError with a plain reason. */
function validate(input) {
  const d = JSON.parse(JSON.stringify(input || {}));
  const fail = (m) => { throw new ServiceError(m); };
  if (!ID_RE.test(d.id || '')) fail('The service needs a short id of lowercase letters, numbers, and dashes.');
  if (typeof d.name !== 'string' || !d.name.trim() || d.name.length > 60) fail('The service needs a name of up to 60 characters.');
  if (!KINDS.includes(d.kind)) fail('The service must make pictures or videos.');
  if (!ID_RE.test(d.keySlot || '')) fail('The service needs a key name.');
  if (!d.request || typeof d.request !== 'object') fail('The service has no request.');
  d.request.method = String(d.request.method || 'POST').toUpperCase();
  if (!['POST', 'PUT', 'GET'].includes(d.request.method)) fail('The request method must be POST, PUT, or GET.');
  const home = origin(d.request.url);
  d.request.headers = d.request.headers || {};
  for (const [k, v] of Object.entries(d.request.headers)) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(k) || BLOCKED_HEADERS.test(k)) fail(`The header "${k}" is not allowed.`);
    if (typeof v !== 'string' || /[\r\n]/.test(v) || v.length > 500) fail(`The header "${k}" has an unusable value.`);
    if (v.includes('{key}')) fail('The key may only travel in the key header.');
  }
  if (d.keyHeader) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(d.keyHeader.name || '') || BLOCKED_HEADERS.test(d.keyHeader.name)) fail('The key header name is not allowed.');
    if (typeof d.keyHeader.template !== 'string' || !d.keyHeader.template.includes('{key}') || /[\r\n]/.test(d.keyHeader.template)) fail('The key header must contain {key}.');
  }
  if (JSON.stringify(d.request.body || {}).includes('{key}')) fail('The key may only travel in the key header, never in the body.');
  if (d.request.url.includes('{key}')) fail('The key may only travel in the key header, never in the address.');

  d.options = list(d.options);
  d.pictures = list(d.pictures);
  const declared = new Set(['prompt', 'model']);
  for (const o of d.options) {
    if (!NAME_RE.test(o.name || '') || RESERVED.has(o.name)) fail(`The setting name "${o.name}" is not allowed.`);
    if (!OPTION_TYPES.includes(o.type)) fail(`The setting "${o.name}" needs a type: choice, number, text, or switch.`);
    if (o.type === 'choice' && !o.fromModel && !list(o.choices).length) fail(`The setting "${o.name}" needs its choices.`);
    if (declared.has(o.name)) fail(`The name "${o.name}" is used twice.`);
    if (o.sendAs !== undefined && !NAME_RE.test(o.sendAs)) fail(`The setting "${o.name}" fills an unusable field.`);
    declared.add(o.name);
  }
  for (const p of d.pictures) {
    if (!NAME_RE.test(p.name || '') || RESERVED.has(p.name)) fail(`The picture name "${p.name}" is not allowed.`);
    if (declared.has(p.name)) fail(`The name "${p.name}" is used twice.`);
    p.max = Math.max(1, Math.min(16, Number(p.max) || 1));
    declared.add(p.name);
  }
  const used = names(d.request.body || {});
  if (!used.has('prompt') && !d.request.url.includes('{prompt}')) fail('The request body must use {prompt} somewhere.');

  const r = d.result || fail('The service needs to know where the result is.');
  if (!['sync', 'task'].includes(r.mode)) fail('The result must arrive at once (sync) or as a task to check (task).');
  if (typeof r.media !== 'string' || !r.media) fail('The service needs the path to the picture or video in the answer.');
  if (r.mode === 'task') {
    if (typeof r.taskId !== 'string' || !r.taskId) fail('The service needs the path to the task id.');
    if (!r.poll || origin(r.poll.url) !== home) fail('Task checks must go to the same address as the request.');
    if (!r.poll.url.includes('{id}')) fail('The task check address must contain {id}.');
    if (typeof r.status !== 'string' || !r.status) fail('The service needs the path to the task status.');
    r.done = list(r.done).map(String);
    r.failed = list(r.failed).map(String);
    if (!r.done.length) fail('The service needs the status value that means finished.');
    r.interval = Math.max(5, Math.min(120, Number(r.interval) || 15));
  }
  if (d.models && d.models.url && origin(d.models.url) !== home) fail('The model list must come from the same address as the request.');
  d.mediaHosts = list(d.mediaHosts).filter((h) => typeof h === 'string' && /^\.?[a-z0-9.-]+$/i.test(h));
  return d;
}

/** The settings that apply to [modelInfo]: per-model choices, ranges, or hidden. */
function controls(def, modelId, modelInfo) {
  const out = [];
  for (const o of def.options) {
    if (o.onlyModels && !o.onlyModels.includes(modelId)) continue;
    const c = { ...o };
    if (o.fromModel && modelInfo) {
      const v = get(modelInfo, o.fromModel);
      if (v === undefined || v === null || v === false) continue;
      if (Array.isArray(v)) { if (!v.length) continue; c.type = 'choice'; c.choices = v; }
      else if (v && typeof v === 'object' && v.type === 'enum') { c.type = 'choice'; c.choices = list(v.values); }
      else if (v && typeof v === 'object' && (v.type === 'range' || ('min' in v && 'max' in v))) { c.type = 'number'; c.min = v.min; c.max = v.max; if (v.min === v.max) continue; }
      else if (v === true || (v && v.type === 'boolean')) { /* the option as defined */ }
      if (c.type === 'choice' && c.default !== undefined && !c.choices.some((x) => String(x) === String(c.default))) c.default = undefined;
    } else if (o.fromModel && !modelInfo && o.needsModelInfo) continue;
    out.push(c);
  }
  return out;
}

/** The picture inputs that apply to [modelInfo], each with its maximum count. */
function pictureInputs(def, modelInfo) {
  const out = [];
  for (const p of def.pictures) {
    const c = { ...p };
    if (p.whenModel && modelInfo) {
      const v = get(modelInfo, p.whenModel.path);
      if (!list(v).map(String).includes(String(p.whenModel.has))) continue;
    }
    if (p.maxFromModel && modelInfo) {
      const m = Number(get(modelInfo, p.maxFromModel));
      if (Number.isFinite(m)) { if (m < 1) continue; c.max = Math.min(c.max, m); }
    }
    out.push(c);
  }
  return out;
}

function coerce(o, raw) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (o.type === 'switch') return raw === true || raw === 'true';
  if (o.type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new ServiceError(`${o.label || o.name} must be a number.`);
    if (o.min !== undefined && n < o.min) throw new ServiceError(`${o.label || o.name} must be at least ${o.min}.`);
    if (o.max !== undefined && n > o.max) throw new ServiceError(`${o.label || o.name} must be at most ${o.max}.`);
    return n;
  }
  if (o.type === 'choice') {
    const s = String(raw);
    const match = list(o.choices).find((c) => String(c) === s);
    if (match === undefined) throw new ServiceError(`${o.label || o.name} cannot be "${s}".`);
    return match;
  }
  return String(raw);
}

/**
 * The request for one job. [input] holds prompt, model, options (by name), and pictures (by name: a list of
 * data: or https: addresses). [key] goes only into the key header.
 */
function buildRequest(def, input, key, modelInfo) {
  const prompt = String(input.prompt || '').trim();
  if (!prompt) throw new ServiceError('Write a prompt first.');
  if (def.promptMax && prompt.length > def.promptMax) throw new ServiceError(`This service takes prompts of up to ${def.promptMax} characters.`);
  const usesModel = names(def.request.body || {}).has('model') || def.request.url.includes('{model}');
  const model = String(input.model || (usesModel ? '' : 'default'));
  if (!MODEL_RE.test(model)) throw new ServiceError('Choose a model.');
  const vars = { prompt, model };
  const opts = input.options || {};
  for (const o of def.options) vars[o.name] = undefined;
  for (const o of controls(def, model, modelInfo)) vars[o.name] = coerce(o, opts[o.name] !== undefined ? opts[o.name] : o.default);
  // A model-specific variant of a setting (its own choices) can fill the shared field.
  for (const o of def.options) if (o.sendAs && vars[o.name] !== undefined) vars[o.sendAs] = vars[o.name];
  for (const p of def.pictures) vars[p.name] = undefined;
  for (const p of pictureInputs(def, modelInfo)) {
    const pics = list((input.pictures || {})[p.name]);
    if (pics.length > p.max) throw new ServiceError(`${p.label || p.name} takes at most ${p.max}.`);
    if (pics.some((u) => typeof u !== 'string' || !/^(data:image\/[\w.+-]+;base64,|https:\/\/)/.test(u))) throw new ServiceError('A picture could not be read.');
    if (p.required && !pics.length) throw new ServiceError(`${p.label || p.name} is needed for this model.`);
    vars[p.name] = p.max > 1 ? pics : pics[0];
  }
  const url = fillText(def.request.url, vars, (s) => s.split('/').map(encodeURIComponent).join('/'));
  if (origin(url) !== origin(def.request.url.replace(/\{[^}]*\}/g, 'x'))) throw new ServiceError('The request address changed its host.');
  const headers = {};
  for (const [k, v] of Object.entries(def.request.headers)) headers[k] = fillText(v, vars);
  if (def.keyHeader) {
    if (!key) throw new ServiceError(`Add your ${def.keyLabel || def.name} key in Settings first.`);
    headers[def.keyHeader.name] = def.keyHeader.template.replace('{key}', key);
  }
  let body;
  if (def.request.method !== 'GET' && def.request.body !== undefined) {
    body = JSON.stringify(fill(def.request.body, vars));
    if (!Object.keys(headers).some((h) => /^content-type$/i.test(h))) headers['Content-Type'] = 'application/json';
  }
  return { method: def.request.method, url, headers, body, sent: { prompt, model, options: Object.fromEntries(def.options.map((o) => [o.name, vars[o.name]]).filter(([, v]) => v !== undefined)) } };
}

function clean(text) {
  return String(text).replace(/[\p{Cc}]+/gu, ' ').trim().slice(0, 400);
}

/** The provider's own reason from an answer, if the definition knows where it is. */
function errorText(def, json) {
  for (const p of list(def.result.error || ['error.message', 'error', 'message', 'detail'])) {
    const v = get(json, p);
    if (typeof v === 'string' && v.trim()) return clean(v);
    if (v && typeof v === 'object' && typeof v.message === 'string') return clean(v.message);
  }
  return '';
}

/** Media items from an answer: { url } for links, { data, type } for inline base64. */
function media(def, json) {
  const r = def.result;
  const found = list(get(json, r.media)).filter((v) => typeof v === 'string' && v.length);
  const type = (typeof get(json, r.mediaType || '') === 'string' && r.mediaType ? get(json, r.mediaType) : null) || r.type || (def.kind === 'video' ? 'video/mp4' : 'image/png');
  return found.slice(0, 16).map((v) => {
    if (/^https:\/\//i.test(v)) return { url: v };
    const m = /^data:([\w/.+-]+);base64,(.*)$/s.exec(v);
    if (m) return { data: m[2], type: m[1] };
    if (/^[A-Za-z0-9+/=\s]+$/.test(v.slice(0, 200))) return { data: v, type: String(type) };
    throw new ServiceError('The answer has a result that is neither a link nor a picture.');
  });
}

function cost(def, json) {
  const v = def.result.cost ? Number(get(json, def.result.cost)) : NaN;
  return Number.isFinite(v) ? v : undefined;
}

/**
 * Reads the answer to the first request. A sync service returns its media; a task service returns the task id.
 * Returns { state: 'done' | 'running' | 'failed', media, taskId, error, cost }.
 */
function readStart(def, status, json) {
  if (status < 200 || status >= 300) return { state: 'failed', error: errorText(def, json) || `The service answered with status ${status}.` };
  if (def.result.mode === 'sync') {
    const items = media(def, json);
    if (!items.length) return { state: 'failed', error: errorText(def, json) || 'The service returned no result.' };
    return { state: 'done', media: items, cost: cost(def, json) };
  }
  const id = get(json, def.result.taskId);
  if (typeof id !== 'string' && typeof id !== 'number') return { state: 'failed', error: errorText(def, json) || 'The service did not return a task id.' };
  if (!TASK_ID_RE.test(String(id))) throw new ServiceError('The service returned an unusable task id.');
  const now = readPoll(def, status, json);
  return { ...now, taskId: String(id), state: now.state === 'unknown' ? 'running' : now.state };
}

/** Reads one task check. */
function readPoll(def, status, json) {
  const r = def.result;
  if (status < 200 || status >= 300) return { state: 'unknown', error: errorText(def, json) || `The task check answered with status ${status}.` };
  const s = String(get(json, r.status) ?? '');
  if (r.done.includes(s)) {
    const items = media(def, json);
    return items.length ? { state: 'done', media: items, cost: cost(def, json) } : { state: 'failed', error: 'The finished task has no result.' };
  }
  if (r.failed.includes(s)) return { state: 'failed', error: errorText(def, json) || `The task ended as "${clean(s)}".` };
  return { state: 'running', status: clean(s) };
}

function pollRequest(def, taskId, key) {
  if (!TASK_ID_RE.test(taskId)) throw new ServiceError('The task id is unusable.');
  const headers = {};
  if (def.keyHeader) headers[def.keyHeader.name] = def.keyHeader.template.replace('{key}', key);
  return { method: 'GET', url: def.result.poll.url.replace('{id}', encodeURIComponent(taskId)), headers };
}

const title = (k) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * Rebuilds a draft's body template, settings, and picture inputs from its example body and the role chosen for each
 * field: prompt, model, setting, picture, or fixed (sent as in the example). Labels the user edited are kept.
 */
function applyRoles(draft) {
  const d = JSON.parse(JSON.stringify(draft));
  const example = d.notes?.example || {};
  const roles = d.notes?.roles || {};
  const oldOptions = new Map((d.options || []).map((o) => [o.name, o]));
  const oldPictures = new Map((d.pictures || []).map((p) => [p.name, p]));
  const template = {};
  d.options = [];
  d.pictures = [];
  for (const [k, v] of Object.entries(example)) {
    let role = roles[k] || 'fixed';
    const scalar = v === null || typeof v !== 'object';
    const nameOk = NAME_RE.test(k) && !RESERVED.has(k);
    if ((role === 'setting' && (!scalar || !nameOk)) || (role === 'picture' && (!nameOk || (v !== null && typeof v === 'object' && !Array.isArray(v))))) role = 'fixed';
    if (role === 'prompt') template[k] = '{prompt}';
    else if (role === 'model') template[k] = '{model}';
    else if (role === 'setting') {
      template[k] = `{${k}}`;
      const type = typeof v === 'boolean' ? 'switch' : typeof v === 'number' ? 'number' : 'text';
      const old = oldOptions.get(k);
      d.options.push(old && old.type === type ? old : { name: k, label: title(k), type, default: v ?? undefined, simple: true });
    } else if (role === 'picture') {
      template[k] = `{${k}}`;
      const old = oldPictures.get(k);
      d.pictures.push(old || { name: k, label: title(k), max: Array.isArray(v) ? 4 : 1 });
    } else template[k] = v;
    roles[k] = role;
  }
  d.request.body = template;
  d.notes.roles = roles;
  const modelField = Object.keys(roles).find((k) => roles[k] === 'model');
  if (modelField && !(d.models?.fixed || []).length && typeof example[modelField] === 'string') d.models = { ...(d.models || {}), fixed: [{ id: example[modelField], name: example[modelField] }] };
  return d;
}

/** Makes a draft definition from a parsed example. The user reviews and finishes it. */
function draftFromSnippet(parsed, kind) {
  const body = parsed.body && typeof parsed.body === 'object' && !Array.isArray(parsed.body) ? parsed.body : {};
  const host = new URL(parsed.url).hostname.replace(/^api\./, '');
  const id = host.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '').slice(0, 40) || 'service';
  const roles = {};
  const promptField = Object.keys(body).find((k) => /prompt|text|description/i.test(k) && typeof body[k] === 'string' && !/negative/i.test(k));
  const modelField = Object.keys(body).find((k) => /^model(_id|_name)?$/i.test(k) && typeof body[k] === 'string');
  for (const [k, v] of Object.entries(body)) {
    if (k === promptField) roles[k] = 'prompt';
    else if (k === modelField) roles[k] = 'model';
    else if (/^(image|images|image_url|image_urls|input_image|input_images|reference_images?|init_image)$/i.test(k) && (typeof v === 'string' || Array.isArray(v))) roles[k] = 'picture';
    else roles[k] = v === null || typeof v !== 'object' ? 'setting' : 'fixed';
  }
  return applyRoles({
    id: `${id}-${kind}`.slice(0, 63), name: host.slice(0, 60), kind, keySlot: id,
    keyHeader: parsed.keyHeader || null,
    request: { method: parsed.method, url: parsed.url, headers: parsed.headers, body: {} },
    models: { fixed: [] },
    options: [], pictures: [],
    result: { mode: 'sync', media: '', error: ['error.message', 'error', 'message'] },
    notes: { example: body, roles, warnings: parsed.warnings || [] },
  });
}

module.exports = { validate, controls, pictureInputs, buildRequest, readStart, readPoll, pollRequest, draftFromSnippet, applyRoles, errorText, origin, ServiceError, MODEL_RE, TASK_ID_RE };
