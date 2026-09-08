#!/usr/bin/env node
/**
 * media-import — put a folder of photographs into the archive.
 *
 *   npm run media:import -- --year 2020 --album serbia --dir ~/PhotosToUpload/2020/Serbia
 *   npm run media:import -- --year 2020 --dir ./everyday-2020
 *   npm run media:import -- --year 2020 --album serbia --dir ... --dry-run
 *
 * What one run does, per file:
 *
 *   scan -> validate -> read safe EXIF -> STRIP ALL METADATA -> hash -> lqip
 *        -> upload to Cloudinary -> append to content/media/<year>.yml
 *
 * Three things this script promises:
 *
 *   1. YOUR ORIGINALS ARE NEVER MODIFIED, MOVED OR DELETED. Every file in
 *      --dir is opened read-only. All the work happens on buffers in memory.
 *      There is no code path in this pipeline that writes into --dir.
 *   2. GPS coordinates, device serial numbers and filesystem paths never leave
 *      this machine. They are removed before the upload, not hidden after it.
 *      See scripts/lib/strip-metadata.mjs.
 *   3. A re-run is safe. Files already uploaded are recognised by content hash
 *      and skipped, and anything you have written by hand in the manifest —
 *      captions, locations, covers, album notes — is preserved untouched.
 *
 * One file failing does not end the run. Failures are reported per file and
 * counted in the summary, and the exit code is non-zero if any occurred.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  addAlbum,
  addItem,
  displayPath,
  expandPath,
  findAlbumNode,
  formatItemId,
  loadManifestDoc,
  nextItemNumber,
  patchItemNode,
  saveManifestDoc,
  slugify,
  titleCase,
} from './lib/manifest.mjs';
import { processFile, uploadErrorMessage } from './lib/process.mjs';
import { LADDER_FORMATS } from './lib/derivatives.mjs';
import {
  configureR2,
  missingR2Credentials,
  readR2Credentials,
} from './lib/r2.mjs';
import { VIDEO_METADATA_NOTE } from './lib/strip-metadata.mjs';
import {
  configureCloudinary,
  folderFor,
  loadEnv,
  readCredentials,
  runPool,
} from './lib/upload.mjs';
import {
  blank,
  bullet,
  colors,
  detail,
  error,
  formatBytes,
  formatDuration,
  heading,
  info,
  log,
  pad,
  step,
  success,
  usage,
  warn,
} from './lib/log.mjs';

/* ==========================================================================
   Usage
   ========================================================================== */

const USAGE = `
media-import — add photographs and video to the archive

USAGE
  npm run media:import -- --year <YYYY> --dir <folder> [--album <slug>] [options]

EXAMPLES
  npm run media:import -- --year 2020 --album serbia --dir ~/PhotosToUpload/2020/Serbia
  npm run media:import -- --year 2020 --dir "./everyday 2020"
  npm run media:import -- --year 2020 --album serbia --dir ~/Photos/Serbia --dry-run

REQUIRED
  --year <YYYY>          Archive year. Decides which manifest is written.
  --dir <folder>         Folder to read. Scanned one level deep. Never modified.

OPTIONAL
  --album <slug>         Album slug. Leave it out and these become the year's
                         everyday photographs.
  --album-title <text>   Title for a newly created album. Defaults to a
                         title-cased version of the slug.
  --dry-run              Do everything except upload and write the manifest.
  --limit <n>            Only the first n files, in filename order.
  --concurrency <n>      Parallel uploads. Default 4.
  --target <name>        r2 | cloudinary. Defaults to NEXT_PUBLIC_MEDIA_PROVIDER,
                         so the importer and the site never disagree.
  --no-original          Skip uploading the full-resolution copy (R2 only).
                         Saves storage; loses the offsite backup copy.
  --force                Re-upload files whose hash is already in the manifest.
  --help                 Show this.

SUPPORTED FILES
  images  .jpg .jpeg .png .heic .heif .webp .avif .tif .tiff
  video   .mp4 .mov .m4v .webm

CREDENTIALS
  Read from .env.local (or the environment):
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET, CLOUDINARY_FOLDER (default "dalibasor")
`;

