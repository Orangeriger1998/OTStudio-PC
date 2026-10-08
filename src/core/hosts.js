'use strict';
// Host approval. An entry is an exact host name, or a name starting with "." that also covers its subdomains.

function normal(host) {
  return String(host || '').trim().toLowerCase().replace(/\.$/, '');
}

function matches(host, entry) {
  const h = normal(host);
  const e = normal(entry);
  if (!h || !e) return false;
  return e.startsWith('.') ? h.endsWith(e) && h.length > e.length : h === e;
}

function allowed(url, entries) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  return entries.some((e) => matches(u.hostname, e));
}

module.exports = { matches, allowed, normal };
