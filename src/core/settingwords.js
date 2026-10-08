'use strict';
// Settings named in a chat message, read from the user's own words (not from the chat model) and matched against the
// chosen model's real settings. Two ways in: common phrases ("2 pictures", "1080p", "with sound", "safety off",
// "seed 42", "30 steps", "as PNG", "anime style", "negative prompt: blurry"), and any setting by its own name
// ("prompt strength 0.7", "LoRA strength to 0.8", "steps = 40"). Every value is checked against what the model allows.

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30 };
const num = (s) => (s in NUMBER_WORDS ? NUMBER_WORDS[s] : Number(s));
const NUM = '(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty)';

/** Common ideas, the setting names that carry them, and how to read them from a message. */
const CONCEPTS = [
  { key: 'count', label: 'Number of pictures', names: ['num_outputs', 'n', 'max_images', 'number_of_images', 'num_images', 'batch_size'],
    read: (t) => { const m = new RegExp(`\\b${NUM}\\s+(?:different\\s+)?(?:pictures|images|photos|versions|variations|options|outputs|takes)\\b`, 'i').exec(t); return m ? num(m[1].toLowerCase()) : undefined; } },
  { key: 'seconds', label: 'Length', names: ['duration', 'seconds', 'video_length'],
    read: (t) => { const m = new RegExp(`\\b${NUM}[\\s-]*(?:sec|secs|seconds?)\\b`, 'i').exec(t); return m ? num(m[1].toLowerCase()) : undefined; } },
  { key: 'resolution', label: 'Resolution', names: ['resolution', 'size', 'quality_preset'],
    read: (t) => { const m = /\b(480p|540p|720p|768p|1080p|1440p|2160p|1k|2k|4k)\b/i.exec(t); return m ? m[1] : undefined; }, choiceOnly: true },
  { key: 'seed', label: 'Seed', names: ['seed'], read: (t) => { const m = /\bseed\s*(?:of|=|:|to|number)?\s*(\d{1,10})\b/i.exec(t); return m ? Number(m[1]) : undefined; } },
  { key: 'steps', label: 'Steps', names: ['num_inference_steps', 'steps', 'sample_steps'], read: (t) => { const m = /\b(\d{1,3})\s+(?:inference\s+)?steps\b/i.exec(t) || /\bsteps\s*(?:of|=|:|to)?\s*(\d{1,3})\b/i.exec(t); return m ? Number(m[1]) : undefined; } },
  { key: 'guidance', label: 'Guidance', names: ['guidance', 'guidance_scale', 'sample_guide_scale', 'cfg', 'cfg_scale'], read: (t) => { const m = /\b(?:guidance(?:\s+scale)?|cfg(?:\s+scale)?)\s*(?:of|=|:|to|at)?\s*(\d+(?:\.\d+)?)\b/i.exec(t); return m ? Number(m[1]) : undefined; } },
  { key: 'fps', label: 'Frames per second', names: ['frames_per_second', 'fps'], read: (t) => { const m = /\b(\d{1,2})\s*fps\b/i.exec(t) || /\b(\d{1,2})\s+frames\s+per\s+second\b/i.exec(t); return m ? Number(m[1]) : undefined; } },
  { key: 'format', label: 'File type', names: ['output_format', 'format'], read: (t) => { const m = /\b(?:as|in|to)\s+(?:a\s+)?(png|jpe?g|webp)\b/i.exec(t) || /\b(png|jpe?g|webp)\s+(?:format|file)\b/i.exec(t); return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : undefined; }, choiceOnly: true },
  { key: 'sound', label: 'Sound', names: ['generate_audio', 'audio', 'enable_audio', 'with_audio', 'sound'],
    read: (t) => (/\b(no|without|mute|muted|silent)\s*(sound|audio)?\b/i.test(t) && /\b(sound|audio|silent|mute)/i.test(t) ? false : /\b(with|add|include|and)\s+(sound|audio|music)\b/i.test(t) ? true : undefined) },
  { key: 'safety', label: 'Safety checker', names: ['disable_safety_checker', 'enable_safety_checker', 'safety_checker', 'safety_tolerance'],
    read: (t) => (/\b(safety|nsfw)\s*(checker|filter)?\s*(off|disabled|false)\b|\b(without|no|disable|turn off)\s+(the\s+)?(safety|nsfw)\s*(checker|filter)?\b/i.test(t) ? 'off' : /\b(safety|nsfw)\s*(checker|filter)?\s*(on|enabled)\b/i.test(t) ? 'on' : undefined) },
  { key: 'fast', label: 'Fast mode', names: ['go_fast', 'turbo', 'fast_mode'], read: (t) => (/\bfast\s*mode\s*(off|disabled)\b|\b(no|without)\s+fast\s*mode\b/i.test(t) ? false : /\bfast\s*mode\s*(on|enabled)?\b|\bturbo\b/i.test(t) ? true : undefined) },
  { key: 'megapixels', label: 'Megapixels', names: ['megapixels', 'output_megapixels'], read: (t) => { const m = /\b(\d+(?:\.\d+)?)\s*(?:mp|megapixels?)\b/i.exec(t); return m ? m[1] : undefined; }, choiceOnly: true },
  { key: 'quality', label: 'File quality', names: ['output_quality', 'output_compression'], read: (t) => { const m = /\b(?:file\s+|jpe?g\s+|output\s+)?quality\s*(?:of|=|:|to|at)?\s*(\d{1,3})\s*%?/i.exec(t); return m ? Number(m[1]) : undefined; } },
  { key: 'negative', label: 'Avoid', names: ['negative_prompt'], read: (t) => { const m = /\b(?:negative\s+prompt|avoid)\s*:\s*([^.;\n]{2,300})/i.exec(t); return m ? m[1].trim() : undefined; } },
  { key: 'lora', label: 'LoRA strength', names: ['lora_scale'], read: (t) => { const m = /\blora\s+(?:strength|scale|weight)\s*(?:of|=|:|to|at)?\s*(-?\d+(?:\.\d+)?)\b/i.exec(t); return m ? Number(m[1]) : undefined; } },
];

