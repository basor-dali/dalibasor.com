#!/usr/bin/env node
/**
 * media:check — validate every year manifest in content/media.
 *
 * This is the tool to reach for when a photo page looks wrong. It checks the
 * things that break silently rather than loudly: an item pointing at an album
 * that does not exist, two items sharing an id, a missing width so the layout
 * shifts, a cover that refers to nothing.
 *
 * Exits non-zero if there are errors, zero if there are only warnings, so it
 * can sit in a pre-push hook or CI without being annoying about it.
 *
 * Usage:
 *   npm run media:check
 *   npm run media:check -- --year 2019
 *   npm run media:check -- --strict     # treat warnings as errors too
 */

import path from 'node:path';
import {
  displayPath,
  findManifestPath,
  listManifestFiles,
  readManifestFile,
  slugify,
} from './lib/manifest.mjs';
import {
  blank,
  bullet,
  detail,
  error as logError,
  fail,
  heading,
  info,
  pluralize,
  success,
  usage,
  warn as logWarn,
} from './lib/log.mjs';

const IMAGE_EXTENSIONS_HINT = 'image | video';
const MAX_SANE_DIMENSION = 30000;
const MIN_SANE_DIMENSION = 16;

/* ==========================================================================
   Arguments
   ========================================================================== */

function parseArgs(argv) {
  const options = { year: undefined, strict: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--year') {
      options.year = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--year=')) {
      options.year = arg.slice('--year='.length);
    } else if (arg.startsWith('-')) {
      fail(`Unknown option: ${arg}\nRun with --help to see usage.`);
    }
  }

  if (options.year !== undefined && !/^\d{4}$/.test(String(options.year))) {
    fail(`--year must be a four digit year, got "${options.year}".`);
  }

  return options;
}

function printUsage() {
  usage(`media:check — validate the photo + video manifests

  npm run media:check
  npm run media:check -- --year 2019
  npm run media:check -- --strict

Options:
  --year <YYYY>   Check one year instead of all of them
  --strict        Treat warnings as failures
  --help          This message`);
}

/* ==========================================================================
   Checks
   ========================================================================== */

class Report {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  error(where, message) {
    this.errors.push({ where, message });
  }

  warn(where, message) {
    this.warnings.push({ where, message });
  }
}

