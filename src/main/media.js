'use strict';
// Media files: recognizing real pictures and videos by their first bytes, and naming files in the media folder.

const TYPES = [
  { ext: 'png', type: 'image/png', test: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 },
  { ext: 'jpg', type: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', type: 'image/webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { ext: 'gif', type: 'image/gif', test: (b) => b.length > 6 && b.toString('ascii', 0, 4) === 'GIF8' },
  { ext: 'mp4', type: 'video/mp4', test: (b) => b.length > 12 && b.toString('ascii', 4, 8) === 'ftyp' && !/^qt/.test(b.toString('ascii', 8, 10)) },
  { ext: 'mov', type: 'video/quicktime', test: (b) => b.length > 12 && b.toString('ascii', 4, 8) === 'ftyp' },
  { ext: 'webm', type: 'video/webm', test: (b) => b.length > 4 && b.readUInt32BE(0) === 0x1a45dfa3 },
];

/** { ext, type, kind } for the bytes, or null when they are not a picture or video OT Studio can show. */
function sniff(buf) {
  const t = TYPES.find((x) => x.test(buf));
  return t ? { ext: t.ext, type: t.type, kind: t.type.startsWith('video/') ? 'video' : 'image' } : null;
}

const NAME_RE = /^[\w-]{1,80}\.(png|jpg|webp|gif|mp4|mov|webm)$/;

function typeOf(name) {
  const ext = name.split('.').pop();
  return (TYPES.find((t) => t.ext === ext) || {}).type || 'application/octet-stream';
}

module.exports = { sniff, NAME_RE, typeOf };
