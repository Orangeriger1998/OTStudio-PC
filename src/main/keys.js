'use strict';
// Saved API keys, encrypted with the Windows account's own protection (Electron safeStorage, which uses DPAPI).
// The file name, its format, and the built-in slot names are a contract: updates must keep reading keys saved by
// earlier versions. test/keys-contract.test.js pins them. Never change that test to make a change pass.

const fs = require('fs');
const path = require('path');

const FILE = 'otstudio-keys-v1.json';
const BUILTIN_SLOTS = ['replicate', 'spicyapi', 'openrouter'];
const SLOT_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

class KeyError extends Error {}

/** [cipher] has isEncryptionAvailable(), encryptString(text) -> Buffer, decryptString(buffer) -> text. */
function createKeys(dir, cipher) {
  const file = path.join(dir, FILE);

  function load() {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return data && data.version === 1 && data.slots && typeof data.slots === 'object' ? data : { version: 1, slots: {} };
    } catch {
      return { version: 1, slots: {} };
    }
  }

  function save(data) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
    fs.renameSync(tmp, file);
  }

  function check(slot) {
    if (!SLOT_RE.test(String(slot))) throw new KeyError('That key name is not usable.');
  }

  return {
    file,
    has(slot) { check(slot); return typeof load().slots[slot] === 'string'; },
    slots() { return Object.keys(load().slots).filter((s) => SLOT_RE.test(s)); },
    get(slot) {
      check(slot);
      const stored = load().slots[slot];
      if (typeof stored !== 'string') return '';
      try { return cipher.decryptString(Buffer.from(stored, 'base64')); }
      catch { throw new KeyError('A saved key could not be unlocked on this Windows account. Enter it again in Settings.'); }
    },
    set(slot, value) {
      check(slot);
      const key = String(value || '').trim();
      if (key.length < 8 || key.length > 512 || /[\s\p{Cc}]/u.test(key)) throw new KeyError('That does not look like an API key.');
      if (!cipher.isEncryptionAvailable()) throw new KeyError('Windows encryption is not available, so the key cannot be saved safely.');
      const data = load();
      data.slots[slot] = cipher.encryptString(key).toString('base64');
      save(data);
    },
    clear(slot) {
      check(slot);
      const data = load();
      delete data.slots[slot];
      save(data);
    },
  };
}

module.exports = { createKeys, FILE, BUILTIN_SLOTS, KeyError };