/* ==========================================================================
   Arguments
   ========================================================================== */

const FLAGS = new Set(['dry-run', 'force', 'help', 'h', 'no-original']);

const VALUE_FLAGS = new Set([
  'year',
  'album',
  'dir',
  'album-title',
  'limit',
  'concurrency',
  'target',
]);

function parseArgs(argv) {
  const out = { flags: {}, values: {}, unknown: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--') && token !== '-h') {
      out.unknown.push(token);
      continue;
    }

    const bare = token.replace(/^--?/, '');
    const equals = bare.indexOf('=');
    const name = equals === -1 ? bare : bare.slice(0, equals);

    if (FLAGS.has(name)) {
      out.flags[name] = true;
      continue;
    }
    if (VALUE_FLAGS.has(name)) {
      if (equals !== -1) {
        out.values[name] = bare.slice(equals + 1);
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
          out.unknown.push(`${token} (missing a value)`);
        } else {
          out.values[name] = next;
          i += 1;
        }
      }
      continue;
    }

    out.unknown.push(token);
  }

  return out;
}

/* ==========================================================================
   Scanning
   ========================================================================== */

/** Where photographs are stored. Video always goes to Cloudinary for now. */
const TARGETS = ['r2', 'cloudinary'];

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.heic',
  '.heif',
  '.webp',
  '.avif',
  '.tif',
  '.tiff',
]);

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);

/** Filename order, with numbers compared as numbers: IMG_9 before IMG_10. */
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function classify(name) {
  const ext = path.extname(name).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return { ext, kind: 'image' };
  if (VIDEO_EXTENSIONS.has(ext)) return { ext, kind: 'video' };
  return { ext, kind: null };
}

/**
 * List supported files in `root` and in its immediate subdirectories.
 *
 * One level of recursion, on purpose: a folder of a trip usually has a
 * `raw/` or `edited/` beside the photos, and going deeper starts picking up
 * whole Lightroom catalogues nobody meant to upload.
 */
function scanDirectory(root) {
  const found = [];
  const skipped = [];

  const collect = (dir, prefix) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      warn(`Could not read ${dir}: ${err.message}`);
      return;
    }

    for (const entry of entries) {
      // Dotfiles, macOS AppleDouble sidecars and editor cruft.
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

      const full = path.join(dir, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (prefix) continue; // one level only
        collect(full, relative);
        continue;
      }
      if (!entry.isFile()) continue;

      const { ext, kind } = classify(entry.name);
      if (!kind) {
        skipped.push(relative);
        continue;
      }
      found.push({ path: full, relative, name: entry.name, ext, kind });
    }
  };

  collect(root, '');

  found.sort((a, b) => collator.compare(a.relative, b.relative));
  skipped.sort((a, b) => collator.compare(a, b));
  return { found, skipped };
}