function display(value) { return typeof value === 'boolean' ? (value ? 'on' : 'off') : String(value); }

/** [value] made valid for control [c], or { problem } when it cannot be. */
function fit(c, value) {
  if (c.type === 'switch') {
    if (typeof value === 'boolean') return { value };
    const v = String(value).toLowerCase();
    if (['on', 'true', 'yes', 'enabled'].includes(v)) return { value: true };
    if (['off', 'false', 'no', 'disabled'].includes(v)) return { value: false };
    return { problem: `${c.label || c.name} must be on or off` };
  }
  if (c.type === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return { problem: `${c.label || c.name} must be a number` };
    if (c.integer && !Number.isInteger(n)) return { problem: `${c.label || c.name} must be a whole number` };
    if ((c.min !== undefined && n < c.min) || (c.max !== undefined && n > c.max)) return { problem: `${c.label || c.name} ${n} is outside ${c.min ?? ''} to ${c.max ?? ''}` };
    return { value: n };
  }
  if (c.type === 'choice') {
    const found = (c.choices || []).find((x) => String(x).toLowerCase() === String(value).toLowerCase());
    if (found === undefined) return { problem: `${c.label || c.name} cannot be ${value} (it takes ${(c.choices || []).slice(0, 8).join(', ')})` };
    return { value: found };
  }
  return { value: String(value) };
}

function escape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * The settings a message names, for one model. [controls] are the model's settings (name, label, type, choices,
 * min, max). Returns { set: { name: value }, shown: ['Steps 30', ...], missing: ['Sound'], problems: ['...'] }.
 */
