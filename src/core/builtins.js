'use strict';
// Services that come with the app. They use the same definition format as services a user adds.
// SpicyAPI: text-only models (owner decision, 2026-10-05). No picture input is offered or sent.
// OpenRouter: the images and videos endpoints, checked against openrouter.ai/docs and the live model lists (2026-10-07).

const bearer = { name: 'Authorization', template: 'Bearer {key}' };
const json = { 'Content-Type': 'application/json' };
const spicySizes = ['832*1216', '1216*832', '1024*1024', '1280*1280', '1440*1440', '1024*1536', '1536*1024', '1080*1920', '1920*1080', '1152*2048', '2048*1152'];

const spicyImage = {
  id: 'spicyapi-image', name: 'SpicyAPI', kind: 'image', keySlot: 'spicyapi', keyLabel: 'SpicyAPI', builtin: true,
  keyHeader: bearer, promptMax: 2000,
  request: { method: 'POST', url: 'https://api.spicyapi.com/v1/images/generations', headers: json,
    body: { model: '{model}', prompt: '{prompt}', size: '{size}', n: '{n}', style: '{style}', negative_prompt: '{negative_prompt}', seed: '{seed}', enhance_prompt: '{enhance_prompt}' } },
  models: { fixed: [{ id: 'spicy-image-1', name: 'Spicy Image 1' }, { id: 'spicy-image-1-pro', name: 'Spicy Image 1 Pro' }] },
  options: [
    { name: 'size', label: 'Size', type: 'choice', choices: spicySizes, default: '832*1216', simple: true, note: 'Width by height in pixels.' },
    { name: 'n', label: 'Number of pictures', type: 'number', min: 1, max: 4, default: 1, simple: true, note: 'Each picture is billed.' },
    { name: 'style', label: 'Style', type: 'choice', choices: ['photorealistic', 'studio', 'anime', '3d', 'cartoon'], default: 'photorealistic', simple: true },
    { name: 'negative_prompt', label: 'Avoid', type: 'text' },
    { name: 'seed', label: 'Seed', type: 'number' },
    { name: 'enhance_prompt', label: 'Plan the shot first', type: 'switch', default: false },
  ],
  pictures: [],
  result: { mode: 'sync', media: 'data[*].url', error: ['error.message', 'error', 'message'] },
  mediaHosts: ['cdn.spicyapi.com'],
};