function checkManifest(file, report) {
  const label = displayPath(file);
  const basename = path.basename(file);
  const yearFromName = Number.parseInt(basename.slice(0, 4), 10);

  let data;
  try {
    data = readManifestFile(file);
  } catch (err) {
    report.error(label, `not valid YAML — ${err.message}`);
    return { items: 0, albums: 0 };
  }

  if (data === null || data === undefined) {
    report.warn(label, 'file is empty. Nothing will show up for this year.');
    return { items: 0, albums: 0 };
  }

  if (typeof data !== 'object' || Array.isArray(data)) {
    report.error(label, 'top level must be a mapping with `year`, `albums` and `items`.');
    return { items: 0, albums: 0 };
  }

  /* --- year ----------------------------------------------------------- */
  if (data.year === undefined) {
    report.warn(label, `no \`year:\` key. It will be inferred as ${yearFromName}.`);
  } else if (Number(data.year) !== yearFromName) {
    report.error(
      label,
      `\`year: ${data.year}\` does not match the filename (${yearFromName}). ` +
        'The filename wins for routing, so these must agree.',
    );
  }

  /* --- albums --------------------------------------------------------- */
  const albums = Array.isArray(data.albums) ? data.albums : [];
  if (data.albums !== undefined && !Array.isArray(data.albums)) {
    report.error(label, '`albums:` must be a list.');
  }

  const albumSlugs = new Set();
  for (const [index, album] of albums.entries()) {
    const where = `${label} → albums[${index}]`;

    if (!album || typeof album !== 'object') {
      report.error(where, 'album entry must be a mapping.');
      continue;
    }
    if (!album.slug) {
      report.error(where, 'missing `slug`. The slug is the album URL.');
      continue;
    }

    const slug = String(album.slug);
    if (slug !== slugify(slug)) {
      report.error(
        where,
        `slug "${slug}" is not URL-safe. Use "${slugify(slug)}" instead — ` +
          'the site slugifies it anyway, so links will not match.',
      );
    }
    if (albumSlugs.has(slug)) {
      report.error(where, `duplicate album slug "${slug}". Album URLs must be unique.`);
    }
    albumSlugs.add(slug);

    if (!album.title) {
      report.warn(
        where,
        `album "${slug}" has no \`title\`. The slug will be shown instead.`,
      );
    }
    if (
      album.date !== undefined &&
      !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(String(album.date))
    ) {
      report.warn(
        where,
        `\`date: ${album.date}\` is not YYYY, YYYY-MM or YYYY-MM-DD. Album ordering may be odd.`,
      );
    }
  }

  /* --- items ---------------------------------------------------------- */
  const items = Array.isArray(data.items) ? data.items : [];
  if (data.items !== undefined && !Array.isArray(data.items)) {
    report.error(label, '`items:` must be a list.');
  }

  const ids = new Map();
  const publicIds = new Map();
  const hashes = new Map();
  const usedAlbums = new Set();

  for (const [index, item] of items.entries()) {
    const name = item?.id || item?.publicId || `items[${index}]`;
    const where = `${label} → ${name}`;

    if (!item || typeof item !== 'object') {
      report.error(where, 'item entry must be a mapping.');
      continue;
    }

    /* required */
    if (!item.publicId) {
      report.error(where, 'missing `publicId`. Nothing can be rendered without it.');
    }
    if (!item.id) {
      report.warn(
        where,
        'missing `id`. One will be generated, but it may change between builds.',
      );
    }

    /* ids unique */
    if (item.id) {
      const seen = ids.get(item.id);
      if (seen !== undefined) {
        report.error(
          where,
          `duplicate id "${item.id}" (also at items[${seen}]). ` +
            'Ids address photos in the lightbox — they must be unique.',
        );
      }
      ids.set(item.id, index);
    }

    if (item.publicId) {
      const seen = publicIds.get(item.publicId);
      if (seen !== undefined) {
        report.warn(
          where,
          `publicId "${item.publicId}" also appears at items[${seen}]. ` +
            'The same photograph will render twice.',
        );
      }
      publicIds.set(item.publicId, index);
    }

    if (item.hash) {
      const seen = hashes.get(item.hash);
      if (seen !== undefined) {
        report.warn(
          where,
          `identical content hash to items[${seen}] — the same file was imported twice.`,
        );
      }
      hashes.set(item.hash, index);
    }

    /* type */
    if (item.type !== 'image' && item.type !== 'video') {
      report.error(
        where,
        `\`type\` must be ${IMAGE_EXTENSIONS_HINT}, got "${item.type}".`,
      );
    }

    /* dimensions — these drive the aspect-ratio boxes that prevent layout shift */
    for (const key of ['width', 'height']) {
      const value = Number(item[key]);
      if (!item[key]) {
        report.error(
          where,
          `missing \`${key}\`. Without it the page reserves the wrong space and the ` +
            'layout jumps as photographs load.',
        );
      } else if (
        !Number.isFinite(value) ||
        value < MIN_SANE_DIMENSION ||
        value > MAX_SANE_DIMENSION
      ) {
        report.error(
          where,
          `\`${key}: ${item[key]}\` is not a plausible pixel dimension.`,
        );
      }
    }

    /* album reference */
    if (item.album) {
      const slug = String(item.album);
      usedAlbums.add(slug);
      if (!albumSlugs.has(slug)) {
        report.error(
          where,
          `references album "${slug}", which is not declared in \`albums:\`. ` +
            "It will fall back into the year's everyday photographs.",
        );
      }
    }

    /* year agreement */
    if (item.year !== undefined && Number(item.year) !== yearFromName) {
      report.warn(
        where,
        `\`year: ${item.year}\` disagrees with the file it lives in (${yearFromName}). ` +
          'The file wins.',
      );
    }

    /* placeholders and alt text */
    if (item.type === 'image' && !item.lqip) {
      report.warn(
        where,
        'no `lqip`. The frame will be flat colour until the photograph loads. ' +
          'Re-import to generate one.',
      );
    }
    if (!item.alt && !item.caption) {
      report.warn(where, 'no `alt` or `caption`. A generic description will be used.');
    }

    /* dates */
    if (item.capturedAt && Number.isNaN(new Date(item.capturedAt).getTime())) {
      report.error(where, `\`capturedAt: ${item.capturedAt}\` is not a valid date.`);
    }

    /* video specifics */
    if (item.type === 'video') {
      if (item.duration !== undefined && !Number.isFinite(Number(item.duration))) {
        report.warn(where, `\`duration: ${item.duration}\` is not a number of seconds.`);
      }
    }

    /* privacy — the one thing that must never be in here */
    for (const key of [
      'gps',
      'latitude',
      'longitude',
      'gpsLatitude',
      'gpsLongitude',
      'coordinates',
    ]) {
      if (item[key] !== undefined) {
        report.error(
          where,
          `contains \`${key}\`. Coordinates are never published by this site — ` +
            'remove it and use the broad `location:` field instead.',
        );
      }
    }
  }

  /* --- covers --------------------------------------------------------- */
  const knownRefs = new Set([...ids.keys(), ...publicIds.keys()]);

  if (data.cover && !knownRefs.has(data.cover)) {
    report.warn(
      label,
      `\`cover: ${data.cover}\` matches no item id or publicId in this year. ` +
        'The first photograph will be used instead.',
    );
  }

  for (const album of albums) {
    if (album?.cover && !knownRefs.has(album.cover)) {
      report.warn(
        `${label} → ${album.slug}`,
        `\`cover: ${album.cover}\` matches no item in this year.`,
      );
    }
  }

  /* --- empty albums --------------------------------------------------- */
  for (const slug of albumSlugs) {
    if (!usedAlbums.has(slug)) {
      report.warn(
        `${label} → ${slug}`,
        'album has no photographs. It will render as an empty album page.',
      );
    }
  }

  return { items: items.length, albums: albums.length };
}

