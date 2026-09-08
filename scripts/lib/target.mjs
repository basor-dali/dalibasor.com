/**
 * Where a file is going, resolved once.
 *
 * The CLI and the drag-and-drop UI at /admin/media both feed the same
 * per-file pipeline, and the entire premise of that shared module is that the
 * two callers cannot drift. They drifted anyway: the route was written against
 * Cloudinary and never migrated, so dragging a photograph into the browser
 * uploaded it to the wrong backend and wrote a manifest entry the site renders
 * as a 404 — silently, because the placeholder frame looks identical to a
 * photograph that has not loaded.
 *
 * Target resolution was the last thing the two callers each did for themselves.
 * Now neither does.
 */

import { LADDER_FORMATS } from './derivatives.mjs';
import {
  configureCloudinary,
  folderFor,
  loadEnv,
  readCredentials,
  DEFAULT_FOLDER,
} from './upload.mjs';
import { configureR2, missingR2Credentials, readR2Credentials } from './r2.mjs';

export const TARGETS = ['r2', 'cloudinary'];

export class TargetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TargetError';
  }
}

/**
 * Decide the backend without touching credentials.
 *
 * Never guesses. An unset provider is an error rather than a default, because
 * the cost of guessing wrong is a batch of photographs in a bucket the site
 * does not read, discovered by eye months later.
 */
export function resolveTargetName(explicit) {
  const requested = explicit || process.env.NEXT_PUBLIC_MEDIA_PROVIDER;

  if (!requested) {
    throw new TargetError(
      'Cannot tell where photographs should go. Set NEXT_PUBLIC_MEDIA_PROVIDER in ' +
        '.env.local, or pass --target r2 | cloudinary.',
    );
  }

  const target = String(requested).toLowerCase();

  if (!TARGETS.includes(target)) {
    throw new TargetError(
      `Unknown media target "${target}". Expected one of: ${TARGETS.join(', ')}.` +
        (target === 'local'
          ? ' "local" serves files from /public/media — there is nothing to import into.'
          : ''),
    );
  }

  return target;
}

/**
 * Everything the pipeline needs to place one file, credentials included.
 *
 * `kind` matters: video always goes to Cloudinary for now, because doing video
 * properly means transcoding rather than resizing. So an R2 archive still needs
 * Cloudinary credentials to accept a video, and asking for them only then is
 * what lets a photographs-only archive run with no Cloudinary account at all.
 */
export function resolveTarget({
  target: explicit,
  year,
  album,
  kind = 'image',
  dryRun = false,
  root,
} = {}) {
  loadEnv(root);

  const target = resolveTargetName(explicit);
  const usesCloudinary = target === 'cloudinary' || kind === 'video';

  if (usesCloudinary) {
    const credentials = readCredentials();

    if (credentials.missing.length > 0) {
      if (!dryRun) {
        throw new TargetError(
          `Cloudinary credentials are missing: ${credentials.missing.join(', ')}.` +
            (kind === 'video' && target === 'r2'
              ? ' Video is delivered by Cloudinary even on an R2 archive; see docs/MEDIA.md.'
              : ''),
        );
      }
    } else if (!dryRun) {
      configureCloudinary();
    }

    return {
      target: 'cloudinary',
      targetFolder: folderFor(credentials.folder || DEFAULT_FOLDER, year, album),
      missing: credentials.missing,
      s3: null,
      bucket: undefined,
      prefix: undefined,
      formats: LADDER_FORMATS,
      keepOriginal: true,
    };
  }

  const r2 = readR2Credentials(root);
  const missing = missingR2Credentials(r2);

  if (missing.length > 0 && !dryRun) {
    throw new TargetError(
      `R2 credentials are missing: ${missing.join(', ')}. See docs/MEDIA.md for creating ` +
        'the bucket and the token.',
    );
  }

  return {
    target: 'r2',
    targetFolder: [r2.prefix, String(year), album || 'everyday'].filter(Boolean).join('/'),
    missing,
    s3: missing.length > 0 || dryRun ? null : configureR2(r2),
    bucket: r2.bucket,
    prefix: r2.prefix,
    formats: LADDER_FORMATS,
    keepOriginal: true,
  };
}

/** A one-line description of where files are going, for the console and the UI. */
export function describeTarget(target) {
  return target === 'r2'
    ? 'R2 — sizes generated here, uploaded as static files'
    : 'Cloudinary';
}
