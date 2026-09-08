/**
 * Per-file work for the media pipeline.
 *
 * Extracted so there is exactly ONE implementation of "turn a file on disk
 * into an archive entry", shared by the CLI (`npm run media:import`) and the
 * drag-and-drop UI at /admin/media. Two copies would drift, and the copy that
 * drifts is the one that stops stripping GPS.
 *
 * The promises made here are the pipeline's promises:
 *
 *   1. The file at `file.path` is opened read-only and never written to.
 *   2. GPS, device serials and filesystem paths are removed BEFORE upload.
 *   3. Nothing throws to the caller — a bad file comes back as
 *      `{ status: 'failed', reason }` so a run of four hundred survives one
 *      corrupt photograph from 2011.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import sharp from 'sharp';

import { findItemNodeByHash } from './manifest.mjs';
import { readCaptureInfo } from './exif.mjs';
import { prepareImageForUpload } from './strip-metadata.mjs';
import { publicIdLeaf, uploadAsset } from './upload.mjs';
import { generateDerivatives, derivativeKey, originalKey } from './derivatives.mjs';
import {
  baseKeyFor,
  keyLeaf,
  putObject,
  uploadErrorMessage as r2ErrorMessage,
} from './r2.mjs';
import { warn } from './log.mjs';

/* ==========================================================================
   Per-file work
   ========================================================================== */

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * A 16px-wide WebP as a data URI — the blur that paints before the real
 * photograph arrives. Quality is dropped until it fits in roughly 500 bytes,
 * because this string is inlined into the HTML of every page that shows the
 * image and a fat one costs more than it saves.
 */
