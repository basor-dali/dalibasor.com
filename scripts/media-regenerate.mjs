#!/usr/bin/env node
/**
 * media:regenerate — rebuild derivatives for photographs already in the archive.
 *
 * Pre-generating every size is what makes this archive cheap and fast, but it
 * has one cost: the sizes are decided at import. This is the way back. Run it
 * when the ladder changes, when a new format is worth adding, or when a
 * redesign wants a width nobody built.
 *
 *   npm run media:regenerate -- --year 2019
 *   npm run media:regenerate -- --year 2019 --album serbia
 *   npm run media:regenerate -- --all --dry-run
 *
 * Where the pixels come from, in order of preference:
 *
 *   1. --from <dir>, scanned for a file matching each item's originalFilename.
 *      Use this when you still have the true originals on disk — it is the
 *      only source that can produce a size larger than what was uploaded.
 *   2. The `original.<ext>` object already in the bucket, downloaded and
 *      re-encoded. Works with no local files at all, and is lossless in the
 *      sense that matters: that object is the full-resolution copy.
 *
 * What it never touches: captions, alt text, locations, `featured`, ids, album
 * membership, or your original files. It rewrites derivative objects and the
 * `variants`/`formats` fields, and nothing else.
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
  displayPath,
  expandPath,
  itemNodes,
  listManifestFiles,
  loadManifestDoc,
  saveManifestDoc,
} from './lib/manifest.mjs';
import {
  derivativeKey,
  generateDerivatives,
  originalExtensionCandidates,
  LADDER_FORMATS,
} from './lib/derivatives.mjs';
import {
  configureR2,
  missingR2Credentials,
  putObject,
  readR2Credentials,
  uploadErrorMessage,
} from './lib/r2.mjs';
import { runPool } from './lib/upload.mjs';

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

function printUsage() {
  usage(`media:regenerate — rebuild derivatives for photographs already imported

  npm run media:regenerate -- --year 2019
  npm run media:regenerate -- --year 2019 --album serbia
  npm run media:regenerate -- --all --from ~/Archive/photos --dry-run

Options:
  --year <YYYY>      Regenerate one year.
  --all              Every year with a manifest.
  --album <slug>     Restrict to one album within the year.
  --from <dir>       Folder of true originals, searched recursively by the
                     originalFilename recorded at import. Falls back to the
                     original stored in the bucket when a file is not found.
  --concurrency <n>  Photographs at a time. Default 3 — each one is already
                     encoding thirteen files.
  --dry-run          Report what would change and write nothing.
  --help

Never modifies your originals, and never touches captions, locations, alt text
or anything else you have written by hand.`);
}

/* ==========================================================================
   Arguments
   ========================================================================== */

function parseArgs(argv) {
  const flags = {};
  const VALUE = new Set(['year', 'album', 'from', 'concurrency']);

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

/* ==========================================================================
   Finding the source pixels
   ========================================================================== */

/** Index a folder of originals once, by lowercased filename. */
function indexOriginals(dir) {
  const index = new Map();
  if (!dir) return index;

  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        // First match wins; a duplicate filename in two folders is ambiguous
        // and the archive's own copy is the safer answer anyway.
        const key = entry.name.toLowerCase();
        if (!index.has(key)) index.set(key, full);
      }
    }
  }
  return index;
}

/**
 * Fetch the stored original, trying each plausible extension.
 *
 * Same reason as media:backup — the importer re-encodes anything it cannot
 * strip losslessly, so a HEIC is stored as `original.jpg` and the source
 * filename does not tell you what was written.
 */
async function fetchOriginal(publicBaseUrl, item) {
  for (const ext of originalExtensionCandidates(item)) {
    const url = `${publicBaseUrl}/${item.publicId}/original${ext}`;
    const response = await fetch(url);
    if (response.ok) return { url, response };
  }
  return null;
}

async function loadSource(item, { originals, publicBaseUrl }) {
  const name = item.originalFilename;

  if (name) {
    const local = originals.get(String(name).toLowerCase());
    if (local) {
      try {
        return { buffer: fs.readFileSync(local), from: 'disk', path: local };
      } catch {
        /* fall through to the bucket copy */
      }
    }
  }

  const found = await fetchOriginal(publicBaseUrl, item);
  if (!found) {
    throw new Error(
      `no source available — not on disk, and no original.* in the bucket under ` +
        `${item.publicId}/. Pass --from with the folder holding your originals.`,
    );
  }
  return {
    buffer: Buffer.from(await found.response.arrayBuffer()),
    from: 'bucket',
    path: found.url,
  };
}

