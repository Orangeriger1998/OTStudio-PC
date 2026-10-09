'use strict';
// Replicate: the model's own input list (its OpenAPI schema) decides which settings the form shows and what is sent.

const { ServiceError, MODEL_RE, TASK_ID_RE } = require('./service');

const BASE = 'https://api.replicate.com/v1';
const STATES = ['starting', 'processing', 'succeeded', 'failed', 'canceled'];

/** Plain names for common inputs, so the form reads like a form. The real name shows small below. */
const LABELS = {
  disable_safety_checker: 'Safety checker', aspect_ratio: 'Shape', num_outputs: 'Number of pictures', go_fast: 'Fast mode',
  seed: 'Seed', megapixels: 'Size in megapixels', output_format: 'File type', output_quality: 'File quality',
  num_inference_steps: 'Steps', guidance: 'Prompt strength', guidance_scale: 'Prompt strength', prompt_strength: 'How far from your picture',
  lora_scale: 'LoRA strength', lora_weights: 'LoRA', replicate_weights: 'LoRA', duration: 'Length in seconds', resolution: 'Resolution', negative_prompt: 'Avoid',
  image: 'Picture', input_image: 'Picture', image_input: 'Pictures', input_images: 'Pictures', images: 'Pictures',
  first_frame: 'Starting picture', last_frame: 'Ending picture', last_image: 'Ending picture', end_image: 'Ending picture',
  start_image: 'Starting picture', first_frame_image: 'Starting picture', frames_per_second: 'Frames per second', fps: 'Frames per second',
  num_frames: 'Length in frames (81 is 5 s)', safety_tolerance: 'Safety tolerance', size: 'Size', width: 'Width', height: 'Height',
  max_images: 'Number of pictures',
};
/** The settings the simple view shows. Everything else waits behind "Show all settings". */
const SIMPLE = new Set(['aspect_ratio', 'resolution', 'duration', 'num_outputs', 'disable_safety_checker', 'size', 'num_frames', 'megapixels']);
/** Editing models, which start with the safety checker off (as on the phone). */
const EDIT_MODELS = new Set(['black-forest-labs/flux-kontext-dev', 'qwen/qwen-image-edit-plus', 'qwen/qwen-image-edit', 'qwen/qwen-image-edit-2511',
  'black-forest-labs/flux-2-dev', 'black-forest-labs/flux-2-klein-9b', 'black-forest-labs/flux-2-klein-4b', 'bytedance/seedream-4.5', 'prunaai/p-image-edit']);

const MODELS = {
  image: [
    ['black-forest-labs/flux-schnell', 'FLUX schnell'], ['black-forest-labs/flux-dev', 'FLUX dev'], ['black-forest-labs/flux-1.1-pro', 'FLUX 1.1 pro'],
    ['black-forest-labs/flux-dev-lora', 'FLUX dev with a LoRA'], ['qwen/qwen-image-lora-trainer', 'Qwen Image with a LoRA'], ['black-forest-labs/flux-kontext-dev', 'FLUX Kontext dev (edit)'],
    ['qwen/qwen-image-edit-plus', 'Qwen Image Edit Plus (edit)'], ['bytedance/seedream-4.5', 'Seedream 4.5'], ['black-forest-labs/flux-2-dev', 'FLUX.2 dev'],
    ['black-forest-labs/flux-2-klein-9b', 'FLUX.2 klein 9B'], ['prunaai/p-image-edit', 'P-Image Edit (edit)'],
  ],
  video: [
    ['wan-video/wan-2.2-i2v-fast', 'Wan 2.2 from a picture'], ['wan-video/wan-2.7-i2v', 'Wan 2.7 from a picture'],
    ['wan-video/wan-2.7-t2v', 'Wan 2.7 from words'], ['wan-video/wan-2.2-t2v-fast', 'Wan 2.2 from words'],
  ],
};

function label(name, kind) {
  if (kind === 'video' && name === 'image') return 'Starting picture';
  return LABELS[name] || name.replace(/_/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());
}

function resolve(doc, node) {
  let n = node || {};
  for (let i = 0; i < 5 && n.$ref; i++) n = doc.components?.schemas?.[n.$ref.split('/').pop()] || {};
  if (Array.isArray(n.allOf) && n.allOf.length) n = { ...resolve(doc, n.allOf[0]), ...Object.fromEntries(Object.entries(n).filter(([k]) => k !== 'allOf')) };
  return n;
}

/**
 * The model's inputs as form controls, from its OpenAPI document.
 * Each is { name, label, type, choices?, min?, max?, default?, note, picture?, list?, required, simple }.
 */
