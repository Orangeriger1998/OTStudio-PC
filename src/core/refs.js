'use strict';
// Picture labels in a description. The user writes @img1, @img2 (or @image1, @pic1, @1, /frame1); pictures are numbered
// in the order they are sent. The models that take several pictures are trained on "image 1", "image 2", so that is
// what the model receives. The job keeps the user's own wording, so the labels mean the same thing later.

const TOKEN = /(^|[^\w@/])(?:@(?:img|image|pic|picture|photo|frame)?\s?(\d{1,2})|\/frame\s?(\d{1,2}))(?![\w])/gi;

/** The picture numbers a description refers to, in order of first mention. */
function references(prompt) {
  const out = [];
  for (const m of String(prompt || '').matchAll(TOKEN)) {
    const n = Number(m[2] || m[3]);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * The description as the model should read it: "@img1" becomes "image 1". [count] is the number of pictures sent.
 * Returns { text, missing }, where missing lists the numbers that have no picture.
 */
function rewrite(prompt, count) {
  const text = String(prompt || '');
  const used = references(text);
  const missing = used.filter((n) => n < 1 || n > count);
  return { text: used.length ? text.replace(TOKEN, (all, before, a, b) => `${before}image ${Number(a || b)}`) : text, missing, used };
}

module.exports = { references, rewrite, TOKEN };