/* ==========================================================================
   Main
   ========================================================================== */

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h) {
    printUsage();
    process.exit(0);
  }

  const dryRun = Boolean(flags['dry-run']);
  const concurrency = Math.max(1, Number(flags.concurrency) || 3);
  const albumFilter = flags.album ? String(flags.album) : null;

  if (!flags.all && !flags.year) {
    printUsage();
    blank();
    fail('Pass --year <YYYY> or --all.');
  }

  const credentials = readR2Credentials();
  const missing = missingR2Credentials(credentials);
  if (missing.length > 0 && !dryRun) {
    fail(
      `R2 credentials are missing: ${missing.join(', ')}.\n` +
        'Regenerating uploads new derivatives, so it needs write access. See docs/MEDIA.md.',
    );
  }

  const s3 = dryRun || missing.length > 0 ? null : configureR2(credentials);

  /* --- which years ------------------------------------------------------ */

  const years = flags.all
    ? listManifestFiles().map((file) => Number(path.basename(file).slice(0, 4)))
    : [Number(flags.year)];

  if (years.some((year) => !Number.isFinite(year)))
    fail('--year must be a four digit year.');

  const originals = indexOriginals(flags.from ? expandPath(String(flags.from)) : null);

  heading(
    `Regenerate — ${flags.all ? 'every year' : years[0]}${albumFilter ? ` / ${albumFilter}` : ''}`,
  );
  if (flags.from)
    info(
      `originals ${originals.size} file(s) indexed from ${expandPath(String(flags.from))}`,
    );
  else info('originals from the bucket (pass --from to use local files)');
  info(`formats   ${LADDER_FORMATS.join(', ')} + one jpeg fallback`);
  if (dryRun) warn('Dry run — nothing will be uploaded or written.');
  blank();

  let totalDone = 0;
  let totalFailed = 0;
  let totalBytes = 0;
  const failures = [];

  for (const year of years) {
    const { doc, file } = loadManifestDoc(year);
    const nodes = itemNodes(doc).filter((node) => {
      if (String(node.get('type')) !== 'image') return false;
      if (albumFilter && String(node.get('album') ?? '') !== albumFilter) return false;
      return true;
    });

    if (nodes.length === 0) {
      detail(`${year}: nothing to do`);
      continue;
    }

    info(`${year}: ${pluralize(nodes.length, 'photograph')}`);

    let done = 0;
    await runPool(nodes, concurrency, async (node) => {
      const item = {
        id: String(node.get('id')),
        publicId: String(node.get('publicId')),
        originalFilename: node.get('originalFilename'),
        originalExt: node.get('originalExt'),
      };

      try {
        const source = await loadSource(item, {
          originals,
          publicBaseUrl: credentials.publicBaseUrl,
        });

        // Dimensions come from the source itself rather than the manifest: if
        // a bigger original has turned up, this is where the archive gets to
        // take advantage of it.
        const sharp = (await import('sharp')).default;
        const meta = await sharp(source.buffer, {
          failOn: 'none',
          limitInputPixels: false,
        }).metadata();
        const nativeWidth = meta.width ?? Number(node.get('width')) ?? 1600;

        const derived = await generateDerivatives(source.buffer, {
          nativeWidth,
          formats: LADDER_FORMATS,
        });

        if (!dryRun) {
          for (const output of derived.outputs) {
            const key = output.isFallback
              ? derivativeKey(item.publicId, output.width, 'jpeg')
              : derivativeKey(item.publicId, output.width, output.format);

            await putObject(s3, {
              bucket: credentials.bucket,
              key,
              body: output.buffer,
              contentType: output.contentType,
            });
          }

          const variants = doc.createNode(derived.widths);
          variants.flow = true;
          const formats = doc.createNode(derived.formats);
          formats.flow = true;
          node.set('variants', variants);
          node.set('formats', formats);
          if (meta.width) node.set('width', meta.width);
          if (meta.height) node.set('height', meta.height);
        }

        totalBytes += derived.totalBytes;
        done += 1;
        totalDone += 1;
        step(
          done,
          nodes.length,
          `${colors.green(dryRun ? 'would  ' : 'rebuilt')} ${item.id}  ${derived.widths.length}×${derived.formats.length}+1  ${colors.grey(source.from)}`,
        );
      } catch (err) {
        done += 1;
        totalFailed += 1;
        const reason = err?.$metadata ? uploadErrorMessage(err) : err.message;
        failures.push(`${item.id}: ${reason}`);
        step(done, nodes.length, `${colors.red('failed ')} ${item.id} — ${reason}`);
      }
    });

    if (!dryRun && totalDone > 0) saveManifestDoc(doc, file);
  }

  /* --- summary ---------------------------------------------------------- */

  blank();
  heading('Summary');
  info(`${dryRun ? 'would rebuild' : 'rebuilt'}  ${totalDone}`);
  if (totalBytes > 0) detail(`${formatBytes(totalBytes)} of derivatives generated`);

  if (failures.length > 0) {
    blank();
    error(pluralize(failures.length, 'failure'));
    for (const line of failures) bullet(line);
  }

  blank();
  if (dryRun) {
    detail('Nothing was uploaded and nothing was written.');
  } else {
    success(
      'Manifests updated. Old derivatives at widths no longer generated are left in place —',
    );
    detail(
      'they cost storage but break nothing. Delete them from the bucket if you care.',
    );
  }

  if (totalFailed > 0) process.exitCode = 1;
}

main().catch((err) => {
  blank();
  error(err.message);
  // exitCode rather than exit(): pending sockets need to close first, or Node
  // aborts with a libuv assertion on Windows.
  process.exitCode = 1;
});
