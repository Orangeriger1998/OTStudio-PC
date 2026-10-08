'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const replicate = require('../src/core/replicate');

const doc = {
  components: {
    schemas: {
      Input: {
        type: 'object', required: ['prompt'],
        properties: {
          prompt: { type: 'string', 'x-order': 0 },
          image_input: { type: 'array', items: { type: 'string', format: 'uri' }, 'x-order': 1 },
          aspect_ratio: { allOf: [{ $ref: '#/components/schemas/aspect_ratio' }], default: 'match_input_image', 'x-order': 2 },
          max_images: { type: 'integer', minimum: 1, maximum: 15, default: 1, 'x-order': 3 },
          disable_safety_checker: { type: 'boolean', default: false, 'x-order': 4 },
          go_fast: { type: 'boolean', default: true, 'x-order': 5 },
        },
      },
      aspect_ratio: { type: 'string', enum: ['match_input_image', '1:1', '16:9'] },
    },
  },
};

test('reads a model input list into form controls', () => {
  const c = replicate.parseSchema(doc, 'image', 'bytedance/seedream-4.5');
  const by = Object.fromEntries(c.map((x) => [x.name, x]));
  assert.equal(by.image_input.picture, true);
  assert.equal(by.image_input.list, true);
  assert.deepEqual(by.aspect_ratio.choices, ['match_input_image', '1:1', '16:9']);
  assert.equal(by.max_images.min, 1);
  assert.equal(by.disable_safety_checker.default, true, 'editing models start with the safety checker off');
  assert.equal(by.go_fast.simple, false);
  assert.equal(by.aspect_ratio.simple, true);
  assert.equal(replicate.parseSchema(doc, 'image', 'black-forest-labs/flux-dev').find((x) => x.name === 'disable_safety_checker').default, false);
});

test('builds the input with uploaded links and checks values', () => {
  const c = replicate.parseSchema(doc, 'image', 'bytedance/seedream-4.5');
  const input = replicate.buildInput(c, 'a beach', { aspect_ratio: '16:9', max_images: 2 }, { image_input: ['https://api.replicate.com/v1/files/a', 'https://api.replicate.com/v1/files/b'] });
  assert.deepEqual(input, { prompt: 'a beach', image_input: ['https://api.replicate.com/v1/files/a', 'https://api.replicate.com/v1/files/b'], aspect_ratio: '16:9', max_images: 2 });
  assert.throws(() => replicate.buildInput(c, 'x', { max_images: 99 }, {}), /at most 15/);
  assert.throws(() => replicate.buildInput(c, 'x', { aspect_ratio: '7:1' }, {}), /cannot be/);
  assert.throws(() => replicate.buildInput(c, '', {}, {}), /prompt/);
});

test('reads predictions', () => {
  assert.deepEqual(replicate.readPrediction({ id: 'abc', status: 'processing' }), { state: 'running', taskId: 'abc', status: 'processing' });
  assert.deepEqual(replicate.readPrediction({ id: 'abc', status: 'succeeded', output: ['https://replicate.delivery/x.png'] }).media, [{ url: 'https://replicate.delivery/x.png' }]);
  assert.equal(replicate.readPrediction({ id: 'abc', status: 'failed', error: 'NSFW content detected' }).error, 'NSFW content detected');
  assert.throws(() => replicate.readPrediction({ id: '../x', status: 'processing' }));
  assert.throws(() => replicate.createRequest('../../evil', {}), /owner\/name/);
});
