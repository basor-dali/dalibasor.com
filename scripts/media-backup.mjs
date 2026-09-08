#!/usr/bin/env node
/**
 * media:backup — pull the archive back out of the bucket.
 *
 * BACKUP.md promises that nothing irreplaceable lives only inside a service.
 * This is the script that makes that true rather than merely stated: it walks
 * every manifest, downloads the full-resolution copy of every photograph, and
 * lays them out in folders that mirror the archive.
 *
 *   npm run media:backup -- --to ~/Archive/photos
 *   npm run media:backup -- --to ~/Archive/photos --year 2019
 *   npm run media:backup -- --verify          # check without downloading
 *
 * It also answers the question a backup strategy actually turns on: is every
 * photograph the manifest claims to have really in the bucket? A manifest entry
 * pointing at a missing object is a photograph you have already lost, and you
 * would rather find out now than in 2041.
 *
 * Resumable: a file already on disk at the right size is skipped, so an
 * interrupted run picks up where it stopped.
 *
 * This backs up the DELIVERY copy — full resolution, metadata stripped. Your
 * true originals are the ones on your own disks; see BACKUP.md. This is the
 * offsite leg, not a replacement for them.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  blank,
  bullet,
  colors,
  detail,
  error,
  fail,
  formatBytes,
  heading,
  info,
  pluralize,
  step,
  success,
  usage,
  warn,
} from './lib/log.mjs';
import {
  expandPath,
  listManifestFiles,
  readManifestFile,
} from './lib/manifest.mjs';
import { readR2Credentials } from './lib/r2.mjs';
import { runPool } from './lib/upload.mjs';

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.avif', '.tif', '.tiff',
]);

function printUsage() {
  usage(`media:backup — download every photograph out of the bucket

  npm run media:backup -- --to ~/Archive/photos
  npm run media:backup -- --to ~/Archive/photos --year 2019
  npm run media:backup -- --verify

Options:
  --to <dir>         Where to write. Required unless --verify.
  --year <YYYY>      One year instead of all of them.
  --verify           Check every object exists; download nothing.
  --concurrency <n>  Parallel downloads. Default 6.
  --help

Files already present at the right size are skipped, so an interrupted run
resumes. Nothing in the bucket is modified or deleted.`);
}

function parseArgs(argv) {
  const flags = {};
  const VALUE = new Set(['to', 'year', 'concurrency']);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const name = arg.slice(2);
    const eq = name.indexOf('=');
    if (eq !== -1) {
      flags[name.slice(0, eq)] = name.slice(eq + 1);
    } else if (VALUE.has(name)) {
      flags[name] = argv[i + 1];
      i += 1;
    } else {
      flags[name] = true;
    }
  }
  return flags;
}

/** Mirror the archive's own shape: <year>/<album>/<original filename>. */
function destinationFor(root, item) {
  const name = item.originalFilename || `${item.id}.jpg`;
  return path.join(root, String(item.year), item.album || 'everyday', name);
}

