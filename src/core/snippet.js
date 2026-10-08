'use strict';
// Reads a provider's example request (curl, Python requests, or Node fetch) into its parts: method, address, headers,
// and JSON body. The example is only read as text. It is never run.

const KEY = '{key}';

/** Turns a Python or JavaScript object literal into a JSON value. Environment lookups become the key placeholder. */
function literalToJson(src) {
  let i = 0;
  const s = src;
  function ws() { while (i < s.length) { if (/\s/.test(s[i])) i++; else if (s[i] === '#' || (s[i] === '/' && s[i + 1] === '/')) { while (i < s.length && s[i] !== '\n') i++; } else break; } }
  function str() {
    let prefix = '';
    while (/[fFrRbB]/.test(s[i]) && /['"`]/.test(s[i + 1] || '') ) prefix += s[i++];
    const q = s[i];
    const triple = s.slice(i, i + 3) === q.repeat(3);
    i += triple ? 3 : 1;
    let out = '';
    while (i < s.length) {
      if (triple ? s.slice(i, i + 3) === q.repeat(3) : s[i] === q) { i += triple ? 3 : 1; break; }
      if (s[i] === '\\' && !/[rR]/.test(prefix)) { const n = s[i + 1]; out += n === 'n' ? '\n' : n === 't' ? '\t' : n; i += 2; continue; }
      // ${...} in a template literal, or {...} in an f-string: an environment lookup becomes the key.
      if ((q === '`' && s[i] === '$' && s[i + 1] === '{') || (/[fF]/.test(prefix) && s[i] === '{' && s[i + 1] !== '{')) {
        const start = s.indexOf('{', i) + 1;
        let depth = 1, j = start;
        while (j < s.length && depth) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; j++; }
        const expr = s.slice(start, j - 1);
        out += /environ|env|getenv|key|token/i.test(expr) ? KEY : `{${expr.trim()}}`;
        i = j;
        continue;
      }
      out += s[i++];
    }
    return out;
  }
  function word() { let w = ''; while (i < s.length && /[\w$.[\]'"]/.test(s[i]) && !(/['"]/.test(s[i]) && w === '')) { w += s[i++]; } return w; }
  function value() {
    ws();
    const c = s[i];
    if (c === '{') return obj();
    if (c === '[') return arr();
    if (/['"`]/.test(c) || (/[fFrRbB]/.test(c) && /['"`]/.test(s[i + 1] || ''))) return str();
    const num = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i));
    if (num) { i += num[0].length; return Number(num[0]); }
    const w = word();
    if (w === 'True' || w === 'true') return true;
    if (w === 'False' || w === 'false') return false;
    if (w === 'None' || w === 'null' || w === 'undefined') return null;
    if (/environ|env|getenv/.test(w)) {
      // os.environ['X'], os.environ.get('X'), process.env.X: the key.
      ws();
      if (s[i] === '(' || s[i] === '[') { const close = s[i] === '(' ? ')' : ']'; while (i < s.length && s[i] !== close) i++; i++; }
      return KEY;
    }
    throw new Error(`Cannot read "${w || c}" in the example body.`);
  }
  function obj() {
    i++;
    const out = {};
    for (;;) {
      ws();
      if (s[i] === '}') { i++; return out; }
      let key;
      if (/['"`]/.test(s[i])) key = str(); else { let k = ''; while (i < s.length && /[\w$-]/.test(s[i])) k += s[i++]; key = k; }
      ws();
      if (s[i] !== ':') throw new Error(`Expected ":" after "${key}".`);
      i++;
      out[key] = value();
      ws();
      if (s[i] === ',') i++;
    }
  }
  function arr() {
    i++;
    const out = [];
    for (;;) {
      ws();
      if (s[i] === ']') { i++; return out; }
      out.push(value());
      ws();
      if (s[i] === ',') i++;
    }
  }
  const v = value();
  return v;
}

/** The balanced {...} (or [...]) that starts at or after [from] in [text]. */
function balanced(text, from) {
  const open = text.slice(from).search(/[{[]/);
  if (open < 0) return null;
  let i = from + open;
  const o = text[i], c = o === '{' ? '}' : ']';
  let depth = 0, q = null;
  const start = i;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (/['"`]/.test(ch)) { q = ch; continue; }
    if (ch === o) depth++;
    else if (ch === c) { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

/** Splits a shell command into words, honoring quotes and line continuations. */
function shellWords(text) {
  const s = text.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ');
  const out = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    let w = '';
    while (i < s.length && !/\s/.test(s[i])) {
      if (s[i] === "'") { const j = s.indexOf("'", i + 1); w += s.slice(i + 1, j < 0 ? s.length : j); i = j < 0 ? s.length : j + 1; }
      else if (s[i] === '"') { i++; while (i < s.length && s[i] !== '"') { if (s[i] === '\\' && i + 1 < s.length) { w += s[i + 1]; i += 2; } else w += s[i++]; } i++; }
      else w += s[i++];
    }
    out.push(w);
  }
  return out;
}

function keyed(value) {
  return value.replace(/\$\{?[A-Z][A-Z0-9_]*\}?/g, KEY).replace(/\{process\.env[^}]*\}/g, KEY);
}

function parseCurl(text) {
  const words = shellWords(text.slice(text.search(/\bcurl\b/)));
  let method = null, url = null, data = null;
  const headers = {};
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (w === '-X' || w === '--request') method = words[++i];
    else if (w === '-H' || w === '--header') { const h = words[++i]; const c = h.indexOf(':'); if (c > 0) headers[h.slice(0, c).trim()] = keyed(h.slice(c + 1).trim()); }
    else if (/^(-d|--data|--data-raw|--data-binary|--json)$/.test(w)) { data = words[++i]; if (w === '--json') headers['Content-Type'] = 'application/json'; }
    else if (/^https?:\/\//i.test(w)) url = w;
    else if (/^-/.test(w) && !/^(-s|-S|-sS|--silent|-L|--location|-i|-v|--compressed|-f|--fail)$/.test(w)) i += /^(-o|--output|-u|--user|-m|--max-time|-A|--user-agent|-b|-c)$/.test(w) ? 1 : 0;
  }
  let body = null;
  const warnings = [];
  if (data !== null) {
    if (data.startsWith('@')) warnings.push('The body is read from a file in this example. Paste the JSON body itself instead.');
    else { try { body = JSON.parse(keyed(data)); } catch { try { body = literalToJson(data); } catch { warnings.push('The body is not JSON, so it could not be read.'); } } }
  }
  return { method: (method || (data !== null ? 'POST' : 'GET')).toUpperCase(), url, headers, body, warnings };
}

function parsePython(text) {
  const call = /requests\.(get|post|put|patch|delete)\s*\(\s*(f?["'])(.*?)\2/s.exec(text);
  if (!call) throw new Error('No requests.get or requests.post call was found.');
  const after = call.index + call[0].length;
  const part = (name) => {
    const m = new RegExp(`\\b${name}\\s*=\\s*`).exec(text.slice(after));
    if (!m) return null;
    const lit = balanced(text, after + m.index + m[0].length);
    return lit ? literalToJson(lit) : null;
  };
  const headers = {};
  Object.entries(part('headers') || {}).forEach(([k, v]) => { headers[k] = keyed(String(v)); });
  let body = part('json');
  if (body === null) { const d = /\bdata\s*=\s*json\.dumps\s*\(/.exec(text.slice(after)); if (d) { const lit = balanced(text, after + d.index + d[0].length); body = lit ? literalToJson(lit) : null; } }
  return { method: call[1].toUpperCase(), url: call[3], headers, body, warnings: [] };
}

function parseNode(text) {
  const call = /fetch\s*\(\s*(["'`])(.*?)\1\s*,?/s.exec(text);
  if (!call) throw new Error('No fetch call was found.');
  const opts = balanced(text, call.index + call[0].length);
  let method = 'GET', headers = {}, body = null;
  if (opts) {
    const m = /\bmethod\s*:\s*["'`](\w+)/.exec(opts);
    if (m) method = m[1].toUpperCase();
    const h = /\bheaders\s*:\s*/.exec(opts);
    if (h) { const lit = balanced(opts, h.index + h[0].length); if (lit) Object.entries(literalToJson(lit)).forEach(([k, v]) => { headers[k] = keyed(String(v)); }); }
    const b = /\bbody\s*:\s*JSON\.stringify\s*\(\s*/.exec(opts);
    if (b) { const lit = balanced(opts, b.index + b[0].length); if (lit) body = literalToJson(lit); }
  }
  return { method, url: call[2], headers, body, warnings: [] };
}

/** Reads one example. Returns { method, url, headers, body, keyHeader, warnings }. */
function parseSnippet(text) {
  const src = String(text || '').trim();
  if (!src) throw new Error('Paste an example request first.');
  const parsed = /\bcurl\b/.test(src) ? parseCurl(src) : /\brequests\./.test(src) ? parsePython(src) : /\bfetch\s*\(/.test(src) ? parseNode(src) : null;
  if (!parsed) throw new Error('This does not look like a curl, Python requests, or Node fetch example.');
  if (!parsed.url || !/^https:\/\//i.test(parsed.url)) throw new Error('The example has no https:// address.');
  // The header that carries the key: one with the key placeholder, or an Authorization header.
  const keyName = Object.keys(parsed.headers).find((k) => parsed.headers[k].includes(KEY)) || Object.keys(parsed.headers).find((k) => /^(authorization|x-api-key|api-key)$/i.test(k));
  let keyHeader = null;
  if (keyName) {
    const v = parsed.headers[keyName];
    keyHeader = { name: keyName, template: v.includes(KEY) ? v : (/^bearer\s/i.test(v) ? 'Bearer {key}' : KEY) };
    delete parsed.headers[keyName];
  }
  return { ...parsed, keyHeader };
}

module.exports = { parseSnippet, literalToJson, shellWords, KEY };