export async function makeLqip(buffer) {
  const base = sharp(buffer, { failOn: 'none', limitInputPixels: false }).resize(16, null, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  for (const quality of [35, 28, 20]) {
    const encoded = await base.clone().webp({ quality, effort: 6, alphaQuality: 60 }).toBuffer();
    const uri = `data:image/webp;base64,${encoded.toString('base64')}`;
    if (uri.length <= 520 || quality === 20) return uri;
  }
  return undefined;
}

/** Average colour as `#rrggbb`, read back from the placeholder — nearly free. */
async function averageColor(lqipDataUri) {
  if (!lqipDataUri) return undefined;
  try {
    const encoded = Buffer.from(lqipDataUri.split(',')[1], 'base64');
    const { data } = await sharp(encoded)
      .resize(1, 1, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const hex = (value) => value.toString(16).padStart(2, '0');
    return `#${hex(data[0])}${hex(data[1])}${hex(data[2])}`;
  } catch {
    return undefined;
  }
}

/**
 * Read, validate, strip and (unless this is a dry run) upload one file.
 *
 * Returns a plain record. Nothing here throws to the caller: a broken file
 * comes back as `{ status: 'failed', reason }` so the run continues.
 *
 * The original at `file.path` is opened with readFileSync and never touched
 * again. No branch of this function writes to disk.
 */
export async function processFile(file, context) {
  const { year, album, dryRun, force, targetFolder, seenHashes, doc } = context;

  let stats;
  try {
    stats = fs.statSync(file.path);
  } catch (err) {
    return { file, status: 'failed', reason: `cannot be read (${err.code || err.message})` };
  }
  if (stats.size === 0) {
    return { file, status: 'failed', reason: 'is empty (0 bytes)' };
  }

  let original;
  try {
    original = fs.readFileSync(file.path);
  } catch (err) {
    return { file, status: 'failed', reason: `cannot be read (${err.code || err.message})` };
  }

  // The dedupe key is the hash of the ORIGINAL bytes, not of the stripped
  // copy — stripping is deterministic, but the original is the thing that
  // actually identifies the photograph.
  const hash = sha256(original);

  // No await between the check and the insert, so two pool workers cannot
  // both claim the same duplicate.
  if (seenHashes.has(hash)) {
    return { file, status: 'duplicate', hash, reason: 'the same file appears twice in --dir' };
  }
  seenHashes.add(hash);

  const existingNode = findItemNodeByHash(doc, hash);
  if (existingNode && !force) {
    return {
      file,
      status: 'duplicate',
      hash,
      reason: `already in the manifest as ${existingNode.get('id')}`,
    };
  }

  const record = {
    file,
    hash,
    bytesRead: stats.size,
    type: file.kind,
    originalFilename: file.name,
  };

  /* --- images ---------------------------------------------------------- */

  if (file.kind === 'image') {
    let probe;
    try {
      probe = await sharp(original, { failOn: 'none', limitInputPixels: false }).metadata();
    } catch (err) {
      const heic = file.ext === '.heic' || file.ext === '.heif';
      return {
        file,
        status: 'failed',
        reason: heic
          ? 'HEIC could not be decoded — this build of sharp has no HEIF support. ' +
            'Export the photo as JPEG and import that.'
          : `could not be decoded by sharp (${err.message})`,
      };
    }
    if (!probe.width || !probe.height) {
      return { file, status: 'failed', reason: 'has no readable dimensions' };
    }

    const capture = await readCaptureInfo(original, stats);
    const orientation = capture.orientation ?? probe.orientation;

    let prepared;
    try {
      prepared = await prepareImageForUpload({
        buffer: original,
        extension: file.ext,
        orientation,
      });
    } catch (err) {
      return { file, status: 'failed', reason: `metadata could not be stripped (${err.message})` };
    }

    // Dimensions come from the prepared buffer: after a rotation is baked in,
    // a portrait photo's width and height have swapped.
    let finalMeta;
    try {
      finalMeta = await sharp(prepared.buffer, { failOn: 'none' }).metadata();
    } catch {
      finalMeta = {};
    }

    const lqip = await makeLqip(prepared.buffer).catch(() => undefined);
    const color = await averageColor(lqip);

    Object.assign(record, {
      width: finalMeta.width ?? probe.width,
      height: finalMeta.height ?? probe.height,
      capturedAt: capture.capturedAt,
      capturedAtInferred: capture.inferred,
      lqip,
      color,
      method: prepared.method,
      stripReason: prepared.reason,
      removed: prepared.removed,
      bytesSent: prepared.buffer.length,
      uploadExtension: prepared.extension,
    });

    /* --- R2: generate every size here, upload static files ------------ */

    if (context.target === 'r2') {
      const base = baseKeyFor(context.prefix, year, album, keyLeaf(file.name));

      if (dryRun) {
        return { ...record, status: 'would-upload', publicId: base };
      }

      try {
        const nativeWidth = record.width;
        const derived = await generateDerivatives(prepared.buffer, {
          nativeWidth,
          formats: context.formats,
        });

        const onRetry = ({ attempt, retries, delay, key }) =>
          warn(
            `${file.relative}: ${key} failed, retrying (${attempt}/${retries}) in ${Math.round(delay / 1000)}s`,
          );

        // Derivatives first. If any of them fails the manifest is never
        // written, so a half-uploaded photograph is not recorded as present.
        for (const output of derived.outputs) {
          const key = output.isFallback
            ? derivativeKey(base, output.width, 'jpeg')
            : derivativeKey(base, output.width, output.format);

          await putObject(context.s3, {
            bucket: context.bucket,
            key,
            body: output.buffer,
            contentType: output.contentType,
            onRetry,
          });
        }

        // The metadata-stripped full-resolution copy, kept as the "open
        // original" target and as one leg of the 3-2-1 backup. Skippable for
        // anyone who would rather not pay to store it twice.
        const originalExtension = (prepared.extension || file.ext || '.jpg').toLowerCase();

        if (context.keepOriginal !== false) {
          await putObject(context.s3, {
            bucket: context.bucket,
            key: originalKey(base, originalExtension),
            body: prepared.buffer,
            contentType: prepared.contentType || 'image/jpeg',
            onRetry,
          });
        }

        return {
          ...record,
          status: 'uploaded',
          publicId: base,
          variants: derived.widths,
          formats: derived.formats,
          // What the original was actually stored as. The strip step re-encodes
          // anything it cannot handle losslessly, so this is frequently not the
          // extension the file arrived with.
          originalExt: context.keepOriginal === false ? undefined : originalExtension,
          bytesSent: derived.totalBytes,
          existingNode: force ? existingNode : null,
        };
      } catch (err) {
        return { file, status: 'failed', reason: r2ErrorMessage(err) };
      }
    }

    /* --- Cloudinary ---------------------------------------------------- */

    if (dryRun) {
      return { ...record, status: 'would-upload', publicId: `${targetFolder}/${publicIdLeaf(file.name)}` };
    }

    try {
      const response = await uploadAsset({
        buffer: prepared.buffer,
        folder: targetFolder,
        publicId: publicIdLeaf(file.name),
        resourceType: 'image',
        originalFilename: file.name,
        force,
        onRetry: ({ attempt, retries, delay }) =>
          warn(
            `${file.relative}: upload failed, retrying (${attempt}/${retries}) in ${Math.round(delay / 1000)}s`,
          ),
      });

      return {
        ...record,
        status: 'uploaded',
        publicId: response.public_id,
        width: response.width || record.width,
        height: response.height || record.height,
        existingNode: force ? existingNode : null,
      };
    } catch (err) {
      return { file, status: 'failed', reason: uploadErrorMessage(err) };
    }
  }

  /* --- video ------------------------------------------------------------ */

  // Video goes up as it came off the camera. See VIDEO_METADATA_NOTE.
  const capture = await readCaptureInfo(null, stats, { readExif: false });

  Object.assign(record, {
    capturedAt: capture.capturedAt,
    capturedAtInferred: capture.inferred,
    bytesSent: stats.size,
    method: 'as-is',
    stripReason: 'video uploaded unchanged',
    removed: [],
  });

  if (dryRun) {
    return {
      ...record,
      status: 'would-upload',
      publicId: `${targetFolder}/${publicIdLeaf(file.name)}`,
    };
  }

  try {
    const response = await uploadAsset({
      filePath: file.path,
      folder: targetFolder,
      publicId: publicIdLeaf(file.name),
      resourceType: 'video',
      originalFilename: file.name,
      sizeBytes: stats.size,
      force,
      onRetry: ({ attempt, retries, delay }) =>
        warn(
          `${file.relative}: upload failed, retrying (${attempt}/${retries}) in ${Math.round(delay / 1000)}s`,
        ),
    });

    return {
      ...record,
      status: 'uploaded',
      publicId: response.public_id,
      // Dimensions and duration come from Cloudinary rather than from a local
      // ffmpeg, which the importer deliberately does not depend on.
      width: response.width || 1920,
      height: response.height || 1080,
      duration: typeof response.duration === 'number' ? Math.round(response.duration) : undefined,
      existingNode: force ? existingNode : null,
    };
  } catch (err) {
    return { file, status: 'failed', reason: uploadErrorMessage(err) };
  }
}

export function uploadErrorMessage(err) {
  const status = err?.http_code ?? err?.statusCode;
  const message = err?.message || String(err);
  if (status === 401 || status === 403) {
    return `upload rejected (${status}) — check CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET`;
  }
  if (status === 420 || status === 429) {
    return 'upload rate-limited by Cloudinary — try again with --concurrency 2';
  }
  return `upload failed${status ? ` (${status})` : ''}: ${message}`;
}