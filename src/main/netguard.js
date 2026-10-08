'use strict';
// Every network call in OT Studio goes through here. Only https addresses on approved hosts are reached, redirects are
// followed only to approved hosts, and a key header is dropped when a redirect leaves the key's own origin.

const { allowed } = require('../core/hosts');

class NetError extends Error {
  constructor(message, { sent = true } = {}) { super(message); this.sent = sent; }
}

const NOT_SENT = new Set(['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE']);

/** [hosts]() returns the approved host list at call time. [fetchImpl] is the platform fetch. */
function createNet(hosts, fetchImpl = globalThis.fetch) {
  async function request(url, { method = 'GET', headers = {}, body, timeout = 60000, keyHeaders = [] } = {}) {
    let current = url;
    let h = { ...headers };
    const keyOrigin = new URL(url).origin;
    for (let hop = 0; hop < 5; hop++) {
      if (!allowed(current, hosts())) throw new NetError(`OT Studio is not allowed to reach ${safeHost(current)}.`, { sent: false });
      let res;
      try {
        res = await fetchImpl(current, { method, headers: h, body, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
      } catch (e) {
        const code = e?.cause?.code || e?.code;
        const sent = !NOT_SENT.has(code);
        throw new NetError(e?.name === 'TimeoutError' ? 'The service did not answer in time.' : `The connection failed${code ? ` (${code})` : ''}.`, { sent });
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location'), current).toString();
        if (new URL(current).origin !== keyOrigin) for (const k of keyHeaders) delete h[k];
        if (res.status === 303) { method = 'GET'; body = undefined; }
        continue;
      }
      return res;
    }
    throw new NetError('The service redirected too many times.');
  }

  /** Reads a response body with a size cap. */
  async function bytes(res, max) {
    const len = Number(res.headers.get('content-length'));
    if (len && len > max) throw new NetError('The answer is too large.');
    const reader = res.body.getReader();
    const parts = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) { reader.cancel().catch(() => {}); throw new NetError('The answer is too large.'); }
      parts.push(value);
    }
    return Buffer.concat(parts.map((p) => Buffer.from(p)));
  }

  async function json(res, max = 64 * 1024 * 1024) {
    const buf = await bytes(res, max);
    try { return JSON.parse(buf.toString('utf8')); } catch { return { _text: buf.toString('utf8', 0, 400) }; }
  }

  return { request, bytes, json };
}

function safeHost(url) {
  try { return new URL(url).hostname; } catch { return 'that address'; }
}

module.exports = { createNet, NetError };
