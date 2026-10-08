'use strict';
// OT Studio for Windows. The window shows the app; this process does everything else. Only this process reaches the
// network, and only through the network guard: Replicate, SpicyAPI, OpenRouter, and hosts the user approved.

const { app, BrowserWindow, ipcMain, dialog, protocol, safeStorage, session, shell, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { createStore } = require('./store');
const { createKeys, BUILTIN_SLOTS } = require('./keys');
const { createNet } = require('./netguard');
const { createJobs, REPLICATE } = require('./jobs');
const { NAME_RE, typeOf } = require('./media');
const { BUILTINS, BUILTIN_HOSTS } = require('../core/builtins');
const service = require('../core/service');
const replicate = require('../core/replicate');
const { parseSnippet } = require('../core/snippet');
const { normal: normalHost } = require('../core/hosts');

const REPO = 'https://github.com/Orangeriger1998/OTStudio-PC';
const RENDERER = path.join(__dirname, '..', 'renderer');

protocol.registerSchemesAsPrivileged([
  { scheme: 'otapp', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'otmedia', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let store, keys, jobs;
const builtins = BUILTINS.map((d) => service.validate(d));

function settings() {
  return { simpleView: true, last: {}, saveDirs: {}, replicateModels: { image: [], video: [] }, ...store.read('settings', {}) };
}
function setSettings(patch) { store.write('settings', { ...settings(), ...patch }); }
function userServices() { return store.read('services', []).flatMap((d) => { try { return [service.validate(d)]; } catch { return []; } }); }
function services() { return [...builtins, ...userServices()]; }
function approvedHosts() { return [...BUILTIN_HOSTS, ...store.read('hosts', [])]; }

async function approveHost(host, why) {
  const h = normalHost(host);
  if (!/^[a-z0-9.-]+$/.test(h)) return false;
  const { response } = await dialog.showMessageBox(win, {
    type: 'question', buttons: ['Allow', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true,
    title: 'Allow a new address', message: `Allow OT Studio to reach ${h}?`,
    detail: `${why}\n\nOT Studio only reaches addresses you allow. You can remove this one later in Settings.`,
  });
  if (response !== 0) return false;
  const list = store.read('hosts', []);
  if (!list.includes(h)) store.write('hosts', [...list, h]);
  return true;
}

function saveDir(kind) {
  const chosen = settings().saveDirs[kind];
  return chosen || path.join(app.getPath(kind === 'video' ? 'videos' : 'pictures'), 'OT Studio');
}

function keySlots() {
  const slots = new Set([...BUILTIN_SLOTS, ...userServices().map((d) => d.keySlot), ...keys.slots()]);
  return Object.fromEntries([...slots].map((s) => [s, keys.has(s)]));
}

function publicState() {
  return {
    version: app.getVersion(), settings: settings(), services: services(), keys: keySlots(), history: jobs.list(),
    hosts: store.read('hosts', []), replicateModels: replicate.MODELS, editModels: [...replicate.EDIT_MODELS], saveDirs: { image: saveDir('image'), video: saveDir('video') },
  };
}

/** Wraps a handler: only the app's own window may call it, and errors come back as plain messages. */
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!win || event.sender !== win.webContents || !String(event.senderFrame?.url || '').startsWith('otapp://ui/')) return { ok: false, error: 'Not allowed.' };
    try { return { ok: true, value: await fn(...args) }; }
    catch (e) { return { ok: false, error: e && e.message ? e.message : 'Something went wrong.' }; }
  });
}

function registerHandlers() {
  handle('state', () => publicState());
  handle('key:set', (slot, value) => { keys.set(String(slot), value); return keySlots(); });
  handle('key:clear', (slot) => { if (!(slot in keySlots())) throw new Error('Unknown key.'); keys.clear(slot); return keySlots(); });
  handle('settings:set', (patch) => {
    const s = settings();
    const out = {};
    if (typeof patch.simpleView === 'boolean') out.simpleView = patch.simpleView;
    if (typeof patch.editModel === 'string' && replicate.EDIT_MODELS.has(patch.editModel)) out.editModel = patch.editModel;
    if (patch.last && typeof patch.last === 'object') {
      out.last = { ...s.last };
      for (const kind of ['image', 'video']) if (patch.last[kind]) out.last[kind] = { service: String(patch.last[kind].service || '').slice(0, 64), model: String(patch.last[kind].model || '').slice(0, 200) };
    }
    setSettings(out);
    return settings();
  });
  handle('models', (id, refresh) => jobs.models(id, !!refresh));
  handle('replicate:add', async (kind, model) => {
    const k = kind === 'video' ? 'video' : 'image';
    const m = String(model || '').trim().replace(/^https:\/\/replicate\.com\//, '');
    await jobs.form('replicate', m, k, true);
    const s = settings();
    const list = s.replicateModels[k] || [];
    if (!list.includes(m) && !replicate.MODELS[k].some(([id]) => id === m)) s.replicateModels[k] = [...list, m];
    setSettings({ replicateModels: s.replicateModels });
    return m;
  });
  handle('replicate:forget', (kind, model) => {
    const s = settings();
    const k = kind === 'video' ? 'video' : 'image';
    s.replicateModels[k] = (s.replicateModels[k] || []).filter((m) => m !== model);
    setSettings({ replicateModels: s.replicateModels });
  });
  handle('form', (id, model, kind, refresh) => jobs.form(id, String(model || ''), kind === 'video' ? 'video' : 'image', !!refresh));
  handle('pictures:pick', async (multi) => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose pictures', properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    });
    if (r.canceled) return [];
    return r.filePaths.slice(0, 16).map((p) => jobs.addPicture(p));
  });
  handle('generate', (req) => jobs.generate(req));
  handle('expand', (req) => jobs.expand(req || {}));
  handle('upscale', (req) => jobs.upscale(req || {}));
  handle('media:size', (name) => jobs.size(String(name)));
  handle('video:lastFrame', (id) => jobs.lastFrame(String(id)));
  handle('cancel', (id) => jobs.cancel(id));
  handle('remove', (ids) => jobs.remove(Array.isArray(ids) ? ids.map(String) : []));
  handle('download:retry', (id) => jobs.retryDownload(String(id)));
  handle('save', (id) => {
    const entry = jobs.list().find((e) => e.id === id);
    if (!entry || !entry.files.length) throw new Error('There is nothing to save.');
    const dir = saveDir(entry.kind);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date(entry.created).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    const saved = entry.files.map((name, i) => {
      const ext = name.split('.').pop();
      let target = path.join(dir, `OTStudio-${stamp}${entry.files.length > 1 ? `-${i + 1}` : ''}.${ext}`);
      for (let n = 2; fs.existsSync(target); n++) target = path.join(dir, `OTStudio-${stamp}-${i + 1}-${n}.${ext}`);
      fs.copyFileSync(jobs.mediaPath(name), target);
      return target;
    });
    return { dir, files: saved };
  });
  handle('folder:open', async (kind) => {
    const dir = saveDir(kind === 'video' ? 'video' : 'image');
    fs.mkdirSync(dir, { recursive: true });
    const error = await shell.openPath(dir);
    if (error) throw new Error(error);
  });
  handle('folder:change', async (kind) => {
    const k = kind === 'video' ? 'video' : 'image';
    const r = await dialog.showOpenDialog(win, { title: 'Choose where to save', defaultPath: saveDir(k), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return saveDir(k);
    setSettings({ saveDirs: { ...settings().saveDirs, [k]: r.filePaths[0] } });
    return saveDir(k);
  });
  handle('snippet:parse', (text, kind) => service.draftFromSnippet(parseSnippet(String(text || '').slice(0, 100000)), kind === 'video' ? 'video' : 'image'));
  handle('service:rebuild', (draft) => service.applyRoles(draft));
  handle('service:test', (draft, input) => jobs.test(draft, input || {}));
  handle('service:save', async (draft) => {
    const d = service.validate(draft);
    if (builtins.some((b) => b.id === d.id || b.keySlot === d.keySlot) || d.keySlot === 'replicate') throw new Error('That id or key name belongs to a built-in service. Choose another.');
    await requireHost(d);
    const list = store.read('services', []).filter((s) => s.id !== d.id);
    store.write('services', [...list, d]);
    return services();
  });
  handle('service:remove', (id) => {
    store.write('services', store.read('services', []).filter((s) => s.id !== id));
    return services();
  });
  handle('service:export', async (id) => {
    const d = userServices().find((s) => s.id === id) || builtins.find((s) => s.id === id);
    if (!d) throw new Error('That service is gone.');
    const r = await dialog.showSaveDialog(win, { title: 'Export the service', defaultPath: `${d.id}.otservice.json`, filters: [{ name: 'OT Studio service', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    const copy = { ...d };
    delete copy.builtin;
    fs.writeFileSync(r.filePath, JSON.stringify({ otstudioService: 1, note: 'No key is included. Each person adds their own key in Settings.', definition: copy }, null, 2));
    return r.filePath;
  });
  handle('service:import', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Import a service', properties: ['openFile'], filters: [{ name: 'OT Studio service', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    if (fs.statSync(r.filePaths[0]).size > 256 * 1024) throw new Error('That file is too large to be a service.');
    let doc;
    try { doc = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); } catch { throw new Error('That file is not readable JSON.'); }
    const d = service.validate(doc && doc.otstudioService === 1 ? doc.definition : doc);
    delete d.builtin;
    if (builtins.some((b) => b.id === d.id || b.keySlot === d.keySlot) || d.keySlot === 'replicate') throw new Error('That service uses a built-in id or key name.');
    await requireHost(d);
    store.write('services', [...store.read('services', []).filter((s) => s.id !== d.id), d]);
    return services();
  });
  handle('hosts:remove', (host) => { store.write('hosts', store.read('hosts', []).filter((h) => h !== host)); return store.read('hosts', []); });
  handle('link:open', (which) => { if (which === 'repo') shell.openExternal(REPO); });
}

async function requireHost(d) {
  const url = new URL(d.request.url);
  if (approvedHosts().includes(url.hostname)) return;
  const ok = await approveHost(url.hostname, `The service "${d.name}" sends your prompts, the pictures you choose for it, and the key you save for it to this address.`);
  if (!ok) throw new Error(`You did not allow ${url.hostname}, so the service was not saved.`);
}

/** Serves the window's own files from src/renderer. */
function serveApp(request) {
  const url = new URL(request.url);
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.normalize(path.join(RENDERER, rel));
  if (url.host !== 'ui' || !file.startsWith(RENDERER + path.sep) || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
  return new Response(fs.readFileSync(file), { headers: { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
}

/** Serves media files by name, with byte ranges so videos can seek. */
function serveMedia(request) {
  const url = new URL(request.url);
  const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  if (url.host !== 'm' || !NAME_RE.test(name)) return new Response('Not found', { status: 404 });
  let file;
  try { file = jobs.mediaPath(name); } catch { return new Response('Not found', { status: 404 }); }
  if (!fs.existsSync(file)) return new Response('Not found', { status: 404 });
  const size = fs.statSync(file).size;
  const type = typeOf(name);
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (range && size > 0) {
    let start = range[1] === '' ? Math.max(0, size - Number(range[2])) : Number(range[1]);
    let end = range[1] !== '' && range[2] !== '' ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
      status: 206, headers: { 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), { headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 960, minHeight: 640, backgroundColor: '#000000', show: false, title: 'OT Studio',
    icon: fs.existsSync(path.join(__dirname, '..', '..', 'build', 'icon.png')) ? path.join(__dirname, '..', '..', 'build', 'icon.png') : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('otapp://ui/')) e.preventDefault(); });
  win.once('ready-to-show', () => win.show());
  win.loadURL('otapp://ui/index.html');
  win.on('closed', () => { win = null; });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  const data = app.getPath('userData');
  store = createStore(path.join(data, 'data'));
  keys = createKeys(data, safeStorage);
  const net = createNet(approvedHosts);
  jobs = createJobs({ store, keys, net, mediaDir: path.join(data, 'media'), services, approveHost, approvedHosts, notify: (entry) => { if (win) win.webContents.send('job', entry); } });
  jobs.resume();

  // The window never reaches the network itself, and it may not ask for the camera, location, or anything else.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !/^(otapp|otmedia|devtools|data|blob):/.test(details.url) });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  protocol.handle('otapp', serveApp);
  protocol.handle('otmedia', serveMedia);
  Menu.setApplicationMenu(null);
  registerHandlers();
  createWindow();
  setInterval(() => jobs.tick(), 1000);
});

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

app.on('window-all-closed', () => app.quit());

module.exports = { REPLICATE };
