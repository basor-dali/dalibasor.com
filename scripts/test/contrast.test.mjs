/**
 * Colour contrast, pinned.
 *
 * One maintainer over twenty years will not re-derive these ratios by eye, and
 * the failure mode is silent: nothing breaks, the site just becomes gradually
 * unreadable to anyone whose eyes are worse than the author's were at 33.
 *
 * The specific regression these guard against actually happened: `--color-mute`
 * (3.58:1) was the default colour of the shared Label primitive, so it was the
 * colour of nearly every date, tag, count and form label on the site — all of
 * it 11px, all of it below the 4.5:1 floor.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import fs from 'node:fs';

const CSS = fs.readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');

/** Pull a colour token out of the @theme block, so the test reads real values. */
function token(name) {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(CSS);
  assert.ok(match, `--color-${name} not found in globals.css`);
  return match[1];
}

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every surface a visitor can read text on. */
const SURFACES = ['ground', 'surface', 'surface-2', 'surface-3'];

/** WCAG 2.1 AA: 4.5:1 for text under 18.66px, 3:1 for large text. */
const AA_SMALL = 4.5;
const AA_LARGE = 3;

describe('colour contrast', () => {
  it('every token used for small text clears 4.5:1 on every surface', () => {
    // u-label is 11px and .prose body is 17px — all of it "small" by WCAG.
    for (const ink of ['white', 'ivory', 'soft', 'muted', 'ember']) {
      for (const surface of SURFACES) {
        const ratio = contrast(token(ink), token(surface));
        assert.ok(
          ratio >= AA_SMALL,
          `text-${ink} on ${surface} is ${ratio.toFixed(2)}:1, below ${AA_SMALL}:1`,
        );
      }
    }
  });

  it('mute clears the large-text floor, which is the only thing it is for', () => {
    for (const surface of SURFACES) {
      const ratio = contrast(token('mute'), token(surface));
      assert.ok(
        ratio >= AA_LARGE,
        `text-mute on ${surface} is ${ratio.toFixed(2)}:1, below ${AA_LARGE}:1`,
      );
    }
  });

  it('mute is still documented as unsafe for small text', () => {
    // If someone raises the token to pass AA everywhere, this comment — and
    // this test — should be revisited deliberately rather than drift.
    assert.match(CSS, /NEVER put it on text below 24px/);
  });

  it('the Label primitive does not default to an inaccessible colour', () => {
    const label = fs.readFileSync(
      new URL('../../src/components/primitives/index.tsx', import.meta.url),
      'utf8',
    );
    // Label is the colour of nearly all metadata on the site.
    assert.match(label, /cx\('u-label', !colored && 'text-muted'/);
    assert.ok(
      !/cx\('u-label text-mute'/.test(label),
      'Label is hardcoding text-mute again — that is 3.58:1 at 11px',
    );
  });

  it('no component puts mute on small text', () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx$/.test(entry.name)) {
          fs.readFileSync(full, 'utf8')
            .split('\n')
            .forEach((line, i) => {
              if (!/\btext-mute\b/.test(line)) return;
              // Legitimate: colossal/3xl+ numerals, and a placeholder on a 2xl input.
              if (/text-(colossal|5xl|4xl|3xl|2xl)|placeholder:text-mute/.test(line)) return;
              offenders.push(`${full}:${i + 1}`);
            });
        }
      }
    };
    walk(new URL('../../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    assert.deepEqual(offenders, [], `text-mute on small text at:\n  ${offenders.join('\n  ')}`);
  });
});
