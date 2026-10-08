'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLlm, parseChoice } = require('../src/main/llm');
const { createNet } = require('../src/main/netguard');
const { BUILTIN_HOSTS } = require('../src/core/builtins');

function json(status, value) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }

function setup({ key = 'sk-or-test1234', cloudModels = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, headers: opts.headers, body: opts.body ? JSON.parse(opts.body) : null });
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      const b = JSON.parse(opts.body);
      return json(200, { choices: [{ message: { content: b.response_format ? JSON.stringify({ action: 'expand', target: 'last_picture', shape: 'wide', seconds: 0, prompt: '', reply: '' }) : 'A LoRA teaches a face.' } }] });
    }
    if (url === 'https://openrouter.ai/api/v1/models') return json(200, { data: [{ id: 'good/model', supported_parameters: ['structured_outputs'] }, { id: 'plain/model', supported_parameters: [] }] });
    throw new Error(`unexpected ${url}`);
  };
  const net = createNet(() => BUILTIN_HOSTS, fetchImpl);
  const local = [];
  const ollama = { models: async () => ['gemma4-e2b:latest'], plan: async (m) => { local.push(m); return { action: 'answer' }; }, reply: async () => 'local answer' };
  const llm = createLlm({ ollama, net, keys: { get: () => key, has: () => !!key }, settings: () => ({ chatCloudModels: cloudModels }) });
  return { llm, calls, local };
}

test('choices: private Ollama models and OpenRouter models, and the 0.4.0 setting still works', async () => {
  assert.deepEqual(parseChoice('gemma4-e2b:latest'), { local: true, model: 'gemma4-e2b:latest' });
  assert.deepEqual(parseChoice('ollama:gemma4-e2b:latest'), { local: true, model: 'gemma4-e2b:latest' });
  assert.deepEqual(parseChoice('openrouter:anthropic/claude-haiku-5.5'), { local: false, model: 'anthropic/claude-haiku-5.5' });
  const { llm, local, calls } = setup({ cloudModels: ['good/model'] });
  const list = await llm.models();
  assert.deepEqual(list.local, [{ id: 'ollama:gemma4-e2b:latest', name: 'gemma4-e2b:latest', local: true }]);
  assert.ok(list.cloud.some((m) => m.id === 'openrouter:anthropic/claude-haiku-5.5' && m.local === false));
  assert.ok(list.cloud.some((m) => m.id === 'openrouter:good/model'));
  await llm.plan('gemma4-e2b:latest', 'state', 'hi');
  assert.deepEqual(local, ['gemma4-e2b:latest']);
  assert.equal(calls.length, 0, 'a private model never reaches the network beyond Ollama');
});

test('OpenRouter chat: fixed answer format, key only in the header, and plain answers', async () => {
  const { llm, calls } = setup();
  const plan = await llm.plan('openrouter:anthropic/claude-haiku-5.5', 'App state: x', 'make it wide');
  assert.equal(plan.action, 'expand');
  const sent = calls[0];
  assert.equal(sent.headers.Authorization, 'Bearer sk-or-test1234');
  assert.equal(sent.body.model, 'anthropic/claude-haiku-5.5');
  assert.equal(sent.body.response_format.type, 'json_schema');
  assert.equal(sent.body.response_format.json_schema.strict, true);
  assert.equal(sent.body.response_format.json_schema.schema.additionalProperties, false);
  assert.ok(!JSON.stringify(sent.body).includes('sk-or-test1234'));
  assert.equal(await llm.reply('openrouter:anthropic/claude-haiku-5.5', [{ role: 'user', content: 'what is a LoRA?' }]), 'A LoRA teaches a face.');
});

test('OpenRouter chat without a key asks for one, and only models with structured outputs can be added', async () => {
  const { llm } = setup({ key: '' });
  await assert.rejects(llm.plan('openrouter:anthropic/claude-haiku-5.5', 's', 'x'), /OpenRouter key/);
  assert.equal(await llm.checkCloud('good/model'), 'good/model');
  await assert.rejects(llm.checkCloud('plain/model'), /fixed format/);
  await assert.rejects(llm.checkCloud('missing/model'), /no model called/);
});
