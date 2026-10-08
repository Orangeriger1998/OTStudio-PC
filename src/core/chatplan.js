'use strict';
// Chat requests become plans. The local model only chooses an action, a shape, a length, and the wording of the prompt,
// in a fixed JSON format that Ollama enforces. The app checks every field, decides which picture or video a plan uses,
// and fills in the service, the model, and the settings itself. A plan is data: nothing runs until the user clicks Go.

const ACTIONS = ['make_picture', 'make_video', 'edit', 'expand', 'upscale', 'make_longer', 'answer'];
const RATIO_LIST = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9', '4:5', '5:4'];
const SHAPES = { wide: '16:9', tall: '9:16', square: '1:1', ...Object.fromEntries(RATIO_LIST.map((r) => [r, r])) };

const SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ACTIONS },
    target: { type: 'string', enum: ['none', 'last_picture', 'last_video', 'attached_photo'] },
    shape: { type: 'string', enum: ['keep', 'wide', 'tall', 'square', ...RATIO_LIST] },
    seconds: { type: 'integer' },
    prompt: { type: 'string' },
    reply: { type: 'string' },
  },
  required: ['action', 'target', 'shape', 'seconds', 'prompt', 'reply'],
  additionalProperties: false,
};

const SYSTEM = `You operate a picture and video app. Read the user's request and choose ONE action:
- make_picture: a new picture from words.
- make_video: a new video (from words, or starting from a picture when the user says so).
- edit: change something in an existing picture (clothes, background, color, remove or add things).
- expand: give an existing picture a new shape (wider, taller, square) by adding area around it.
- upscale: make an existing picture larger or sharper.
- make_longer: continue an existing video.
- answer: the user only asks a question or chats; do nothing.
target says which media the action uses: none, last_picture, last_video, or attached_photo.
shape: the shape the user asks for: wide, tall, square, or an exact ratio such as 4:3; otherwise keep.
seconds: video length if the user says one, otherwise 0.
prompt: a clear description for the model, in English. For edit, describe only the change. For make_video from a picture, describe the motion.
reply: one short sentence to the user.`;

const HELP = `You are the assistant inside OT Studio, a Windows app that makes pictures and videos with the user's own API keys
(Replicate, SpicyAPI, and OpenRouter). In this chat the user asks for pictures and videos in plain words, and the app
shows a plan with a Go button before anything is billed. The app can make pictures, make videos, edit a picture, expand
a picture to a new shape, upscale a picture, and make a video longer. LoRAs teach FLUX dev a face or style; they live on
the LoRAs tab. Answer briefly and plainly in two or three sentences. Never claim to have made or changed anything.`;

