import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertDev, devOnlyResponse, IS_DEV } from '@/lib/admin/guard';
import { manifestLib, processLib, uploadLib, type ItemNode } from '@/lib/admin/pipeline';

/**
 * One file in, one archive entry out.
 *
 * Deliberately one file per request: the browser gets honest per-file progress
 * and one corrupt photograph out of four hundred fails alone. The client sends
 * a few of these concurrently.
 *
 * All the real work happens in scripts/lib/process.mjs — the same module the
 * CLI importer uses, so GPS stripping, hashing, dedupe and LQIP generation are
 * not reimplemented here and cannot drift.
 *
 * Development only. See src/lib/admin/guard.ts.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Uploading a few hundred megabytes of video should not be cut off at 30s.
export const maxDuration = 600;

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.avif', '.tif', '.tiff',
]);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);

/* --------------------------------------------------------------------------
   Manifest writes are serialised.

   Several uploads land at once, and each one appends to the same YAML document
   and then writes it. Without a lock, two responses read the same document and
   the second write silently drops the first entry. This chain makes the
   read-modify-write atomic within the process — which is all that is needed,
   because only one dev server ever holds this file.
   -------------------------------------------------------------------------- */
let manifestLock: Promise<unknown> = Promise.resolve();

function withManifestLock<T>(work: () => Promise<T> | T): Promise<T> {
  const run = manifestLock.then(work, work);
  // Keep the chain alive even if this link rejects.
  manifestLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function POST(request: Request): Promise<Response> {
  if (!IS_DEV) return devOnlyResponse();
  assertDev();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Expected a multipart upload.' }, 400);
  }

  const blob = form.get('file');
  const year = String(form.get('year') ?? '').trim();
  const albumRaw = String(form.get('album') ?? '').trim();
  const albumTitle = String(form.get('albumTitle') ?? '').trim();
  const force = String(form.get('force') ?? '') === 'true';

  if (!(blob instanceof File)) return json({ error: 'No file was sent.' }, 400);
  if (!/^\d{4}$/.test(year)) return json({ error: 'A four digit year is required.' }, 400);

  const name = path.basename(blob.name || 'upload');
  const ext = path.extname(name).toLowerCase();
  const kind = IMAGE_EXTENSIONS.has(ext) ? 'image' : VIDEO_EXTENSIONS.has(ext) ? 'video' : null;

  if (!kind) {
    return json(
      { name, status: 'failed', reason: `${ext || 'that file type'} is not a supported format.` },
      200,
    );
  }

  const [manifest, upload, processMod] = await Promise.all([
    manifestLib(),
    uploadLib(),
    processLib(),
  ]);

  // Credentials are read the same way the CLI reads them, so a missing key
  // fails here with the same message rather than halfway through a batch.
  upload.loadEnv();
  const credentials = upload.readCredentials();
  if (!credentials.cloudName || !credentials.apiKey || !credentials.apiSecret) {
    return json(
      {
        error:
          'Cloudinary credentials are missing. Add NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, ' +
          'CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to .env.local, then restart the dev server.',
      },
      400,
    );
  }
  upload.configureCloudinary();

  // The browser hands us bytes, not a path, and processFile works from a path
  // (video is streamed to Cloudinary rather than buffered). This temp copy is
  // ours; the visitor's original never moves.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dalibasor-upload-'));
  const tempPath = path.join(scratch, name);

  try {
    const bytes = Buffer.from(await blob.arrayBuffer());
    fs.writeFileSync(tempPath, bytes);

    const album = albumRaw ? manifest.slugify(albumRaw) : undefined;

    return await withManifestLock(async () => {
      const { doc, file: manifestFile } = manifest.loadManifestDoc(year);

      if (album) {
        manifest.addAlbum(doc, {
          slug: album,
          title: albumTitle || manifest.titleCase(album),
        });
      }

      const targetFolder = upload.folderFor(
        process.env.CLOUDINARY_FOLDER || upload.DEFAULT_FOLDER,
        year,
        album,
      );

      const result = await processMod.processFile(
        { path: tempPath, name, ext, kind, relative: name },
        {
          year: Number(year),
          album,
          dryRun: false,
          force,
          targetFolder,
          // Per-request dedupe set: cross-file duplicates are caught by the
          // manifest hash lookup inside processFile, which is the durable one.
          seenHashes: new Set<string>(),
          doc,
        },
      );

      if (result.status === 'failed' || result.status === 'duplicate') {
        return json({ name, status: result.status, reason: result.reason }, 200);
      }

      const number = manifest.nextItemNumber(doc, year, album);
      const id = manifest.formatItemId(year, album, number);

      // processFile returns the matching node only when --force replaced an
      // existing entry; otherwise this is a fresh item.
      const existing = (result.existingNode ?? null) as ItemNode | null;
      if (existing) {
        manifest.patchItemNode(existing, { ...result, year: Number(year), album });
      } else {
        manifest.addItem(
          doc,
          {
            id,
            type: result.type,
            year: Number(year),
            album,
            publicId: result.publicId,
            width: result.width,
            height: result.height,
            // R2 only: the sizes and formats actually written for this asset.
            variants: result.variants,
            formats: result.formats,
            capturedAt: result.capturedAt,
            duration: result.duration,
            lqip: result.lqip,
            color: result.color,
            originalFilename: result.originalFilename,
            hash: result.hash,
          },
          { capturedAtInferred: Boolean(result.capturedAtInferred) },
        );
      }

      manifest.saveManifestDoc(doc, manifestFile);

      return json(
        {
          name,
          status: 'uploaded',
          id: existing ? String(existing.get('id')) : id,
          publicId: result.publicId,
          width: result.width,
          height: result.height,
          type: result.type,
          lqip: result.lqip,
          color: result.color,
          capturedAt: result.capturedAt,
          method: result.method,
          removed: Array.isArray(result.removed) ? result.removed.length : 0,
        },
        200,
      );
    });
  } catch (error) {
    return json(
      { name, status: 'failed', reason: (error as Error).message || 'Unknown error.' },
      200,
    );
  } finally {
    // The temp copy exists only for the duration of the upload.
    try {
      fs.rmSync(scratch, { recursive: true, force: true });
    } catch {
      /* a leftover temp file is not worth failing a successful upload over */
    }
  }
}


function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