function originalUrl(base, item) {
  const ext = item.originalFilename
    ? path.extname(item.originalFilename).toLowerCase()
    : '.jpg';
  const usable = IMAGE_EXTENSIONS.has(ext) ? ext : '.jpg';
  return `${base}/${item.publicId}/original${usable}`;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h) {
    printUsage();
    process.exit(0);
  }

  const verifyOnly = Boolean(flags.verify);
  const concurrency = Math.max(1, Number(flags.concurrency) || 6);

  if (!verifyOnly && !flags.to) {
    printUsage();
    blank();
    fail('Pass --to <dir>, or --verify to check without downloading.');
  }

  const root = flags.to ? expandPath(String(flags.to)) : null;

  const credentials = readR2Credentials();
  if (!credentials.publicBaseUrl) {
    fail(
      'NEXT_PUBLIC_R2_PUBLIC_BASE_URL is not set, so there is nothing to download from.\n' +
        'This script reads public URLs only — it needs no keys.',
    );
  }

  const files = listManifestFiles().filter((file) =>
    flags.year ? path.basename(file).startsWith(String(flags.year)) : true,
  );

  if (files.length === 0) fail('No manifests to back up.');

  // Video is skipped: it lives on Cloudinary, is not addressed by these URLs,
  // and would need its own download path. Say so rather than pretending.
  const items = [];
  let videoCount = 0;
  for (const file of files) {
    const data = readManifestFile(file) ?? {};
    const year = Number(path.basename(file).slice(0, 4));
    for (const item of data.items ?? []) {
      if (item?.type === 'video') {
        videoCount += 1;
        continue;
      }
      if (item?.publicId) items.push({ ...item, year });
    }
  }

  heading(verifyOnly ? 'Verify' : 'Backup');
  info(`source    ${credentials.publicBaseUrl}`);
  if (root) info(`to        ${root}`);
  info(`items     ${pluralize(items.length, 'photograph')} across ${pluralize(files.length, 'year')}`);
  if (videoCount > 0) {
    warn(`${pluralize(videoCount, 'video')} skipped — video is on Cloudinary, not in this bucket.`);
  }
  blank();

  if (items.length === 0) {
    success('Nothing to do.');
    return;
  }

  let downloaded = 0;
  let skipped = 0;
  let bytes = 0;
  const missing = [];
  let done = 0;

  await runPool(items, concurrency, async (item) => {
    const url = originalUrl(credentials.publicBaseUrl, item);

    try {
      if (verifyOnly) {
        const head = await fetch(url, { method: 'HEAD' });
        done += 1;
        if (head.ok) {
          step(done, items.length, `${colors.green('present')} ${item.id}`);
        } else {
          missing.push(`${item.id} — ${head.status} at ${url}`);
          step(done, items.length, `${colors.red('MISSING')} ${item.id} (${head.status})`);
        }
        return;
      }

      const target = destinationFor(root, item);

      // Resume: a file already the right size is not fetched again.
      if (fs.existsSync(target)) {
        const head = await fetch(url, { method: 'HEAD' });
        const remote = Number(head.headers.get('content-length') || 0);
        const local = fs.statSync(target).size;
        if (head.ok && remote > 0 && remote === local) {
          skipped += 1;
          done += 1;
          step(done, items.length, `${colors.grey('have   ')} ${item.id}`);
          return;
        }
      }

      const response = await fetch(url);
      if (!response.ok) {
        missing.push(`${item.id} — ${response.status} at ${url}`);
        done += 1;
        step(done, items.length, `${colors.red('MISSING')} ${item.id} (${response.status})`);
        return;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      fs.mkdirSync(path.dirname(target), { recursive: true });
      // Write to a temp name first so an interrupted run never leaves a
      // truncated file that a later run would mistake for complete.
      const temp = `${target}.part`;
      fs.writeFileSync(temp, buffer);
      fs.renameSync(temp, target);

      downloaded += 1;
      bytes += buffer.length;
      done += 1;
      step(done, items.length, `${colors.green('saved  ')} ${item.id}  ${formatBytes(buffer.length)}`);
    } catch (err) {
      missing.push(`${item.id} — ${err.message}`);
      done += 1;
      step(done, items.length, `${colors.red('failed ')} ${item.id} — ${err.message}`);
    }
  });

  blank();
  heading('Summary');
  if (verifyOnly) {
    info(`present   ${items.length - missing.length} of ${items.length}`);
  } else {
    info(`saved     ${downloaded}`);
    if (skipped > 0) detail(`${skipped} already on disk`);
    if (bytes > 0) detail(formatBytes(bytes));
  }

  if (missing.length > 0) {
    blank();
    error(`${pluralize(missing.length, 'photograph')} could not be retrieved`);
    for (const line of missing.slice(0, 20)) bullet(line);
    if (missing.length > 20) detail(`…and ${missing.length - 20} more`);
    blank();
    error('A manifest entry with no object behind it is a photograph already lost.');
    detail('Re-import it from your originals, or remove the entry.');
    process.exitCode = 1;
    return;
  }

  blank();
  success(
    verifyOnly
      ? 'Every photograph in the manifests exists in the bucket.'
      : 'Archive downloaded. This is the offsite leg of 3-2-1 — see BACKUP.md for the rest.',
  );
}

main().catch((err) => {
  blank();
  error(err.message);
  // exitCode rather than exit(): pending sockets need to close first, or Node
  // aborts with a libuv assertion on Windows.
  process.exitCode = 1;
});
