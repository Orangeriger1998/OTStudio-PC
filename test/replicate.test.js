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

test('settings that count only in some cases: Seedream width and height need a custom size, and its shape needs a size that is not custom', () => {
  const seedream = { components: { schemas: { Input: { properties: {
    prompt: { type: 'string', 'x-order': 0 },
    size: { type: 'string', enum: ['2K', '4K', 'custom'], default: '2K', description: "Image resolution: 2K (2048px), 4K (4096px), or 'custom' for specific dimensions.", 'x-order': 1 },
    aspect_ratio: { type: 'string', enum: ['match_input_image', '1:1', '4:3'], default: 'match_input_image', description: "Image aspect ratio. Only used when size is not 'custom'.", 'x-order': 2 },
    width: { type: 'integer', minimum: 1024, maximum: 4096, default: 2048, description: "Custom image width (only used when size='custom'). Range: 1024-4096 pixels.", 'x-order': 3 },
    height: { type: 'integer', minimum: 1024, maximum: 4096, default: 2048, description: "Custom image height (only used when size='custom'). Range: 1024-4096 pixels.", 'x-order': 4 },
  } } } } };
  const c = replicate.parseSchema(seedream, 'image', 'bytedance/seedream-4.5');
  const by = Object.fromEntries(c.map((x) => [x.name, x]));
  assert.deepEqual(by.width.when, { name: 'size', is: 'custom' });
  assert.deepEqual(by.aspect_ratio.when, { name: 'size', not: 'custom' });
  assert.equal(replicate.active(by.width, c, {}), false, 'width does not count at the default size 2K');
  assert.equal(replicate.active(by.aspect_ratio, c, {}), true);
  assert.deepEqual(replicate.buildInput(c, 'a beach', { aspect_ratio: '4:3', width: 3000, height: 2000 }, {}), { prompt: 'a beach', aspect_ratio: '4:3' }, 'stale width and height are not sent');
  assert.deepEqual(replicate.buildInput(c, 'a beach', { size: 'custom', aspect_ratio: '4:3', width: 3000, height: 2000 }, {}), { prompt: 'a beach', size: 'custom', width: 3000, height: 2000 }, 'with a custom size, the shape is not sent');

  // FLUX 1.1 pro style: width and height belong to a custom shape.
  const pro = { components: { schemas: { Input: { properties: { prompt: { type: 'string' }, aspect_ratio: { type: 'string', enum: ['custom', '1:1', '16:9'], default: '1:1' }, width: { type: 'integer', minimum: 256, maximum: 1440 }, height: { type: 'integer', minimum: 256, maximum: 1440 } } } } } };
  const p = replicate.parseSchema(pro, 'image', 'black-forest-labs/flux-1.1-pro');
  assert.deepEqual(p.find((x) => x.name === 'width').when, { name: 'aspect_ratio', is: 'custom' });
  assert.deepEqual(replicate.buildInput(p, 'x', { width: 512, height: 512 }, {}), { prompt: 'x' });
});
