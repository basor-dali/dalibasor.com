/**
 * Notes written from the command line.
 *
 * `npm run note` writes whatever was typed into an MDX file, so a stray `<`
 * must not stop the site building, and the words must come back as typed.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import matter from 'gray-matter';

import { escapeMdx, noteBaseName, noteFile } from '../lib/notes.mjs';

describe('a note written from the command line', () => {
  it('is named for its day and first few words', () => {
    assert.equal(
      noteBaseName('2026-01-03', 'First snow. The car is a white loaf.'),
      '2026-01-03-first-snow-the-car-is',
    );
    assert.equal(
      noteBaseName('2026-01-03', 'Čevapi u Beogradu'),
      '2026-01-03-cevapi-u-beogradu',
    );
    assert.equal(noteBaseName('2026-01-03', '', { photo: true }), '2026-01-03-photo');
    assert.equal(noteBaseName('2026-01-03', '!!!'), '2026-01-03-note');
  });

  it('keeps what was typed, and cannot break the build with it', () => {
    const text = 'I <3 this. {sic} <b>bold</b>';
    const file = noteFile({
      date: '2026-01-03',
      time: '09:05',
      location: 'Wichita, Kansas',
      text,
    });
    const parsed = matter(file);
    assert.equal(
      parsed.data.date,
      '2026-01-03 09:05',
      'the time was lost or the date became a Date',
    );
    assert.equal(parsed.data.location, 'Wichita, Kansas');
    assert.ok(
      !/(^|[^\\])[<{]/.test(parsed.content),
      'an unescaped < or { reached the MDX',
    );
    assert.equal(
      parsed.content.trim().replace(/\\(.)/g, '$1'),
      text,
      'the words changed',
    );
    assert.equal(escapeMdx('a < b'), 'a \\< b');
  });

  it('writes no field it was not given', () => {
    const parsed = matter(noteFile({ date: '2026-01-03', text: 'Hello.' }));
    assert.deepEqual(Object.keys(parsed.data), ['date']);
  });
});
