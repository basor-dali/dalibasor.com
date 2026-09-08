/**
 * Cloudinary uploads, plus the environment loading and the little concurrency
 * pool that the importer runs them through.
 *
 * Everything here reads files and sends bytes outward. Nothing writes to the
 * user's filesystem, and nothing modifies an original — a video is opened for
 * reading by the SDK and closed again.
 *
 * Credentials come from .env.local (or .env, or the real environment). There
 * is a hand-rolled parser below rather than a dotenv dependency: it is twenty
 * lines, and the fewer packages that can read this file, the better.
 */

import fs from 'node:fs';
import path from 'node:path';
import { v2 as cloudinary } from 'cloudinary';

import { REPO_ROOT } from './manifest.mjs';

/* ==========================================================================
   .env parsing
   ========================================================================== */

function parseEnv(text) {
  const out = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const body = line.startsWith('export ') ? line.slice(7).trim() : line;
    const equals = body.indexOf('=');
    if (equals === -1) continue;

    const key = body.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = body.slice(equals + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, '\n');
    } else {
      // An unquoted trailing comment: FOO=bar # note
      const comment = value.indexOf(' #');
      if (comment !== -1) value = value.slice(0, comment).trim();
    }

    out[key] = value;
  }

  return out;
}

/**
 * Load .env.local then .env from the repository root. A variable already set
 * in the real environment always wins, so `CLOUDINARY_API_KEY=… npm run …`
 * overrides the file, and CI needs no file at all.
 *
 * @returns {string[]} the files that were read, for the console to mention
 */
export function loadEnv(root = REPO_ROOT) {
  const loaded = [];

  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name);
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const values = parseEnv(text);
    for (const [key, value] of Object.entries(values)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
    loaded.push(name);
  }

  return loaded;
}

/* ==========================================================================
   Credentials
   ========================================================================== */

export const DEFAULT_FOLDER = 'dalibasor';

export function readCredentials() {
  const cloudName = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();
  const folder = (process.env.CLOUDINARY_FOLDER || DEFAULT_FOLDER)
    .trim()
    .replace(/^\/+|\/+$/g, '');

  const missing = [];
  if (!cloudName) missing.push('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME');
  if (!apiKey) missing.push('CLOUDINARY_API_KEY');
  if (!apiSecret) missing.push('CLOUDINARY_API_SECRET');

  return { cloudName, apiKey, apiSecret, folder, missing };
}

/**
 * Configure the SDK, or throw a message that says exactly what to do.
 * Called before a single file is read, so a missing key costs no work.
 */
export function configureCloudinary() {
  const credentials = readCredentials();

  if (credentials.missing.length > 0) {
    throw new Error(
      `Cloudinary credentials are missing: ${credentials.missing.join(', ')}.\n\n` +
        'Copy .env.example to .env.local and fill in the three Cloudinary values:\n' +
        '  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name\n' +
        '  CLOUDINARY_API_KEY=...\n' +
        '  CLOUDINARY_API_SECRET=...\n\n' +
        'They are on the Cloudinary dashboard. .env.local is gitignored — keep a copy in ' +
        'your password manager.',
    );
  }

  cloudinary.config({
    cloud_name: credentials.cloudName,
    api_key: credentials.apiKey,
    api_secret: credentials.apiSecret,
    secure: true,
  });

  return { cloudinary, ...credentials };
}

/* ==========================================================================
   Naming
   ========================================================================== */

/** `dalibasor/2020/serbia` — or `dalibasor/2020/everyday` with no album. */
export function folderFor(base, year, album) {
  return [base, String(year), album || 'everyday'].filter(Boolean).join('/');
}

/**
 * A Cloudinary-safe leaf name derived from the original filename.
 *
 * Lowercased so that two files differing only in case cannot collide on one
 * filesystem and not another, and reduced to characters that never need
 * escaping inside a delivery URL.
 */
export function publicIdLeaf(filename) {
  const base = path.basename(filename, path.extname(filename));
  const cleaned = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 100);
  return cleaned || 'file';
}

/* ==========================================================================
   Retries
   ========================================================================== */

