'use strict';
// The chat model: either a model in Ollama on this PC (private: nothing leaves the computer) or a model on OpenRouter
// (the chat text goes to OpenRouter with the user's OpenRouter key). A choice is stored as "ollama:<name>" or
// "openrouter:<model id>". Both answer in the same fixed JSON format, and the app checks every field.

const chatplan = require('../core/chatplan');

const OPENROUTER = 'https://openrouter.ai/api/v1';
/** Inexpensive OpenRouter models that support structured outputs (checked against the live list, 2026-10-08). */
const CLOUD_MODELS = [
  ['anthropic/claude-haiku-5.5', 'Claude Haiku 5.5'],
  ['qwen/qwen3.8-flash', 'Qwen3.8 Flash'],
  ['deepseek/deepseek-v4.1-flash', 'DeepSeek V4.1 Flash'],
  ['google/gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite'],
  ['openai/gpt-5.6-luna', 'GPT-5.6 Luna'],
];
const NAME = /^[\w.:/-]{1,160}$/;

class LlmError extends Error {}

/** "ollama:x" -> { local: true, model: 'x' }. A bare name from version 0.4.0 is an Ollama model. */
function parseChoice(choice) {
  const c = String(choice || '');
  if (!c) return null;
  if (c.startsWith('openrouter:')) return { local: false, model: c.slice(11) };
  return { local: true, model: c.startsWith('ollama:') ? c.slice(7) : c };
}

function createLlm({ ollama, net, keys, settings }) {
  function openRouterKey() {
    const k = keys.get('openrouter');
    if (!k) throw new LlmError('Add your OpenRouter key in Settings to use an OpenRouter chat model, or choose a model on this PC.');
    return k;
  }

  async function openRouterChat(model, messages, extra) {
    if (!NAME.test(model)) throw new LlmError('That chat model name is not usable.');
    let res;
    try {
      res = await net.request(`${OPENROUTER}/chat/completions`, {
        method: 'POST', headers: { Authorization: `Bearer ${openRouterKey()}`, 'Content-Type': 'application/json' }, keyHeaders: ['Authorization'], timeout: 120000,
        body: JSON.stringify({ model, messages, ...extra }),
      });
    } catch (e) {
      if (e instanceof LlmError) throw e;
      throw new LlmError(`OpenRouter is not answering. (${e.message})`);
    }
    const j = await net.json(res, 4 * 1024 * 1024);
    if (!res.ok) throw new LlmError(`OpenRouter answered with status ${res.status}${j && j.error && j.error.message ? `: ${String(j.error.message).slice(0, 200)}` : ''}.`);
    return String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '');
  }

  /** The chat models to offer: every Ollama model (private) and the OpenRouter list (online). */
  async function models() {
    let local = [];
    let localError = '';
    try { local = await ollama.models(); } catch (e) { localError = e.message; }
    const added = (settings().chatCloudModels || []).filter((m) => NAME.test(m) && !CLOUD_MODELS.some(([id]) => id === m));
    return {
      local: local.map((m) => ({ id: `ollama:${m}`, name: m, local: true })),
      cloud: [...CLOUD_MODELS.map(([id, name]) => ({ id: `openrouter:${id}`, name, local: false })), ...added.map((m) => ({ id: `openrouter:${m}`, name: m, local: false, added: true }))],
      localError,
      hasOpenRouterKey: keys.has('openrouter'),
    };
  }

  /** Checks that an OpenRouter model exists and supports structured outputs, before it joins the list. */
  async function checkCloud(model) {
    const m = String(model || '').trim();
    if (!NAME.test(m)) throw new LlmError('Use an OpenRouter model id, such as anthropic/claude-haiku-5.5.');
    const res = await net.request(`${OPENROUTER}/models`, { timeout: 60000 });
    const j = await net.json(res, 16 * 1024 * 1024);
    const found = Array.isArray(j.data) ? j.data.find((x) => x.id === m) : null;
    if (!found) throw new LlmError(`OpenRouter has no model called ${m}.`);
    if (!(found.supported_parameters || []).includes('structured_outputs')) throw new LlmError(`${m} cannot answer in a fixed format, so the chat cannot use it.`);
    return m;
  }

  async function plan(choice, state, request) {
    const c = parseChoice(choice);
    if (!c) throw new LlmError('Choose a chat model at the top of the Chat tab.');
    if (c.local) return ollama.plan(c.model, state, request);
    const text = await openRouterChat(c.model, [{ role: 'system', content: chatplan.SYSTEM }, { role: 'user', content: `${state}\nRequest: ${request}` }], {
      temperature: 0, max_tokens: 400, provider: { require_parameters: true },
      response_format: { type: 'json_schema', json_schema: { name: 'plan', strict: true, schema: chatplan.SCHEMA } },
    });
    try { return JSON.parse(text); } catch { return null; }
  }

  async function reply(choice, turns) {
    const c = parseChoice(choice);
    if (!c) throw new LlmError('Choose a chat model at the top of the Chat tab.');
    if (c.local) return ollama.reply(c.model, turns);
    const text = await openRouterChat(c.model, [{ role: 'system', content: chatplan.HELP }, ...turns.slice(-8)], { temperature: 0.4, max_tokens: 300 });
    return text.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, 2000);
  }

  return { models, plan, reply, checkCloud };
}

module.exports = { createLlm, parseChoice, CLOUD_MODELS, LlmError };