/* ==========================================================================
   Main
   ========================================================================== */

function main() {
  const options = parseArgs(process.argv.slice(2));

  let files;
  if (options.year) {
    const found = findManifestPath(options.year);
    if (!found) {
      fail(
        `No manifest for ${options.year}.\n` +
          `Create one with: npm run new:year -- ${options.year}`,
      );
    }
    files = [found];
  } else {
    files = listManifestFiles();
  }

  if (files.length === 0) {
    info('No manifests in content/media yet.');
    detail('Create the first one with: npm run new:year -- 2026');
    return;
  }

  heading(`Checking ${pluralize(files.length, 'manifest')}`);
  blank();

  const report = new Report();
  let totalItems = 0;
  let totalAlbums = 0;

  for (const file of files) {
    const counts = checkManifest(file, report);
    totalItems += counts.items;
    totalAlbums += counts.albums;
    detail(
      `${path.basename(file).padEnd(12)} ${String(counts.items).padStart(5)} items  ` +
        `${String(counts.albums).padStart(3)} albums`,
    );
  }

  blank();

  if (report.warnings.length > 0) {
    logWarn(`${pluralize(report.warnings.length, 'warning')}`);
    for (const entry of report.warnings) {
      bullet(`${entry.where}\n    ${entry.message}`);
    }
    blank();
  }

  if (report.errors.length > 0) {
    logError(`${pluralize(report.errors.length, 'error')}`);
    for (const entry of report.errors) {
      bullet(`${entry.where}\n    ${entry.message}`);
    }
    blank();
    fail(
      `${pluralize(report.errors.length, 'error')} found. ` +
        'Fix these before building — some of them break pages.',
    );
  }

  if (options.strict && report.warnings.length > 0) {
    fail(
      `${pluralize(report.warnings.length, 'warning')} found and --strict was passed.`,
    );
  }

  success(
    `All good — ${pluralize(totalItems, 'item')} across ` +
      `${pluralize(totalAlbums, 'album')} in ${pluralize(files.length, 'year')}.`,
  );
}

main();
