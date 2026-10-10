/**
 * The image fade-in, pinned.
 *
 * Every photograph on the site starts at opacity 0 and is revealed by one
 * capture-phase `load` listener inlined in <head> (src/app/layout.tsx). The
 * failure mode is total and silent: if that listener never hears an image
 * load, the photograph stays invisible behind its blurred placeholder, and
 * nothing errors, nothing logs, nothing fails a build.
 *
 * That is what happened. The listener was attached to `window`, and the DOM
 * spec leaves the window out of the event path for a `load` fired at an
 * element — capture phase included. Only images that happened to be complete
 * by DOMContentLoaded were ever shown; everything lazy, and on a real network
 * the hero too, never appeared. Checked in Chromium and WebKit: a capture
 * listener on window saw 0 image loads, the same listener on document saw 1.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import fs from 'node:fs';

const LAYOUT = fs.readFileSync(
  new URL('../../src/app/layout.tsx', import.meta.url),
  'utf8',
);

/** The inline script, as written in the IMAGE_REVEAL template literal. */
function revealScript() {
  const match = /const IMAGE_REVEAL = `([\s\S]*?)`;/.exec(LAYOUT);
  assert.ok(match, 'IMAGE_REVEAL not found in src/app/layout.tsx');
  return match[1];
}

/** The CSS the script exists to undo. */
const CSS = fs.readFileSync(
  new URL('../../src/app/globals.css', import.meta.url),
  'utf8',
);

describe('image reveal', () => {
  it('listens for image loads on document, where they actually arrive', () => {
    const script = revealScript();
    assert.match(script, /document\.addEventListener\(\s*'load'/);
    assert.match(script, /,\s*true\s*\)/, 'the load listener must use the capture phase');
  });

  it('never relies on a window-level load listener for images', () => {
    const script = revealScript();
    // A bare `addEventListener(` or `window.addEventListener(` is the window.
    const windowLevel = script
      .split('\n')
      .filter((line) => /(^|[^.\w])addEventListener\(\s*'load'|window\.addEventListener\(\s*'load'/.test(line));
    assert.deepEqual(
      windowLevel,
      [],
      'a load listener on window never fires for <img> — see the note in layout.tsx',
    );
  });

  it('still sweeps images that finished before the listener could see them', () => {
    assert.match(revealScript(), /DOMContentLoaded[\s\S]*\.complete/);
  });

  it('is gated, so photographs are visible if the script never runs', () => {
    assert.match(revealScript(), /classList\.add\('js-media'\)/);
    assert.match(CSS, /\.js-media \.media-img\s*\{[^}]*opacity:\s*0/);
    assert.ok(
      !/(^|\n)\s*\.media-img\s*\{[^}]*opacity:\s*0/.test(CSS),
      'media-img must not be hidden without the js-media gate',
    );
  });
});