const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ESOCKETTIMEDOUT',
  'ERR_STREAM_PREMATURE_CLOSE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/**
 * A hotel wifi dropout is worth retrying. A 401 is not — retrying a bad API
 * key three times just wastes the user's evening.
 */
export function isRetryable(error) {
  if (!error) return false;
  const status = error.http_code ?? error.statusCode ?? error.status;
  if (typeof status === 'number') {
    if (status >= 500) return true;
    if (status === 429) return true; // rate limited: back off and try again
    if (status >= 400) return false;
  }
  if (error.code && RETRYABLE_CODES.has(error.code)) return true;
  const message = String(error.message || error).toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('socket hang up') ||
    message.includes('network') ||
    message.includes('econnreset')
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `task`, retrying transient failures up to `retries` times with a growing
 * backoff plus jitter (so eight parallel uploads do not all come back at the
 * same instant and fail together again).
 */
export async function withRetry(task, { retries = 3, onRetry } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryable(error)) break;
      const delay = Math.round(1000 * 2 ** attempt + Math.random() * 400);
      if (onRetry) onRetry({ attempt: attempt + 1, retries, delay, error });
      await sleep(delay);
    }
  }

  throw lastError;
}

/* ==========================================================================
   Uploading
   ========================================================================== */

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else if (!result) reject(new Error('Cloudinary returned no result.'));
      else resolve(result);
    });
    stream.on('error', reject);
    stream.end(buffer);
  });
}

function uploadPath(file, options, { large = false } = {}) {
  return new Promise((resolve, reject) => {
    const done = (error, result) => {
      if (error) reject(error);
      else if (!result) reject(new Error('Cloudinary returned no result.'));
      else resolve(result);
    };
    // The file is opened for reading only. Nothing here writes it back.
    if (large) cloudinary.uploader.upload_large(file, options, done);
    else cloudinary.uploader.upload(file, options, done);
  });
}

/** Files above this go up in chunks, which survives a dropped connection. */
const LARGE_FILE_BYTES = 90 * 1000 * 1000;

/**
 * Upload one asset.
 *
 * Images arrive as a Buffer — the stripped copy, never the file on disk.
 * Video is streamed from its path, because a 2GB clip has no business being
 * held in memory, and because there is nothing to strip from it locally.
 *
 * `overwrite` stays false unless the caller passes `force`, so a second run
 * over the same folder can never quietly replace an asset the site is already
 * serving.
 *
 * @returns the raw Cloudinary response
 */
export async function uploadAsset({
  buffer,
  filePath,
  folder,
  publicId,
  resourceType = 'image',
  originalFilename,
  force = false,
  retries = 3,
  onRetry,
  sizeBytes = 0,
}) {
  const options = {
    folder,
    public_id: publicId,
    resource_type: resourceType,
    // The public id is derived from the original filename here rather than by
    // Cloudinary, because a Buffer upload has no filename for it to read. Both
    // flags are still passed so the intent survives if that ever changes.
    use_filename: true,
    unique_filename: false,
    overwrite: Boolean(force),
    // Only meaningful alongside overwrite: purge the CDN edge caches so a
    // replaced photograph does not keep serving the old bytes for hours.
    invalidate: Boolean(force),
    timeout: 180_000,
  };

  if (originalFilename) options.filename_override = originalFilename;

  return withRetry(
    () =>
      buffer
        ? uploadBuffer(buffer, options)
        : uploadPath(filePath, options, { large: sizeBytes > LARGE_FILE_BYTES }),
    { retries, onRetry },
  );
}

/* ==========================================================================
   Concurrency
   ========================================================================== */

/**
 * Run `worker` over `items`, at most `concurrency` at a time, preserving the
 * order of results. Four workers is enough to saturate a home connection and
 * few enough that a failure is legible in the console.
 *
 * A worker that throws does not cancel the run: the error is stored in that
 * slot and the pool carries on, because one corrupt file out of four hundred
 * should not end the evening.
 */
export async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  const width = Math.max(1, Math.min(Number(concurrency) || 1, items.length || 1));
  let cursor = 0;

  async function drain() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { error };
      }
    }
  }

  await Promise.all(Array.from({ length: width }, () => drain()));
  return results;
}
