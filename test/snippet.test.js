'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSnippet } = require('../src/core/snippet');

test('reads a curl example with a JSON body and a bearer key', () => {
  const r = parseSnippet(`curl -X POST "https://api.spicyapi.com/v1/images/generations" \\
  -H "Authorization: Bearer $SPICY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "spicy-image-1", "prompt": "a lighthouse at dusk", "n": 1, "enhance_prompt": false}'`);
  assert.equal(r.method, 'POST');
  assert.equal(r.url, 'https://api.spicyapi.com/v1/images/generations');
  assert.deepEqual(r.keyHeader, { name: 'Authorization', template: 'Bearer {key}' });
  assert.equal(r.headers.Authorization, undefined, 'the key header is taken out of the plain headers');
  assert.deepEqual(r.body, { model: 'spicy-image-1', prompt: 'a lighthouse at dusk', n: 1, enhance_prompt: false });
});

test('reads a curl example with a pasted literal key and never keeps the key', () => {
  const r = parseSnippet(`curl https://api.example.com/v1/gen -H 'x-api-key: abc123secret' --json '{"prompt":"hi"}'`);
  assert.deepEqual(r.keyHeader, { name: 'x-api-key', template: '{key}' });
  assert.ok(!JSON.stringify(r).includes('abc123secret'));
  assert.equal(r.method, 'POST');
});

test('reads a Python requests example', () => {
  const r = parseSnippet(`import os, requests
resp = requests.post(
    "https://api.example.com/v1/images",
    headers={"Authorization": f"Bearer {os.environ['EXAMPLE_KEY']}", "Content-Type": "application/json"},
    json={"model": "m-1", "prompt": "a cat", "steps": 30, "hd": True, "style": None},
)
print(resp.json())`);
  assert.equal(r.method, 'POST');
  assert.equal(r.url, 'https://api.example.com/v1/images');
  assert.deepEqual(r.keyHeader, { name: 'Authorization', template: 'Bearer {key}' });
  assert.deepEqual(r.body, { model: 'm-1', prompt: 'a cat', steps: 30, hd: true, style: null });
});

test('reads a Node fetch example', () => {
  const r = parseSnippet(`const res = await fetch("https://api.example.com/v1/videos", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.EXAMPLE_KEY}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "v-2", prompt: "waves", duration: 5, frames: [1, 2] }),
});`);
  assert.equal(r.method, 'POST');
  assert.deepEqual(r.keyHeader, { name: 'Authorization', template: 'Bearer {key}' });
  assert.deepEqual(r.body, { model: 'v-2', prompt: 'waves', duration: 5, frames: [1, 2] });
});

test('refuses examples without an https address or a known form', () => {
  assert.throws(() => parseSnippet('curl http://api.example.com/x -d "{}"'), /https/);
  assert.throws(() => parseSnippet('print("hello")'), /curl, Python requests, or Node fetch/);
  assert.throws(() => parseSnippet(''), /Paste/);
});

test('a body read from a file gives a warning instead of a guess', () => {
  const r = parseSnippet('curl https://api.example.com/x -H "Authorization: Bearer $K" -d @request.json');
  assert.equal(r.body, null);
  assert.equal(r.warnings.length, 1);
});
