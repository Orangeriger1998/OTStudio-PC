'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fill, fillText } = require('../src/core/template');
const { get } = require('../src/core/jsonpath');

test('exact placeholders keep their type, and missing values drop their field', () => {
  const out = fill({ prompt: '{prompt}', n: '{n}', seed: '{seed}', fixed: 'x' }, { prompt: 'hi', n: 2, seed: undefined });
  assert.deepEqual(out, { prompt: 'hi', n: 2, fixed: 'x' });
});

test('list items repeat per picture, and unused frame entries disappear', () => {
  const t = {
    refs: [{ type: 'image_url', image_url: { url: '{references}' } }],
    frames: [
      { image_url: { url: '{first_frame}' }, frame_type: 'first_frame' },
      { image_url: { url: '{last_frame}' }, frame_type: 'last_frame' },
    ],
  };
  const out = fill(t, { references: ['a', 'b'], first_frame: 'f', last_frame: undefined });
  assert.deepEqual(out.refs, [{ type: 'image_url', image_url: { url: 'a' } }, { type: 'image_url', image_url: { url: 'b' } }]);
  assert.deepEqual(out.frames, [{ image_url: { url: 'f' }, frame_type: 'first_frame' }]);
  const none = fill(t, { references: [], first_frame: undefined, last_frame: undefined });
  assert.deepEqual(none, {}, 'empty lists are left out entirely');
});

test('undeclared braces stay as written', () => {
  assert.deepEqual(fill({ a: '{other}', b: 'x {prompt} y' }, { prompt: 'p' }), { a: '{other}', b: 'x p y' });
  assert.equal(fillText('https://x/{model}/run', { model: 'a/b' }, (s) => s.split('/').map(encodeURIComponent).join('/')), 'https://x/a/b/run');
});

test('json paths read items and every item', () => {
  const v = { data: [{ url: 'u1' }, { url: 'u2' }], output: { video_url: 'v' } };
  assert.equal(get(v, 'data[0].url'), 'u1');
  assert.deepEqual(get(v, 'data[*].url'), ['u1', 'u2']);
  assert.equal(get(v, 'output.video_url'), 'v');
  assert.equal(get(v, 'nothing.here'), undefined);
});
