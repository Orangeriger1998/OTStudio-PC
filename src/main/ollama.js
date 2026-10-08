'use strict';
// The local chat model, through Ollama on this PC. Requests go only to 127.0.0.1 on Ollama's port, with no key, and the
// model's answers are data: the plan JSON is checked field by field (src/core/chatplan.js) and never run.

const chatplan = require('../core/chatplan');

class OllamaError extends Error {}

function createOllama({ net, port = () => 11434 }) {
  const base = () => `http://127.0.0.1:${port()}`;

  async function call(pathname, body, timeout = 180000) {
    let res;
    try {
      res = await net.request(`${base()}${pathname}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, timeout });
    } catch (e) {
      throw new OllamaError(`Ollama is not answering on port ${port()}. Start Ollama, then try again. (${e.message})`);
    }
    const json = await net.json(res, 8 * 1024 * 1024);
    if (!res.ok) throw new OllamaError(`Ollama answered with status ${res.status}${json && json.error ? `: ${String(json.error).slice(0, 200)}` : ''}.`);
    return json;
  }

  /** The models Ollama has, by name. */
  async function models() {
    const j = await call('/api/tags');
    return (Array.isArray(j.models) ? j.models : []).map((m) => String(m.name || '')).filter((n) => /^[\w.:/-]{1,120}$/.test(n));
  }

  /** The model's plan for one request, as parsed JSON (still unchecked). */
  async function plan(model, state, request) {
    const j = await call('/api/chat', {
      model, stream: false, think: false, format: chatplan.SCHEMA, keep_alive: '15m', options: { temperature: 0, num_predict: 400 },
      messages: [{ role: 'system', content: chatplan.SYSTEM }, { role: 'user', content: `${state}\nRequest: ${request}` }],
    });
    try { return JSON.parse(j.message && j.message.content); } catch { return null; }
  }

  /** A short plain answer to a question about the app. */
  async function reply(model, turns) {
    const j = await call('/api/chat', {
      model, stream: false, think: false, keep_alive: '15m', options: { temperature: 0.4, num_predict: 300 },
      messages: [{ role: 'system', content: chatplan.HELP }, ...turns.slice(-8)],
    });
    return String((j.message && j.message.content) || '').replace(/[\p{Cc}&&[^\n]]+/gv, ' ').trim().slice(0, 2000);
  }

  return { models, plan, reply, base };
}

module.exports = { createOllama, OllamaError };
