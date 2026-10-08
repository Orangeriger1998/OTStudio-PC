'use strict';
// Saved keys must survive every update. This test pins the key file's name, format, and the built-in slot names.
// Never edit it to make a change pass: change the code so that keys saved by earlier versions still work.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createKeys, FILE, BUILTIN_SLOTS } = require('../src/main/keys');
const { BUILTINS } = require('../src/core/builtins');

const cipher = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(`enc:${s}`),
  decryptString: (b) => { const s = b.toString(); if (!s.startsWith('enc:')) throw new Error('bad'); return s.slice(4); },
};

test('the key file contract is unchanged', () => {
  assert.equal(FILE, 'otstudio-keys-v1.json');
  assert.deepEqual(BUILTIN_SLOTS, ['replicate', 'spicyapi', 'openrouter']);
  assert.deepEqual([...new Set(BUILTINS.map((d) => d.keySlot))].sort(), ['openrouter', 'spicyapi']);
});

test('keys written in the version 1 format are read back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otkeys-'));
  fs.writeFileSync(path.join(dir, FILE), JSON.stringify({ version: 1, slots: { replicate: Buffer.from('enc:r8_old_key').toString('base64') } }));
  const keys = createKeys(dir, cipher);
  assert.equal(keys.get('replicate'), 'r8_old_key');
  keys.set('openrouter', 'sk-or-new-key');
  const raw = JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8'));
  assert.equal(raw.version, 1);
  assert.ok(!JSON.stringify(raw).includes('sk-or-new-key'), 'keys are stored encrypted');
  assert.equal(createKeys(dir, cipher).get('replicate'), 'r8_old_key', 'saving another key keeps the old one');
  keys.clear('openrouter');
  assert.equal(keys.has('openrouter'), false);
  assert.equal(keys.get('replicate'), 'r8_old_key');
});

test('keys that do not look like keys are refused', () => {
  const keys = createKeys(fs.mkdtempSync(path.join(os.tmpdir(), 'otkeys-')), cipher);
  assert.throws(() => keys.set('replicate', 'short'));
  assert.throws(() => keys.set('replicate', 'has a space in it'));
  assert.throws(() => keys.set('../evil', 'r8_abcdefgh'));
});