const spicyVideo = {
  id: 'spicyapi-video', name: 'SpicyAPI', kind: 'video', keySlot: 'spicyapi', keyLabel: 'SpicyAPI', builtin: true,
  keyHeader: bearer, promptMax: 2000,
  request: { method: 'POST', url: 'https://api.spicyapi.com/v1/videos/generations', headers: json,
    body: { model: '{model}', prompt: '{prompt}', aspect_ratio: '{aspect_ratio}', duration: '{duration}', resolution: '{resolution}' } },
  models: { fixed: [{ id: 'spicy-video-1', name: 'Spicy Video 1' }, { id: 'spicy-cinema-1', name: 'Spicy Cinema 1' }] },
  options: [
    { name: 'aspect_ratio', label: 'Shape', type: 'choice', choices: ['16:9', '9:16', '1:1', '4:3', '3:4'], default: '16:9', simple: true, onlyModels: ['spicy-video-1'] },
    { name: 'cinema_shape', label: 'Shape', type: 'choice', choices: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21', '4:5'], default: '16:9', simple: true, onlyModels: ['spicy-cinema-1'], sendAs: 'aspect_ratio' },
    { name: 'duration', label: 'Length in seconds', type: 'number', min: 3, max: 15, default: 5, simple: true, onlyModels: ['spicy-cinema-1'] },
    { name: 'resolution', label: 'Resolution', type: 'choice', choices: ['480P', '720P', '1080P'], default: '720P', simple: true, onlyModels: ['spicy-cinema-1'] },
  ],
  pictures: [],
  result: { mode: 'task', taskId: 'id', poll: { url: 'https://api.spicyapi.com/v1/videos/tasks/{id}' }, status: 'status',
    done: ['succeeded'], failed: ['failed'], media: 'output.video_url', error: ['error', 'error_code', 'error.message'], interval: 10 },
  mediaHosts: ['cdn.spicyapi.com'],
};

const orModels = (kind) => ({ url: `https://openrouter.ai/api/v1/${kind}/models`, list: 'data', id: 'id', name: 'name' });

const openRouterImage = {
  id: 'openrouter-image', name: 'OpenRouter', kind: 'image', keySlot: 'openrouter', keyLabel: 'OpenRouter', builtin: true,
  keyHeader: bearer,
  request: { method: 'POST', url: 'https://openrouter.ai/api/v1/images', headers: json,
    body: { model: '{model}', prompt: '{prompt}', n: '{n}', resolution: '{resolution}', aspect_ratio: '{aspect_ratio}', quality: '{quality}', seed: '{seed}',
      input_references: [{ type: 'image_url', image_url: { url: '{references}' } }] } },
  models: { ...orModels('images'), fixed: [{ id: 'bytedance-seed/seedream-4.5', name: 'Seedream 4.5' }, { id: 'google/gemini-2.5-flash-image', name: 'Nano Banana' }, { id: 'black-forest-labs/flux.2-pro', name: 'FLUX.2 pro' }] },
  options: [
    { name: 'aspect_ratio', label: 'Shape', type: 'choice', fromModel: 'supported_parameters.aspect_ratio', choices: ['1:1'], default: '1:1', simple: true },
    { name: 'resolution', label: 'Resolution', type: 'choice', fromModel: 'supported_parameters.resolution', needsModelInfo: true, choices: [], simple: true },
    { name: 'n', label: 'Number of pictures', type: 'number', fromModel: 'supported_parameters.n', needsModelInfo: true, min: 1, max: 4, default: 1, simple: true, note: 'Each picture is billed.' },
    { name: 'quality', label: 'Quality', type: 'choice', fromModel: 'supported_parameters.quality', needsModelInfo: true, choices: [] },
    { name: 'seed', label: 'Seed', type: 'number', fromModel: 'supported_parameters.seed', needsModelInfo: true },
  ],
  pictures: [{ name: 'references', label: 'Reference pictures', max: 14, maxFromModel: 'supported_parameters.input_references.max' }],
  result: { mode: 'sync', media: 'data[*].b64_json', mediaType: 'data[0].media_type', error: ['error.message', 'error', 'message'], cost: 'usage.cost' },
  mediaHosts: [],
};

const openRouterVideo = {
  id: 'openrouter-video', name: 'OpenRouter', kind: 'video', keySlot: 'openrouter', keyLabel: 'OpenRouter', builtin: true,
  keyHeader: bearer,
  request: { method: 'POST', url: 'https://openrouter.ai/api/v1/videos', headers: json,
    body: { model: '{model}', prompt: '{prompt}', duration: '{duration}', resolution: '{resolution}', aspect_ratio: '{aspect_ratio}', generate_audio: '{generate_audio}', seed: '{seed}',
      frame_images: [
        { type: 'image_url', image_url: { url: '{first_frame}' }, frame_type: 'first_frame' },
        { type: 'image_url', image_url: { url: '{last_frame}' }, frame_type: 'last_frame' },
      ] } },
  models: { ...orModels('videos'), fixed: [{ id: 'alibaba/wan-2.7', name: 'Wan 2.7' }, { id: 'kwaivgi/kling-v3.0-pro', name: 'Kling v3.0 Pro' }, { id: 'bytedance/seedance-1-5-pro', name: 'Seedance 1.5 Pro' }, { id: 'google/veo-3.1-lite', name: 'Veo 3.1 Lite' }] },
  options: [
    { name: 'duration', label: 'Length in seconds', type: 'choice', fromModel: 'supported_durations', choices: [5], default: 5, simple: true },
    { name: 'resolution', label: 'Resolution', type: 'choice', fromModel: 'supported_resolutions', choices: ['720p'], default: '720p', simple: true },
    { name: 'aspect_ratio', label: 'Shape', type: 'choice', fromModel: 'supported_aspect_ratios', choices: ['16:9'], default: '16:9', simple: true },
    { name: 'generate_audio', label: 'Sound', type: 'switch', fromModel: 'generate_audio', needsModelInfo: true, default: false, simple: true, note: 'Sound can add to the price.' },
    { name: 'seed', label: 'Seed', type: 'number', fromModel: 'seed', needsModelInfo: true },
  ],
  pictures: [
    { name: 'first_frame', label: 'Starting picture', max: 1, whenModel: { path: 'supported_frame_images', has: 'first_frame' } },
    { name: 'last_frame', label: 'Ending picture', max: 1, whenModel: { path: 'supported_frame_images', has: 'last_frame' } },
  ],
  result: { mode: 'task', taskId: 'id', poll: { url: 'https://openrouter.ai/api/v1/videos/{id}' }, status: 'status',
    done: ['completed'], failed: ['failed', 'cancelled', 'expired'], media: 'unsigned_urls[*]', error: ['error.message', 'error'], cost: 'usage.cost', interval: 30 },
  mediaHosts: [],
};

const BUILTINS = [spicyImage, spicyVideo, openRouterImage, openRouterVideo];

/** Hosts the app may reach without asking: the built-in services and Replicate. */
const BUILTIN_HOSTS = ['api.replicate.com', 'replicate.delivery', '.replicate.delivery', 'api.spicyapi.com', 'cdn.spicyapi.com', 'openrouter.ai'];

module.exports = { BUILTINS, BUILTIN_HOSTS };
