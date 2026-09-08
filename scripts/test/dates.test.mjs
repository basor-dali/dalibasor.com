/**
 * Dates, which are the spine of this archive.
 *
 * Run under more than one timezone — `npm test` does this deliberately. A suite
 * that only ever runs at UTC cannot detect the class of bug these exist to
 * catch, because the bug IS the host timezone leaking into a rendered date.
 *
 * The failure it guards against: EXIF records a wall clock with no offset, so
 * `new Date('2026-06-14T19:31:02')` is read in the host's timezone. Every
 * formatter here reads back with getUTC*, so on a UTC-5 machine a photograph
 * taken at 7:31pm on the 14th rendered as the 15th — and rebuilding the same
 * repo on a UTC runner silently changed it back, with no content change and no
 * test failure.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  formatDate,
  toDateString,
  formatDayMonth,
  formatMonthYear,
  formatShortMonthYear,
  isoDate,
  parseDate,
  yearOf,
} from '../../src/lib/utils.ts';

const TZ = process.env.TZ ?? '(system default)';
const OFFSET = new Date().getTimezoneOffset();

describe(`dates (TZ=${TZ}, offset ${OFFSET}min)`, () => {
  it('reads a naive EXIF timestamp as the wall clock it records', () => {
    // The exact values in content/media/2026.yml that were rendering wrong.
    assert.equal(formatDate('2026-06-14T18:42:11'), 'June 14, 2026');
    assert.equal(formatDate('2026-06-14T19:07:56'), 'June 14, 2026');
    assert.equal(formatDate('2026-06-14T19:31:02'), 'June 14, 2026');
  });

  it('does not shift a late-evening capture across midnight', () => {
    assert.equal(formatDayMonth('2026-06-14T23:59:59'), 'June 14');
    assert.equal(isoDate('2026-06-14T23:59:59'), '2026-06-14');
  });

  it('does not shift an early-morning capture backwards', () => {
    assert.equal(formatDayMonth('2026-06-15T00:00:01'), 'June 15');
    assert.equal(isoDate('2026-06-15T00:00:01'), '2026-06-15');
  });

  it('keeps a month-boundary capture in its own month', () => {
    assert.equal(formatShortMonthYear('2026-06-30T23:30:00'), 'JUN 2026');
    assert.equal(formatShortMonthYear('2026-07-01T00:30:00'), 'JUL 2026');
  });

  it('keeps a year-boundary capture in its own year', () => {
    assert.equal(yearOf('2019-12-31T23:45:00'), 2019);
    assert.equal(yearOf('2020-01-01T00:15:00'), 2020);
    assert.equal(formatDate('2019-12-31T23:45:00'), 'December 31, 2019');
  });

  it('accepts the space-separated form as well as the T form', () => {
    assert.equal(formatDate('2026-06-14 19:31:02'), 'June 14, 2026');
  });

  it('still honours a real offset when one is given', () => {
    // These denote actual instants, so they must NOT be reinterpreted.
    assert.equal(isoDate('2026-06-14T23:00:00Z'), '2026-06-14');
    // 2026-06-15T01:00+03:00 is 22:00Z on the 14th.
    assert.equal(isoDate('2026-06-15T01:00:00+03:00'), '2026-06-14');
  });

  it('handles the short forms the archive uses for years, months and days', () => {
    assert.equal(yearOf('2019'), 2019);
    assert.equal(formatMonthYear('2026-09'), 'September 2026');
    assert.equal(formatDate('2026-09-07'), 'September 7, 2026');
    assert.equal(isoDate('2026-09-07'), '2026-09-07');
  });

  it('is stable: parsing a date and re-formatting it never drifts', () => {
    for (const input of [
      '2016-01-01T00:00:00',
      '2019-12-31T23:59:59',
      '2026-06-14T19:31:02',
      '2026-09-07',
      '2026-09',
      '2026',
    ]) {
      const once = isoDate(input);
      assert.equal(isoDate(once), once, `${input} drifted on reparse`);
    }
  });

  it('normalises a YAML Date back to the day that was written', () => {
    // An unquoted `date: 2015-04-11` in frontmatter becomes a Date at UTC
    // midnight. Read back with local getters on a host behind UTC it is the
    // 10th, and String()d it becomes "Fri Apr 10 2015 …" — which then sorts
    // ABOVE every ISO date, because a letter outranks a digit. One unquoted
    // date used to send a backdated essay to the top of the archive.
    assert.equal(toDateString(new Date('2015-04-11T00:00:00Z')), '2015-04-11');
    assert.equal(toDateString(new Date('2026-01-01T00:00:00Z')), '2026-01-01');
    assert.equal(toDateString(new Date('2026-12-31T00:00:00Z')), '2026-12-31');
  });

  it('leaves a string date exactly as written', () => {
    assert.equal(toDateString('2026-09-07'), '2026-09-07');
    assert.equal(toDateString(' 2026-09  '), '2026-09');
    assert.equal(toDateString(undefined), '');
    assert.equal(toDateString(new Date('nonsense')), '');
  });

  it('a normalised date sorts below a newer one, which is the whole point', () => {
    const backdated = toDateString(new Date('2015-04-11T00:00:00Z'));
    const recent = '2026-09-07';
    assert.ok(recent.localeCompare(backdated) > 0, 'backdated entry sorted as newest');
  });

  it('never returns Invalid Date, whatever it is handed', () => {
    for (const input of ['', 'not a date', '2026-13-45', '99', '2026-06-14T99:99:99']) {
      assert.ok(
        !Number.isNaN(parseDate(input).getTime()),
        `${input} produced Invalid Date`,
      );
    }
  });
});
