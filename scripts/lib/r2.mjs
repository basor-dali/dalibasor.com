/**
 * Cloudflare R2 upload.
 *
 * R2 speaks the S3 API, which is the reason to prefer it beyond the price: if
 * Cloudflare ever becomes the wrong answer, the same bucket layout and the same
 * client work against S3, Backblaze B2, Wasabi or MinIO. Nothing in this file
 * is Cloudflare-specific except the endpoint URL.
 *
 * Credentials are read from the environment and never leave this machine. The
 * bucket is served publicly for reads — either through R2's public bucket URL
 * or a custom domain — so the website itself needs no keys at all.
 */

import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { loadEnv } from './upload.mjs';

export const DEFAULT_PREFIX = 'dalibasor';

/**
 * Derivatives are immutable: the key contains the width and format, and the
 * content for a given key never changes. So they can be cached for a year and
 * never revalidated.
 */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

let client = null;

export function readR2Credentials(root) {
  loadEnv(root);
  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    prefix: process.env.R2_PREFIX || DEFAULT_PREFIX,
    publicBaseUrl: (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  };
}

export function missingR2Credentials(credentials) {
  const missing = [];
  if (!credentials.accountId) missing.push('R2_ACCOUNT_ID');
  if (!credentials.accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!credentials.secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (!credentials.bucket) missing.push('R2_BUCKET');
  if (!credentials.publicBaseUrl) missing.push('NEXT_PUBLIC_R2_PUBLIC_BASE_URL');
  return missing;
}

export function configureR2(credentials) {
  if (client) return client;

  client = new S3Client({
    // R2 has no regions; 'auto' is what Cloudflare's own docs specify.
    region: 'auto',
    endpoint: `https://${credentials.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  });

  return client;
}

/** Where one photograph's objects live: `<prefix>/<year>/<album>/<name>`. */
export function baseKeyFor(prefix, year, album, leaf) {
  return [prefix, String(year), album || 'everyday', leaf].filter(Boolean).join('/');
}

/**
 * A filename reduced to something safe to put in a URL forever.
 *
 * The original filename is kept in the manifest for provenance; this is only
 * the address. Extensions are dropped because a photograph is a folder here,
 * not a file.
 */
export function keyLeaf(filename) {
  const withoutExtension = filename.replace(/\.[^.]+$/, '');
  const slug = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'image';
}

export async function objectExists(s3, bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return false;
    throw error;
  }
}

/** Retry the same transient failures the Cloudinary path retries. */
function isRetryable(error) {
  const status = error?.$metadata?.httpStatusCode;
  if (status && status >= 500) return true;
  return ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE'].includes(error?.code);
}

export async function putObject(
  s3,
  { bucket, key, body, contentType, cacheControl = IMMUTABLE_CACHE_CONTROL, retries = 3, onRetry },
) {
  let attempt = 0;

  for (;;) {
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheControl,
        }),
      );
      return;
    } catch (error) {
      attempt += 1;
      if (attempt > retries || !isRetryable(error)) throw error;
      const delay = 500 * 2 ** (attempt - 1);
      onRetry?.({ attempt, retries, delay, key });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export function uploadErrorMessage(error) {
  const status = error?.$metadata?.httpStatusCode;
  const name = error?.name || '';

  if (status === 401 || status === 403 || name === 'InvalidAccessKeyId' || name === 'SignatureDoesNotMatch') {
    return `R2 rejected the credentials (${status ?? name}) — check R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY`;
  }
  if (name === 'NoSuchBucket') {
    return `bucket "${process.env.R2_BUCKET}" does not exist — check R2_BUCKET`;
  }
  if (status === 429) {
    return 'R2 rate-limited the upload — retry with a lower --concurrency';
  }
  return `upload failed${status ? ` (${status})` : ''}: ${error?.message || String(error)}`;
}
