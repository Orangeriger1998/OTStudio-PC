'use strict';
// Fills a service's body template. A string that is exactly "{name}" becomes the value itself, so numbers stay numbers
// and lists stay lists. A missing value removes its field. In a list, an item that uses a list value repeats once per
// element, and an item that lost a value is left out, so an unused "last frame" entry disappears with its picture.
// Only names the caller declares are placeholders; any other text in braces is left as written.

const DROP = Symbol('drop');
const NAME = /\{([A-Za-z_][\w]*)\}/g;

const missing = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function names(t, out = new Set()) {
  if (typeof t === 'string') { for (const m of t.matchAll(NAME)) out.add(m[1]); }
  else if (Array.isArray(t)) t.forEach((x) => names(x, out));
  else if (t && typeof t === 'object') Object.values(t).forEach((x) => names(x, out));
  return out;
}

function walk(t, vars) {
  if (typeof t === 'string') {
    const exact = /^\{([A-Za-z_][\w]*)\}$/.exec(t);
    if (exact && Object.prototype.hasOwnProperty.call(vars, exact[1])) {
      const v = vars[exact[1]];
      return missing(v) ? { value: DROP, lost: true } : { value: v, lost: false };
    }
    let lost = false;
    const value = t.replace(NAME, (m, n) => {
      if (!Object.prototype.hasOwnProperty.call(vars, n)) return m;
      if (missing(vars[n])) { lost = true; return ''; }
      return String(vars[n]);
    });
    return { value, lost };
  }
  if (Array.isArray(t)) {
    const out = [];
    for (const item of t) {
      const listName = [...names(item)].find((n) => Array.isArray(vars[n]));
      const copies = listName && typeof item !== 'string' ? vars[listName].map((el) => ({ ...vars, [listName]: el })) : [vars];
      for (const v of copies) {
        const r = walk(item, v);
        if (r.value !== DROP && !r.lost) out.push(r.value);
      }
    }
    return { value: out.length || !t.length ? out : DROP, lost: false };
  }
  if (t && typeof t === 'object') {
    const out = {};
    let lost = false;
    for (const [k, v] of Object.entries(t)) {
      const r = walk(v, vars);
      if (r.lost) lost = true;
      if (r.value !== DROP) out[k] = r.value;
    }
    return { value: out, lost };
  }
  return { value: t, lost: false };
}

/** The filled value. Every name in [vars] counts as a placeholder, even when its value is missing. */
function fill(template, vars) {
  const r = walk(template, vars);
  return r.value === DROP ? undefined : r.value;
}

/** Fills placeholders inside one string (an address or a header). */
function fillText(text, vars, encode = (s) => s) {
  return String(text).replace(NAME, (m, n) => (Object.prototype.hasOwnProperty.call(vars, n) ? (missing(vars[n]) ? '' : encode(String(vars[n]))) : m));
}

module.exports = { fill, fillText, names };
