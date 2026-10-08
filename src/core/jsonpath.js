'use strict';
// Tiny path reader for service results: "data[0].url", "output.video_url", "data[*].b64_json".
// A [*] step collects from every item, so the result is then an array.

function tokens(path) {
  const out = [];
  const re = /([^.[\]]+)|\[(\d+|\*)\]/g;
  let m;
  while ((m = re.exec(path)) !== null) out.push(m[1] !== undefined ? m[1] : (m[2] === '*' ? '*' : Number(m[2])));
  return out;
}

function get(value, path) {
  if (!path) return value;
  let current = [value];
  let many = false;
  for (const step of tokens(path)) {
    const next = [];
    for (const item of current) {
      if (item === null || item === undefined) continue;
      if (step === '*') { if (Array.isArray(item)) { next.push(...item); many = true; } }
      else if (typeof step === 'number') { if (Array.isArray(item) && step < item.length) next.push(item[step]); }
      else if (typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, step)) next.push(item[step]);
    }
    current = next;
  }
  if (many) return current;
  return current.length ? current[0] : undefined;
}

/** Every path to a string value in a JSON value, for offering result fields to pick from. */
function stringPaths(value, prefix = '', out = []) {
  if (out.length > 200) return out;
  if (typeof value === 'string') out.push({ path: prefix, sample: value.slice(0, 80) });
  else if (Array.isArray(value)) value.slice(0, 3).forEach((v, i) => stringPaths(v, `${prefix}[${i}]`, out));
  else if (value && typeof value === 'object') Object.keys(value).forEach((k) => stringPaths(value[k], prefix ? `${prefix}.${k}` : k, out));
  return out;
}

module.exports = { get, tokens, stringPaths };
