/**
 * Reading the two pieces of EXIF this archive actually wants.
 *
 * A photograph's metadata block holds far more than a date. It holds where it
 * was taken to within a few metres, which body and lens took it, the camera's
 * serial number, and sometimes the owner's name. This module asks exifr for
 * exactly two things and never looks at the rest:
 *
 *   - the capture date, so a folder of 400 photos lands on the timeline in the
 *     order it actually happened rather than the order the files copied
 *   - the orientation, so a portrait shot from a phone is uploaded upright
 *     instead of on its side once the EXIF block is stripped
 *
 * GPS is not requested. Not read, not logged, not returned, not stored. The
 * `location` field in a manifest is something Dali types himself, and that is
 * the entire mechanism by which a place ever appears on this site.
 *
 * Nothing here writes to disk. Buffers in, plain values out.
 */

import exifr from 'exifr';

/**
 * The narrowest possible read. `pick` limits the result to these tags, and the
 * block flags below make sure GPS, IPTC, XMP and ICC are never even parsed —
 * belt and braces, because a future edit to `pick` should not be able to
 * quietly start reading coordinates.
 */
const SAFE_OPTIONS = {
  tiff: true,
  ifd0: true,
  exif: true,
  gps: false,
  xmp: false,
  iptc: false,
  icc: false,
  jfif: false,
  ihdr: false,
  interop: false,
  thumbnail: false,
  translateKeys: true,
  // Raw values: translation turns Orientation 6 into the string "Rotate 90 CW",
  // and the stripper needs the number to decide whether a JPEG is upright.
  translateValues: false,
  reviveValues: true,
  sanitize: true,
  mergeOutput: true,
  pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'Orientation'],
};

/* ==========================================================================
   Dates
   ========================================================================== */

const PAD = (n) => String(n).padStart(2, '0');

/**
 * `2020-08-14T18:22:00` — local wall-clock time, no timezone suffix.
 *
 * EXIF records what the camera's clock said, with no zone attached. A photo
 * taken at 18:22 in Belgrade should read 18:22 forever, including when the
 * site is built in Kansas, so the wall clock is written down as-is rather than
 * converted to UTC. The site's `parseDate` reads this form correctly.
 */
export function formatLocalIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return undefined;
  return (
    `${date.getFullYear()}-${PAD(date.getMonth() + 1)}-${PAD(date.getDate())}` +
    `T${PAD(date.getHours())}:${PAD(date.getMinutes())}:${PAD(date.getSeconds())}`
  );
}

/** EXIF hands back either a Date or a raw `2020:08:14 18:22:00` string. */
function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;

  const match = value
    .trim()
    .match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;

  const [, y, mo, d, h, mi, s] = match;
  const date = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? 0),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Cameras with a dead clock battery stamp 1970, 1980 or 2000-01-01 on
 * everything. A date outside this window is a broken clock, not a memory.
 */
function isPlausible(date) {
  const year = date.getFullYear();
  return year >= 1900 && year <= new Date().getFullYear() + 1;
}

/* ==========================================================================
   The read
   ========================================================================== */

/**
 * Safe EXIF for one image buffer.
 *
 * Never throws: a file with no metadata, a truncated header or a format exifr
 * does not know all return the same empty-ish shape, and the importer carries
 * on. Missing metadata is normal — a screenshot, a WhatsApp export and a scan
 * all arrive with nothing.
 *
 * @returns {Promise<{capturedAt?: string, orientation?: number}>}
 */
export async function readSafeExif(buffer) {
  let tags = null;
  try {
    tags = await exifr.parse(buffer, SAFE_OPTIONS);
  } catch {
    return {};
  }
  if (!tags) return {};

  const date =
    toDate(tags.DateTimeOriginal) ?? toDate(tags.CreateDate) ?? toDate(tags.ModifyDate);

  const orientation =
    Number.isInteger(tags.Orientation) && tags.Orientation >= 1 && tags.Orientation <= 8
      ? tags.Orientation
      : undefined;

  return {
    capturedAt: date && isPlausible(date) ? formatLocalIso(date) : undefined,
    orientation,
  };
}

/**
 * When a file has no capture date of its own, fall back to its modification
 * time — and say so. A copied file's mtime is often the day it was copied, not
 * the day it was taken, so an inferred date is a hint for Dali to correct
 * rather than a fact. The importer marks it with a comment in the manifest.
 *
 * @returns {{capturedAt?: string, inferred: boolean}}
 */
export function captureDateFromFile(stats) {
  const candidates = [stats?.mtime, stats?.birthtime].filter(
    (value) => value instanceof Date && !Number.isNaN(value.getTime()),
  );
  if (candidates.length === 0) return { inferred: false };

  // The earlier of the two: a copy updates mtime, and birthtime on Windows is
  // the date the copy was created, so the smaller number is closer to the truth.
  const chosen = candidates.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
  if (!isPlausible(chosen)) return { inferred: false };

  return { capturedAt: formatLocalIso(chosen), inferred: true };
}

/**
 * The importer's one call: EXIF first, file date second, nothing third.
 *
 * @returns {Promise<{capturedAt?: string, orientation?: number, inferred: boolean}>}
 */
export async function readCaptureInfo(buffer, stats, { readExif = true } = {}) {
  const exif = readExif ? await readSafeExif(buffer) : {};
  if (exif.capturedAt) {
    return {
      capturedAt: exif.capturedAt,
      orientation: exif.orientation,
      inferred: false,
    };
  }
  const fallback = captureDateFromFile(stats);
  return {
    capturedAt: fallback.capturedAt,
    orientation: exif.orientation,
    inferred: Boolean(fallback.capturedAt),
  };
}