function extract(text, controls) {
  const t = String(text || '');
  const set = {};
  const shown = [];
  const missing = [];
  const problems = [];
  const usable = (controls || []).filter((c) => c && c.name !== 'prompt' && !c.picture && c.name !== 'aspect_ratio');
  const byName = new Map(usable.map((c) => [c.name, c]));
  const put = (c, raw, label) => {
    if (c.name in set) return;
    const f = fit(c, raw);
    if (f.problem) { problems.push(f.problem); return; }
    set[c.name] = f.value;
    shown.push(typeof label === 'function' ? label(f.value) : `${label || c.label || c.name} ${display(f.value)}`);
  };

  // 1. Any setting by its own name or label: "prompt strength 0.7", "steps to 40", "style: anime".
  for (const c of usable) {
    if (c.name === 'disable_safety_checker') continue;
    const terms = [...new Set([c.label, c.name.replace(/_/g, ' '), c.name].filter((x) => x && x.length >= 4).map((x) => x.toLowerCase().replace(/\s*\(.*\)$/, '')))];
    for (const term of terms) {
      const m = new RegExp(`\\b${escape(term)}\\b\\s*(?:to|=|:|of|at|is)?\\s*("[^"]{1,300}"|-?\\d+(?:\\.\\d+)?%?|on|off|true|false|[A-Za-z0-9:*._-]{1,30})`, 'i').exec(t);
      if (!m) continue;
      let raw = m[1].replace(/^"|"$/g, '').replace(/%$/, '');
      if (c.type === 'text' && !/^"/.test(m[1])) continue;
      if (c.type === 'choice' && !(c.choices || []).some((x) => String(x).toLowerCase() === raw.toLowerCase())) continue;
      if (c.type === 'number' && !/^-?\d/.test(raw)) continue;
      put(c, raw);
      break;
    }
  }

  // 2. Common phrases, matched to whichever setting the model uses for that idea.
  for (const k of CONCEPTS) {
    const value = k.read(t);
    if (value === undefined) continue;
    const c = k.names.map((n) => byName.get(n)).find(Boolean);
    if (k.key === 'seconds' && !c && byName.get('num_frames')) {
      // Wan 2.2 counts frames: 81 frames is 5 seconds at 16 frames per second.
      const fps = Number((byName.get('frames_per_second') || {}).default) || 16;
      put(byName.get('num_frames'), Math.round(value * fps) + 1, (v) => `Length ${value} seconds (${v} frames)`);
      continue;
    }
    if (!c) { missing.push(k.label); continue; }
    if (c.name in set) continue;
    if (k.key === 'seconds') { put(c, value, (v) => `Length ${v} seconds`); continue; }
    if (k.key === 'safety') {
      // disable_safety_checker is reversed: "safety off" means disable = true.
      if (c.name === 'disable_safety_checker') put(c, value === 'off', (v) => `Safety checker ${v ? 'off' : 'on'}`);
      else if (c.name === 'safety_tolerance') put(c, value === 'off' ? c.max ?? 6 : c.min ?? 1, 'Safety tolerance');
      else put(c, value === 'on', (v) => `Safety checker ${v ? 'on' : 'off'}`);
      continue;
    }
    if (k.choiceOnly && c.type === 'choice' && !(c.choices || []).some((x) => String(x).toLowerCase() === String(value).toLowerCase())) { problems.push(`${c.label || k.label} cannot be ${value} on this model (it takes ${(c.choices || []).slice(0, 8).join(', ')})`); continue; }
    put(c, value, k.label);
  }

  // 3. A style the model lists by name: "anime style", "in cartoon style".
  const style = byName.get('style');
  if (style && style.type === 'choice' && !('style' in set)) {
    const found = (style.choices || []).find((x) => new RegExp(`\\b${escape(String(x))}\\s+style\\b|\\bstyle\\s*(?::|=|of)?\\s*${escape(String(x))}\\b`, 'i').test(t));
    if (found !== undefined) put(style, found, 'Style');
  }
  return { set, shown, missing, problems };
}

/** The message without explicit setting phrases that would confuse the picture model ("seed 42", "negative prompt: x"). */
function stripSettingWords(prompt) {
  return String(prompt || '')
    .replace(/\b(?:negative\s+prompt|avoid)\s*:\s*[^.;\n]*[.;]?/gi, '')
    .replace(/\bseed\s*(?:of|=|:|to|number)?\s*\d{1,10}\b[.,;]?/gi, '')
    .replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim();
}

module.exports = { extract, stripSettingWords, CONCEPTS, fit };
