'use strict';
// Video work on this PC, with the bundled ffmpeg: reading a clip's details, taking its last frame, and joining parts.
// ffmpeg runs with an argument list (never through a shell), and only on files in the media folder.

const { execFile } = require('child_process');
const fs = require('fs');

function ffmpegPath() {
  const p = require('ffmpeg-static');
  // In the installed app, the program sits next to the archive instead of inside it.
  const unpacked = p.replace(`app.asar${require('path').sep}`, `app.asar.unpacked${require('path').sep}`);
  return fs.existsSync(unpacked) ? unpacked : p;
}

function run(args, timeout = 600000) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath(), ['-hide_banner', '-nostdin', ...args], { timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && error.killed) reject(new Error('Video processing took too long.'));
      else resolve({ code: error ? error.code : 0, stderr: String(stderr) });
    });
  });
}

/** { duration, width, height, fps, hasAudio } for a clip. */
async function probe(file) {
  const { stderr } = await run(['-i', file]);
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const v = /Stream #\S+.*Video:.*?(\d{2,5})x(\d{2,5})/.exec(stderr);
  const fps = /(\d+(?:\.\d+)?) fps/.exec(stderr);
  if (!d || !v) throw new Error('The video could not be read.');
  return {
    duration: Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]),
    width: Number(v[1]), height: Number(v[2]),
    fps: fps ? Math.min(60, Math.max(8, Number(fps[1]))) : 24,
    hasAudio: /Stream #\S+.*Audio:/.test(stderr),
  };
}

/** Saves the clip's last frame as a PNG. */
async function lastFrame(file, out) {
  await run(['-y', '-sseof', '-0.5', '-i', file, '-update', '1', '-frames:v', '1000', out]);
  if (!fs.existsSync(out) || fs.statSync(out).size === 0) {
    await run(['-y', '-i', file, '-update', '1', out]);
  }
  if (!fs.existsSync(out) || fs.statSync(out).size === 0) throw new Error('The last frame could not be taken from the video.');
}

/**
 * Joins clips end to end into one MP4. Every part is re-encoded to the first part's size and frame rate, because
 * clips from a provider carry their own encoder settings and cannot simply be copied together. If any part has sound,
 * silent parts get silence so the sound stays in step.
 */
async function join(files, out) {
  if (files.length < 2) throw new Error('Joining needs at least two videos.');
  const info = [];
  for (const f of files) info.push(await probe(f));
  const W = info[0].width + (info[0].width % 2);
  const H = info[0].height + (info[0].height % 2);
  const F = info[0].fps;
  const audio = info.some((i) => i.hasAudio);
  const args = ['-y'];
  files.forEach((f) => args.push('-i', f));
  const silent = [];
  if (audio) info.forEach((i, n) => { if (!i.hasAudio) { silent[n] = files.length + silent.filter((x) => x !== undefined).length; args.push('-f', 'lavfi', '-t', String(i.duration.toFixed(3)), '-i', 'anullsrc=r=48000:cl=stereo'); } });
  const parts = [];
  const chains = files.map((_, n) => {
    let c = `[${n}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${F},format=yuv420p[v${n}]`;
    parts.push(`[v${n}]`);
    if (audio) {
      const a = silent[n] !== undefined ? `${silent[n]}:a` : `${n}:a`;
      c += `;[${a}]aresample=48000,aformat=channel_layouts=stereo[a${n}]`;
      parts.push(`[a${n}]`);
    }
    return c;
  });
  const filter = `${chains.join(';')};${parts.join('')}concat=n=${files.length}:v=1:a=${audio ? 1 : 0}[v]${audio ? '[a]' : ''}`;
  args.push('-filter_complex', filter, '-map', '[v]');
  if (audio) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k');
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-movflags', '+faststart', out);
  const r = await run(args, 1800000);
  if (r.code !== 0 || !fs.existsSync(out) || fs.statSync(out).size === 0) throw new Error(`The videos could not be joined. ${r.stderr.split('\n').filter(Boolean).slice(-1)[0] || ''}`.trim());
}

module.exports = { probe, lastFrame, join, ffmpegPath };