/* ==========================================================================
   Main
   ========================================================================== */

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.help || args.flags.h || process.argv.length === 2) {
    usage(USAGE);
    process.exit(process.argv.length === 2 ? 1 : 0);
  }

  if (args.unknown.length > 0) {
    usage(USAGE);
    blank();
    error(`Unrecognised argument: ${args.unknown[0]}`);
    process.exit(1);
  }

  /* --- validate ---------------------------------------------------------- */

  const yearRaw = args.values.year;
  if (!yearRaw) {
    usage(USAGE);
    blank();
    error('--year is required. Which year of the archive do these belong to?');
    process.exit(1);
  }
  const year = Number.parseInt(yearRaw, 10);
  if (!/^\d{4}$/.test(String(yearRaw).trim()) || year < 1900 || year > 2200) {
    error(`--year must be a four-digit year. Got "${yearRaw}".`);
    process.exit(1);
  }

  if (!args.values.dir) {
    usage(USAGE);
    blank();
    error('--dir is required. Which folder should be imported?');
    process.exit(1);
  }
  const dir = expandPath(args.values.dir);
  let dirStat;
  try {
    dirStat = fs.statSync(dir);
  } catch {
    error(`--dir does not exist: ${dir}`);
    process.exit(1);
  }
  if (!dirStat.isDirectory()) {
    error(`--dir is not a folder: ${dir}`);
    process.exit(1);
  }

  const album = args.values.album ? slugify(args.values.album) : '';
  if (args.values.album && !album) {
    error(`--album "${args.values.album}" does not reduce to a usable slug.`);
    process.exit(1);
  }

  const limit = args.values.limit ? Number.parseInt(args.values.limit, 10) : 0;
  if (args.values.limit && (!Number.isFinite(limit) || limit < 1)) {
    error(`--limit must be a positive number. Got "${args.values.limit}".`);
    process.exit(1);
  }

  const concurrency = args.values.concurrency ? Number.parseInt(args.values.concurrency, 10) : 4;
  if (!Number.isFinite(concurrency) || concurrency < 1 || concurrency > 32) {
    error(`--concurrency must be between 1 and 32. Got "${args.values.concurrency}".`);
    process.exit(1);
  }

  const dryRun = Boolean(args.flags['dry-run']);
  const force = Boolean(args.flags.force);

  /* --- credentials, before any work -------------------------------------- */

  const envFiles = loadEnv();

  // Where photographs go. R2 stores pre-generated static files; Cloudinary
  // transforms on demand. Images default to whatever the site is configured to
  // read from, so the importer and the website cannot disagree.
  //
  // `args.values`, not `args.flags`: --target takes a value, and reading it
  // from the wrong bag meant the flag parsed fine and was then silently
  // ignored, sending a whole batch to the other backend without a word.
  const requested = args.values.target || process.env.NEXT_PUBLIC_MEDIA_PROVIDER;

  if (!requested) {
    blank();
    error(
      'Cannot tell where photographs should go.\n' +
        'Set NEXT_PUBLIC_MEDIA_PROVIDER in .env.local, or pass --target r2 | cloudinary.\n' +
        'Guessing here would upload a whole batch to a backend the site does not read.',
    );
    process.exit(1);
  }

  const target = String(requested).toLowerCase();

  if (!TARGETS.includes(target)) {
    blank();
    error(
      `--target must be one of: ${TARGETS.join(', ')}. Got "${target}".` +
        (target === 'local'
          ? '\n"local" is a delivery fallback that serves files from /public/media — ' +
            'there is nothing to import into.'
          : ''),
    );
    process.exit(1);
  }

  let credentials = { folder: '', missing: [] };
  let r2 = null;
  let s3 = null;
  let targetFolder = '';

  if (target === 'r2') {
    r2 = readR2Credentials();
    const missing = missingR2Credentials(r2);

    if (missing.length > 0) {
      if (dryRun) {
        warn(
          `R2 credentials are missing (${missing.join(', ')}). ` +
            'Fine for --dry-run; a real import will stop here.',
        );
      } else {
        blank();
        error(
          `R2 credentials are missing: ${missing.join(', ')}.
` +
            'Add them to .env.local. See docs/MEDIA.md for how to create the bucket.',
        );
        process.exit(1);
      }
    } else if (!dryRun) {
      s3 = configureR2(r2);
    }

    targetFolder = [r2.prefix, year, album || 'everyday'].filter(Boolean).join('/');
  } else {
    credentials = readCredentials();

    if (!dryRun) {
      try {
        configureCloudinary();
      } catch (err) {
        blank();
        error(err.message);
        process.exit(1);
      }
    } else if (credentials.missing.length > 0) {
      warn(
        `Cloudinary credentials are missing (${credentials.missing.join(', ')}). ` +
          'Fine for --dry-run; a real import will stop here.',
      );
    }

    targetFolder = folderFor(credentials.folder, year, album);
  }

  /* --- scan --------------------------------------------------------------- */

  heading(`Import — ${year}${album ? ` / ${album}` : ' / everyday'}`);
  info(`from     ${dir}`);
  info(`to       ${dryRun ? colors.yellow('(dry run — nothing is uploaded)') : targetFolder}`);
  info(`via      ${target === 'r2' ? 'R2 — sizes generated here, uploaded as static files' : 'Cloudinary'}`);
  if (envFiles.length > 0) detail(`credentials from ${envFiles.join(', ')}`);

  const { found, skipped } = scanDirectory(dir);

  if (found.length === 0) {
    blank();
    warn('No supported files found.');
    detail('images: .jpg .jpeg .png .heic .heif .webp .avif .tif .tiff');
    detail('video:  .mp4 .mov .m4v .webm');
    detail('Subfolders are scanned one level deep; hidden files are skipped.');
    process.exit(0);
  }

  const files = limit ? found.slice(0, limit) : found;
  const imageCount = files.filter((f) => f.kind === 'image').length;
  const videoCount = files.length - imageCount;

  info(
    `found    ${files.length} file${files.length === 1 ? '' : 's'}` +
      ` (${imageCount} image${imageCount === 1 ? '' : 's'}, ${videoCount} video)` +
      (limit && found.length > limit ? `  — limited from ${found.length}` : ''),
  );
  if (skipped.length > 0) detail(`${skipped.length} unsupported file(s) ignored`);
  if (videoCount > 0) {
    blank();
    warn(VIDEO_METADATA_NOTE);
  }

  /* --- manifest ----------------------------------------------------------- */

  let doc;
  let manifestFile;
  let manifestExisted;
  try {
    ({ doc, file: manifestFile, existed: manifestExisted } = loadManifestDoc(year));
  } catch (err) {
    blank();
    error(err.message);
    process.exit(1);
  }

  info(
    `manifest ${displayPath(manifestFile)}${manifestExisted ? '' : colors.grey('  (will be created)')}`,
  );

  let albumCreated = false;
  if (album && !findAlbumNode(doc, album)) {
    const title = args.values['album-title'] || titleCase(album);
    addAlbum(doc, { slug: album, title });
    albumCreated = true;
    info(`album    new — "${title}" (${album})`);
  } else if (album) {
    info(`album    ${album}`);
  }

  /* --- run ---------------------------------------------------------------- */

  blank();
  const started = Date.now();
  const context = {
    year,
    album,
    dryRun,
    force,
    targetFolder,
    seenHashes: new Set(),
    doc,
    target,
    s3,
    bucket: r2?.bucket,
    prefix: r2?.prefix,
    formats: LADDER_FORMATS,
    keepOriginal: !args.flags['no-original'],
  };
  let done = 0;

  const results = await runPool(files, concurrency, async (file) => {
    const result = await processFile(file, context);
    done += 1;

    const label = file.relative;
    if (result.status === 'failed') {
      step(done, files.length, `${colors.red('failed  ')} ${label} — ${result.reason}`);
    } else if (result.status === 'duplicate') {
      step(done, files.length, `${colors.grey('skipped ')} ${label} — ${result.reason}`);
    } else {
      const dims = result.width ? `${result.width}x${result.height}` : 'video';
      const verb = result.status === 'would-upload' ? colors.yellow('would    ') : colors.green('uploaded');
      step(
        done,
        files.length,
        `${verb} ${label}  ${colors.grey(`${dims} · ${result.method} · ${formatBytes(result.bytesSent ?? 0)}`)}`,
      );
    }
    return result;
  });

  /* --- write the manifest -------------------------------------------------- */

  const uploaded = results.filter(
    (r) => r && (r.status === 'uploaded' || r.status === 'would-upload'),
  );
  const duplicates = results.filter((r) => r && r.status === 'duplicate');
  const failures = results.filter((r) => !r || r.status === 'failed' || r.error);

  const appended = [];
  const patched = [];

  if (!dryRun && uploaded.length > 0) {
    let number = nextItemNumber(doc, year, album);

    for (const result of uploaded) {
      const item = {
        type: result.type,
        album: album || undefined,
        publicId: result.publicId,
        width: result.width,
        height: result.height,
        // Only set by the R2 path: which sizes and formats were actually
        // written. Recorded per item so the site never asks for a file that
        // does not exist, even if the ladder changes later.
        variants: result.variants,
        formats: result.formats,
        capturedAt: result.capturedAt,
        lqip: result.lqip,
        color: result.color,
        duration: result.duration,
        originalFilename: result.originalFilename,
        hash: result.hash,
      };

      if (result.existingNode) {
        // --force over a file already in the manifest: refresh the technical
        // fields, leave every word Dali wrote exactly where it was.
        const changed = patchItemNode(result.existingNode, item);
        patched.push({ id: String(result.existingNode.get('id')), changed });
        continue;
      }

      const id = formatItemId(year, album, number);
      number += 1;
      addItem(doc, { id, ...item }, { capturedAtInferred: result.capturedAtInferred });
      appended.push(id);
    }
  }

  if (!dryRun && (appended.length > 0 || patched.length > 0 || albumCreated)) {
    try {
      saveManifestDoc(doc, manifestFile);
    } catch (err) {
      blank();
      error(`Could not write ${displayPath(manifestFile)}: ${err.message}`);
      error('Everything uploaded successfully — re-run the import to record it.');
      process.exit(1);
    }
  }

  /* --- summary -------------------------------------------------------------- */

  const bytesRead = results.reduce((sum, r) => sum + (r?.bytesRead ?? 0), 0);
  const bytesSent = uploaded.reduce((sum, r) => sum + (r?.bytesSent ?? 0), 0);
  const strippedCount = uploaded.filter((r) => (r.removed?.length ?? 0) > 0).length;
  const inferredDates = uploaded.filter((r) => r.capturedAtInferred).length;

  heading('Summary');
  const width = String(files.length).length;
  log(
    `  ${colors.green(dryRun ? 'would upload' : 'uploaded   ')}  ${pad(uploaded.length, width)}` +
      colors.grey(`   ${formatBytes(bytesRead)} read · ${formatBytes(bytesSent)} sent`),
  );
  if (duplicates.length > 0) {
    log(`  ${colors.grey('skipped    ')}  ${pad(duplicates.length, width)}${colors.grey('   already in the manifest')}`);
  }
  if (failures.length > 0) {
    log(`  ${colors.red('failed     ')}  ${pad(failures.length, width)}`);
  }
  if (skipped.length > 0) {
    log(`  ${colors.grey('unsupported')}  ${pad(skipped.length, width)}${colors.grey('   wrong file type')}`);
  }
  detail(`${formatDuration(Date.now() - started)} elapsed`);

  blank();
  success(
    `Metadata stripped from ${strippedCount} of ${uploaded.length} file(s) before upload — ` +
      'no GPS, no serial numbers, no filesystem paths left the machine.',
  );
  if (inferredDates > 0) {
    warn(
      `${inferredDates} file(s) had no capture date; the file date was used instead and marked ` +
        'with a comment in the manifest.',
    );
  }

  if (failures.length > 0) {
    blank();
    heading('Failed');
    for (const failure of failures) {
      const name = failure?.file?.relative ?? 'unknown file';
      error(`${name} — ${failure?.reason ?? failure?.error?.message ?? 'unknown error'}`);
    }
  }

  /* --- what to do next ------------------------------------------------------- */

  blank();
  heading('Next');

  if (dryRun) {
    bullet('Nothing was uploaded and nothing was written.');
    bullet('Run the same command without --dry-run when it looks right.');
    process.exit(failures.length > 0 ? 1 : 0);
  }

  if (appended.length === 0 && patched.length === 0) {
    bullet('Nothing new was added to the manifest.');
  } else {
    bullet(
      `${displayPath(manifestFile)} — ${appended.length} item(s) added` +
        (patched.length > 0 ? `, ${patched.length} refreshed` : '') +
        (appended.length > 0 ? ` (${appended[0]} … ${appended[appended.length - 1]})` : ''),
    );
    bullet('Add captions and locations where they matter. Locations are always typed by hand.');
    if (album) {
      bullet(`Set the album date:  albums: → slug: ${album} → date: ${year}-MM`);
      bullet(`Set the album cover: cover: ${appended[0] ?? `${year}-${album}-0001`}`);
    } else {
      bullet(`Set the year cover:  cover: ${appended[0] ?? `${year}-everyday-0001`}`);
    }
    bullet('Mark the best few with  featured: true');
    bullet('npm run media:check');
    bullet(`git add ${displayPath(manifestFile)} && git commit -m "Photos: ${year}${album ? ` ${album}` : ''}"`);
  }

  blank();
  detail('Your originals were not modified, moved or deleted.');

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  blank();
  error(err?.stack || String(err));
  process.exit(1);
});
