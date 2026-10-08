'use strict';
// Small JSON files in the app's data folder. Each write goes to a temporary file first, then replaces the old one,
// so a crash never leaves half a file.

const fs = require('fs');
const path = require('path');

function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const cache = new Map();
  const file = (name) => {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('bad store name');
    return path.join(dir, `${name}.json`);
  };
  return {
    dir,
    read(name, fallback) {
      if (cache.has(name)) return structuredClone(cache.get(name));
      let value = fallback;
      try { value = JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { /* first run or unreadable: use the fallback */ }
      cache.set(name, value);
      return structuredClone(value);
    },
    write(name, value) {
      const f = file(name);
      const tmp = `${f}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(value));
      fs.renameSync(tmp, f);
      cache.set(name, structuredClone(value));
    },
  };
}

module.exports = { createStore };