function parseSchema(doc, kind, model) {
  const input = resolve(doc, doc?.components?.schemas?.Input);
  const props = input.properties;
  if (!props || typeof props !== 'object') throw new ServiceError('This model has no readable input list.');
  const required = new Set(input.required || []);
  const out = [];
  for (const [name, raw] of Object.entries(props)) {
    if (!/^[A-Za-z_][\w]{0,63}$/.test(name)) continue;
    const p = resolve(doc, raw);
    const c = { name, label: label(name, kind), required: required.has(name), note: String(p.description || '').slice(0, 300), order: Number(p['x-order'] ?? 999) };
    const items = p.type === 'array' ? resolve(doc, p.items) : null;
    // A weights address (a LoRA file) is text, not a picture to choose.
    if ((p.format === 'uri' || (items && items.format === 'uri')) && /weights|lora/i.test(name)) { c.type = 'text'; c.uri = true; }
    else if (p.format === 'uri' || (items && items.format === 'uri')) { c.type = 'picture'; c.picture = true; c.list = !!items; c.max = items ? (p.maxItems || 14) : 1; }
    else if (Array.isArray(p.enum)) { c.type = 'choice'; c.choices = p.enum; }
    else if (p.type === 'boolean') c.type = 'switch';
    else if (p.type === 'integer' || p.type === 'number') { c.type = 'number'; c.integer = p.type === 'integer'; c.min = p.minimum; c.max = p.maximum; }
    else if (p.type === 'string') c.type = 'text';
    else continue;
    if (p.default !== undefined) c.default = p.default;
    if (name === 'disable_safety_checker' && EDIT_MODELS.has(model)) c.default = true;
    c.simple = SIMPLE.has(name) || c.picture || (c.required && name !== 'prompt');
    out.push(c);
  }
  return out.sort((a, b) => a.order - b.order);
}

function coerce(c, raw) {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (c.type === 'switch') return raw === true || raw === 'true';
  if (c.type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n) || (c.integer && !Number.isInteger(n))) throw new ServiceError(`${c.label} must be a${c.integer ? ' whole' : ''} number.`);
    if (c.min !== undefined && n < c.min) throw new ServiceError(`${c.label} must be at least ${c.min}.`);
    if (c.max !== undefined && n > c.max) throw new ServiceError(`${c.label} must be at most ${c.max}.`);
    return n;
  }
  if (c.type === 'choice') {
    const m = c.choices.find((x) => String(x) === String(raw));
    if (m === undefined) throw new ServiceError(`${c.label} cannot be "${String(raw).slice(0, 40)}".`);
    return m;
  }
  return String(raw);
}

/**
 * The prediction input. [pictures] holds uploaded https links by input name. Only settings the model lists are sent, and an
 * empty setting is left out so the model's own default applies.
 */
function buildInput(controls, prompt, options, pictures) {
  const input = {};
  const names = new Set(controls.map((c) => c.name));
  if (names.has('prompt')) {
    const p = String(prompt || '').trim();
    if (!p && controls.find((c) => c.name === 'prompt').required) throw new ServiceError('Write a prompt first.');
    if (p) input.prompt = p;
  }
  for (const c of controls) {
    if (c.name === 'prompt') continue;
    if (c.picture) {
      const links = (pictures[c.name] || []).filter(Boolean);
      if (links.some((u) => !/^https:\/\//.test(u))) throw new ServiceError('A picture link is not usable.');
      if (links.length > c.max) throw new ServiceError(`${c.label} takes at most ${c.max}.`);
      if (links.length) input[c.name] = c.list ? links : links[0];
      else if (c.required) throw new ServiceError(`${c.label} is needed for this model.`);
      continue;
    }
    const v = coerce(c, options[c.name]);
    if (v !== undefined) input[c.name] = v;
    else if (c.required && c.default === undefined) throw new ServiceError(`${c.label} is needed for this model.`);
  }
  return input;
}

function createRequest(model, input) {
  if (!MODEL_RE.test(model) || !/^[\w.-]+\/[\w.-]+$/.test(model)) throw new ServiceError('The model must look like owner/name.');
  return { method: 'POST', url: `${BASE}/models/${model}/predictions`, body: JSON.stringify({ input }) };
}

function outputs(value) {
  const found = [];
  const visit = (v) => {
    if (typeof v === 'string') { if (/^https:\/\//.test(v)) found.push(v); }
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(value);
  return found.slice(0, 16);
}

/** A prediction as a job state: { state, taskId, media, error }. */
function readPrediction(json) {
  const id = String(json?.id || '');
  if (!TASK_ID_RE.test(id)) throw new ServiceError('Replicate returned an unusable job id.');
  const status = json.status === 'aborted' ? 'canceled' : json.status;
  if (!STATES.includes(status)) throw new ServiceError('Replicate returned an unknown job state.');
  if (status === 'succeeded') {
    const media = outputs(json.output).map((url) => ({ url }));
    return media.length ? { state: 'done', taskId: id, media } : { state: 'failed', taskId: id, error: 'The job finished without a result.' };
  }
  if (status === 'failed') return { state: 'failed', taskId: id, error: String(json.error || 'The job failed.').replace(/[\p{Cc}]+/gu, ' ').slice(0, 400) };
  if (status === 'canceled') return { state: 'canceled', taskId: id };
  return { state: 'running', taskId: id, status };
}

module.exports = { BASE, MODELS, LABELS, SIMPLE, EDIT_MODELS, parseSchema, buildInput, createRequest, readPrediction, label };
