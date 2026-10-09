'use strict';
// FLUX dev LoRAs: the library format shared with the Android app and the LoRA Trainer ("otstudio-lora-v1"), the rules
// for a usable reference, and reading training progress. A LoRA is data: a name, where its weights are, its trigger word,
// and its strength.

const FORMAT = 'otstudio-lora-v1';
const MODEL = 'black-forest-labs/flux-dev-lora';
const TRAINER = 'ostris/flux-dev-lora-trainer';
const TRAINER_VERSION = '26dce37af90b9d997eeb970d92e47de3064d46c300504ae376c75bef6a9022d2';
/** A LoRA trained into a Replicate model: owner/name/version. It runs on its own version (see jobs.js). */
const OWN = /^([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)\/([a-f0-9]{64})$/;
const TRIGGER = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const MAX_FILE_BYTES = 16384;

class LoraError extends Error {}

/** A clean copy of a library item, or a LoraError with a plain reason. */
function validate(item) {
  const name = String(item.name ?? '').trim();
  const reference = String(item.reference ?? '').trim();
  const trigger = String(item.trigger ?? item.trigger_word ?? '').trim();
  const scale = Number(item.scale ?? 1);
  const baseModel = String(item.baseModel ?? item.base_model ?? 'flux-dev');
  if (!name || name.length > 80 || /\p{Cc}/u.test(name)) throw new LoraError('Give the LoRA a name of up to 80 characters.');
  if (trigger.length > 120 || /\p{Cc}/u.test(trigger)) throw new LoraError('Keep the trigger word below 120 characters on one line.');
  if (baseModel !== 'flux-dev') throw new LoraError('This library takes FLUX dev LoRAs. Video LoRAs are not interchangeable.');
  if (!Number.isFinite(scale) || scale < -1 || scale > 3) throw new LoraError('The LoRA strength must be between -1 and 3.');
  if (reference.length > 4000) throw new LoraError('The LoRA reference is too long.');
  if (reference.startsWith('https://')) {
    let u;
    try { u = new URL(reference); } catch { throw new LoraError('That LoRA address is not valid.'); }
    if (!u.hostname || u.username || u.password || u.hash || (u.port && u.port !== '443')) throw new LoraError('Use an HTTPS LoRA address without a user name, password, or port.');
  } else if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+(\/[a-f0-9]{64})?$/.test(reference) || reference.includes('..')) {
    throw new LoraError('Use owner/model, owner/model/version, or an HTTPS address of the weights.');
  }
  return { name, reference, trigger, scale, baseModel };
}

/** Reads a library file from the Android app or the LoRA Trainer. */
function parse(text) {
  if (Buffer.byteLength(String(text), 'utf8') > MAX_FILE_BYTES) throw new LoraError('That LoRA file is too large.');
  let root;
  try { root = JSON.parse(text); } catch { throw new LoraError('That file is not an OT Studio LoRA file.'); }
  const expected = ['format', 'name', 'reference', 'trigger_word', 'scale', 'base_model'];
  if (!root || typeof root !== 'object' || root.format !== FORMAT || Object.keys(root).sort().join() !== [...expected].sort().join()) throw new LoraError('Choose an OT Studio LoRA file (it ends in .otstudio-lora.json).');
  if (['name', 'reference', 'trigger_word', 'base_model'].some((k) => typeof root[k] !== 'string') || typeof root.scale !== 'number') throw new LoraError('That LoRA file has fields of the wrong type.');
  return validate(root);
}

function toFile(item) {
  const v = validate(item);
  return JSON.stringify({ format: FORMAT, name: v.name, reference: v.reference, trigger_word: v.trigger, scale: v.scale, base_model: v.baseModel }, null, 2);
}

/** A rare, prompt-friendly trigger from the LoRA name, such as MARKFACE for "Mark face". */
function suggestTrigger(name) {
  let letters = String(name || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
  if (!letters || !/^[A-Z]/.test(letters)) letters = `OT${letters}`;
  return letters.length >= 4 ? letters : `${letters}LORA`;
}

/** The private Replicate model name for a LoRA: lowercase letters, digits, and dashes, starting with lora-. */
function destinationSlug(name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
  if (!slug) throw new LoraError('Use a LoRA name with at least one letter or digit.');
  return `lora-${slug}`;
}

/** The prompt with the trigger word in front, unless it is already there as a whole word. */
function withTrigger(prompt, trigger) {
  const p = String(prompt || '');
  if (!trigger || trigger.length < 2) return p;
  const re = new RegExp(`(^|[^A-Za-z0-9_])${trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9_])`, 'i');
  return re.test(p) ? p : `${trigger} ${p}`.trim();
}

/**
 * How far training is, from 0 to 1, from the newest "done/total" step count in the provider's log, or null before the
 * first step. Only numbers are read, and only counts out of the job's own step total.
 */
function progress(logs, steps) {
  if (typeof logs !== 'string' || !logs) return null;
  let found = null;
  for (const m of logs.slice(-50000).matchAll(/(\d{1,6})\s*\/\s*(\d{1,6})/g)) {
    const done = Number(m[1]);
    const total = Number(m[2]);
    if (total === steps && done >= 0 && done <= total) found = done / total;
  }
  return found;
}

/**
 * The trainer's current stage from the tail of its log: 'captioning', 'loading', 'training', or 'saving'; null when
 * the log says nothing yet. Only known words are looked for; the log text itself is never shown.
 */
function phase(logs, progressNow) {
  if (typeof logs !== 'string' || !logs) return null;
  const tail = logs.slice(-4000).toLowerCase();
  const last = (re) => { let i = -1; for (const m of tail.matchAll(re)) i = m.index; return i; };
  const at = {
    saving: last(/saving|uploading|upload|pushing|writing weights|safetensors/g),
    training: last(/\d+\s*\/\s*\d+\s*\[|it\/s|s\/it/g),
    loading: last(/download|loading|load checkpoint|pget|quantiz/g),
    captioning: last(/caption|llava|florence|blip/g),
  };
  if (progressNow !== null && progressNow !== undefined && progressNow >= 0.99 && at.saving >= 0) return 'saving';
  const best = Object.entries(at).filter(([, i]) => i >= 0).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

/** Minutes left, from how fast the steps went since the first one was seen; null until there is enough to tell. */
function minutesLeft(firstAt, firstProgress, nowAt, progressNow) {
  if (!firstAt || progressNow === null || progressNow === undefined) return null;
  const done = progressNow - firstProgress;
  const elapsed = nowAt - firstAt;
  if (done < 0.02 || elapsed < 60000) return null;
  return Math.max(1, Math.round(((elapsed / done) * (1 - progressNow)) / 60000));
}

module.exports = { phase, minutesLeft, FORMAT, MODEL, TRAINER, TRAINER_VERSION, OWN, TRIGGER, validate, parse, toFile, suggestTrigger, destinationSlug, withTrigger, progress, LoraError };