const clean = (s, max) => String(s || '').replace(/[\p{Cc}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * An exact ratio the user typed, such as "4:3", "4x3", "4 by 3", or "16/9", as "4:3"; or null. Small models sometimes
 * leave the ratio in the prompt instead of the shape field, so the user's own words decide.
 */
function ratioFromText(text) {
  const m = /(?:^|[^\d.:])(\d{1,2}(?:\.\d)?)\s*(?::|x|\u00d7|\/|\bby\b)\s*(\d{1,2}(?:\.\d)?)(?![\d:])/i.exec(String(text || ''));
  if (!m) return null;
  // A clock time ("at 10:30 pm") is not a shape.
  const after = String(text).slice(m.index + m[0].length, m.index + m[0].length + 8);
  if (/^\s*(am|pm|a\.m|p\.m|o.?clock|h\b|hours)/i.test(after) || /\bat\s*$/i.test(String(text).slice(0, m.index + 1))) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!(a > 0 && b > 0) || a / b > 4 || b / a > 4) return null;
  return `${m[1]}:${m[2]}`;
}

/** The ratio from [list] closest to [ratio] ("a:b" strings), or null. */
function nearestRatio(ratio, list) {
  const v = (r) => { const m = /^(\d+(?:\.\d+)?)[:x*](\d+(?:\.\d+)?)$/i.exec(String(r)); return m ? Number(m[1]) / Number(m[2]) : null; };
  const want = v(ratio);
  if (!want) return null;
  let best = null;
  let gap = Infinity;
  for (const r of list) {
    const x = v(r);
    if (!x) continue;
    const g = Math.abs(Math.log(x / want));
    if (g < gap) { gap = g; best = r; }
  }
  return best;
}

/** The prompt without a ratio the user typed into it ("4:3 aspect ratio."), once the shape setting carries it. */
function withoutRatio(prompt) {
  return prompt.replace(/[,;]?\s*(?:in\s+)?(?:an?\s+)?\d{1,2}(?:\.\d)?\s*(?::|x|\u00d7|\/|by)\s*\d{1,2}(?:\.\d)?\s*(?:aspect\s+ratio|ratio|format|shape)?\.?/gi, '').replace(/\s+([.,])/g, '$1').trim();
}

/** The shape a request names in plain words, or null. */
function shapeFromText(text) {
  const t = String(text).toLowerCase();
  if (/\b(square)\b/.test(t)) return '1:1';
  if (/\b(tall|taller|portrait|vertical|phone screen|story|stories)\b/.test(t)) return '9:16';
  if (/\b(wide|wider|landscape|horizontal|left and right|panorama|widescreen)\b/.test(t)) return '16:9';
  return null;
}

/**
 * The checked plan for one request. [raw] is the model's JSON, [text] the user's words, and [ctx] holds the attached
 * photos and the latest finished picture and video ({ attached: [names], lastPicture, lastVideo } with history entries).
 * Returns { action, source?, sourceKind?, parent?, shape?, seconds?, prompt } or { action: 'answer' } or { error }.
 */
function resolve(raw, text, ctx) {
  const r = raw && typeof raw === 'object' ? raw : {};
  let action = ACTIONS.includes(r.action) ? r.action : 'answer';
  const attached = (ctx.attached || []).filter(Boolean);
  const lastPicture = ctx.lastPicture && ctx.lastPicture.files && ctx.lastPicture.files[0] ? ctx.lastPicture : null;
  const lastVideo = ctx.lastVideo && ctx.lastVideo.files && ctx.lastVideo.files[0] ? ctx.lastVideo : null;
  const words = String(text || '');
  // Small models sometimes start a new video when the user asks to continue one.
  if (action === 'make_video' && lastVideo && !attached.length && /\b(continue|longer|extend|keep going|next part|carry on)\b/i.test(words) && !/\bnew video\b/i.test(words)) action = 'make_longer';
  // A new picture "from the photo I attached" is an edit of that photo.
  if (action === 'make_picture' && attached.length && /\b(photo|picture|image|this|attached|her|him|them)\b/i.test(words)) action = 'edit';
  if (action === 'answer') return { action };

  const prompt = clean(r.prompt, 2000);
  const seconds = Number.isInteger(r.seconds) && r.seconds > 0 && r.seconds <= 60 ? r.seconds : 0;
  const picture = () => (attached.length ? { source: attached[0], sourceKind: 'attached' } : lastPicture ? { source: lastPicture.files[0], sourceKind: 'last' } : null);

  const asked = ratioFromText(words) || SHAPES[r.shape] || null;
  if (action === 'make_picture') {
    if (!prompt) return { error: 'Describe the picture you want.' };
    return { action, prompt: asked ? withoutRatio(prompt) || prompt : prompt, shape: asked };
  }
  if (action === 'edit' || action === 'upscale' || action === 'expand') {
    const pic = picture();
    if (!pic) return { error: 'Attach a photo with the photo button, or make a picture first.' };
    if (action === 'edit') {
      if (!prompt) return { error: 'Describe the change you want.' };
      return { action, ...pic, prompt };
    }
    if (action === 'upscale') return { action, ...pic, prompt: '' };
    const named = ratioFromText(words) || SHAPES[r.shape] || shapeFromText(words);
    if (!named) return { error: 'Which shape should the picture take: wide, tall, square, or a ratio such as 4:3?' };
    // Expand takes the shapes its geometry knows; another ratio becomes the closest one.
    const shape = RATIO_LIST.includes(named) ? named : nearestRatio(named, RATIO_LIST);
    // The model's prompt for expand is often filler; a description is used only when the user wrote one.
    const fill = /\b(with|show|add|more of|fill)\b/i.test(words) ? prompt : '';
    return { action, ...pic, shape, prompt: fill };
  }
  if (action === 'make_video') {
    if (!prompt) return { error: 'Describe what happens in the video.' };
    const fromPicture = attached.length > 0 || r.target === 'last_picture' || r.target === 'attached_photo' || /\b(animate|this (picture|photo|image)|from the (picture|photo|image))\b/i.test(words);
    const pic = fromPicture ? picture() : null;
    return { action, prompt: asked ? withoutRatio(prompt) || prompt : prompt, seconds, shape: asked, ...(pic || {}) };
  }
  if (action === 'make_longer') {
    if (!lastVideo) return { error: 'Make a video first, then ask to make it longer.' };
    // "Make the video longer" alone says nothing new, so the next part keeps the earlier description.
    const rest = words.replace(/\b(please|can you|could you|make|the|this|it|video|clip|longer|continue|extend|keep going|next part|carry on|more|a bit|a little)\b/gi, '').replace(/[^A-Za-z]/g, '');
    return { action, parent: lastVideo.id, prompt: rest.length >= 4 && prompt ? prompt : lastVideo.prompt || prompt || '', seconds };
  }
  return { action: 'answer' };
}

module.exports = { SCHEMA, SYSTEM, HELP, ACTIONS, SHAPES, RATIO_LIST, resolve, shapeFromText, ratioFromText, nearestRatio, withoutRatio };
