'use strict';
// The only bridge between the window and the rest of OT Studio. The window gets these calls and nothing else:
// no file access, no network, and no keys (only whether each key is saved).

const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = [
  'state', 'key:set', 'key:clear', 'settings:set', 'models', 'replicate:add', 'replicate:forget', 'form', 'pictures:pick',
  'generate', 'expand', 'upscale', 'media:size', 'video:lastFrame', 'cancel', 'remove', 'download:retry', 'save', 'folder:open', 'folder:change',
  'snippet:parse', 'service:rebuild', 'service:test', 'service:save', 'service:remove', 'service:export', 'service:import',
  'hosts:remove', 'link:open',
];

const api = {};
for (const channel of CHANNELS) {
  const name = channel.replace(/:(\w)/g, (_, c) => c.toUpperCase());
  api[name] = async (...args) => {
    const r = await ipcRenderer.invoke(channel, ...args);
    if (!r || !r.ok) throw new Error(r && r.error ? r.error : 'Something went wrong.');
    return r.value;
  };
}
api.onJob = (callback) => ipcRenderer.on('job', (_event, entry) => callback(entry));

contextBridge.exposeInMainWorld('ot', api);
