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
import { slugify } from './manifest.mjs';

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
    // Override the endpoint to point at MinIO, Backblaze B2, S3 or a local
    // test server. R2 is the default, not a requirement — the whole reason to
    // speak S3 is that the bucket can move.
    endpoint: process.env.R2_ENDPOINT,
    publicBaseUrl: (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  };
}

export function missingR2Credentials(credentials) {
  const missing = [];
  // An explicit endpoint replaces the account id, which is only used to build
  // Cloudflare's URL.
  if (!credentials.accountId && !credentials.endpoint) missing.push('R2_ACCOUNT_ID');
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
    region: process.env.R2_REGION || 'auto',
    endpoint:
      credentials.endpoint || `https://${credentials.accountId}.r2.cloudflarestorage.com`,
    // Most S3-compatible servers other than AWS want path-style addressing.
    forcePathStyle: Boolean(credentials.endpoint),
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
    /* Send a checksum only where the operation actually requires one.
       ------------------------------------------------------------------
       Since v3.729 the SDK defaults both of these to WHEN_SUPPORTED, which
       puts `x-amz-checksum-crc32` on every PutObject. AWS S3 wants that. The
       S3-compatible stores this file exists to stay portable to do not all
       accept it — Backblaze B2 rejects the header outright, and older MinIO
       does too — so the default quietly costs the portability that is the
       whole reason for using the S3 API rather than a Cloudflare SDK.

       R2 itself does accept it today, and it is accepted here in the only
       form R2 has ever been reliable with: both upload call sites pass a
       Buffer, so the SDK signs the whole payload up front. A stream body
       would switch it to `aws-chunked` with a trailing checksum and
       STREAMING-UNSIGNED-PAYLOAD-TRAILER, which is the shape R2 has refused
       with a 501. Worth knowing before anyone changes `body:` in process.mjs
       to a read stream for large originals.

       WHEN_REQUIRED keeps the checksums that some operations mandate and
       drops the rest. Verified against a local server: with this set, no
       x-amz-checksum-crc32 and no x-amz-sdk-checksum-algorithm goes out. */
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
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
 *
 * Two things this has to get right, both of which it once got wrong.
 *
 * TRANSLITERATION. It used its own slug rule that stripped anything non-ASCII,
 * so `Đorđe.jpg` became `or-e`. It now shares slugify with the rest of the
 * project, which knows that Đ is a letter rather than noise.
 *
 * UNIQUENESS. A name that reduces to nothing — `Ελλάδα.jpg`, `日本.jpg`,
 * `Ужице.png`, `___.jpg` — used to become the literal string "image", so a
 * folder of them all resolved to ONE key and each upload silently overwrote the
 * last. You would finish an import with five manifest entries pointing at a
 * single photograph, and nothing anywhere would report a problem.
 *
 * So the content hash is part of the address. Two different photographs cannot
 * collide, the same photograph re-imported lands on the same key, and the
 * readable part of the name survives for anyone browsing the bucket.
 */
export function keyLeaf(filename, hash = '') {
  const stem = String(filename ?? '').replace(/\.[^.]+$/, '');
  const slug = slugify(stem).slice(0, 60) || 'photo';
  const suffix = String(hash).slice(0, 8);
  return suffix ? `${slug}-${suffix}` : slug;
}

export async function objectExists(s3, bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound')
      return false;
    throw error;
  }
}

/** Retry the same transient failures the Cloudinary path retries. */
function isRetryable(error) {
  const status = error?.$metadata?.httpStatusCode;
  if (status && status >= 500) return true;
  return ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE'].includes(
    error?.code,
  );
}

export async function putObject(
  s3,
  {
    bucket,
    key,
    body,
    contentType,
    cacheControl = IMMUTABLE_CACHE_CONTROL,
    retries = 3,
    onRetry,
  },
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

  if (
    status === 401 ||
    status === 403 ||
    name === 'InvalidAccessKeyId' ||
    name === 'SignatureDoesNotMatch'
  ) {
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
