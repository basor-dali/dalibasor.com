import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { adminAvailable, devOnlyResponse } from '@/lib/admin/guard';
import { invalidateContent } from '@/lib/content/fs';
import { manifestLib, processLib, targetLib, type ItemNode } from '@/lib/admin/pipeline';

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

/* No `maxDuration` here, and it is worth saying why it was removed rather than
   lowered.

   It was set to 600, reasoning that uploading a few hundred megabytes of video
   should not be cut off after thirty seconds. That reasoning was sound and the
   setting was in the wrong place twice over. `maxDuration` is a deployment
   directive read when Vercel builds a serverless function; the dev server does
   not consult it, and the dev server is the only place this route does
   anything, because `adminAvailable()` returns false in production and every
   request 404s.

   So it did nothing where uploads actually happen, and the one thing it did do
   was fail the build: Vercel's hobby plan permits at most 300, and a route that
   asks for more than the plan allows stops the whole deployment. A long upload
   in development is bounded by nothing but the machine. */

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
  if (!(await adminAvailable())) return devOnlyResponse();

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
  if (!/^\d{4}$/.test(year))
    return json({ error: 'A four digit year is required.' }, 400);

  const name = path.basename(blob.name || 'upload');
  const ext = path.extname(name).toLowerCase();
  const kind = IMAGE_EXTENSIONS.has(ext)
    ? 'image'
    : VIDEO_EXTENSIONS.has(ext)
      ? 'video'
      : null;

  if (!kind) {
    return json(
      {
        name,
        status: 'failed',
        reason: `${ext || 'that file type'} is not a supported format.`,
      },
      200,
    );
  }

  const [manifest, targetMod, processMod] = await Promise.all([
    manifestLib(),
    targetLib(),
    processLib(),
  ]);

  const album = albumRaw ? manifest.slugify(albumRaw) : undefined;

  // Exactly the resolution the CLI performs — same module, same rules. This
  // route used to hardcode Cloudinary, so on an R2 archive it uploaded to the
  // wrong backend and wrote manifest entries the site renders as 404s.
  let destination;
  try {
    destination = targetMod.resolveTarget({ year, album, kind, dryRun: false });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }

  // The browser hands us bytes, not a path, and processFile works from a path
  // (video is streamed to Cloudinary rather than buffered). This temp copy is
  // ours; the visitor's original never moves.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dalibasor-upload-'));
  // basename already removed any directory part; this also refuses the two
  // names that are directories rather than files, which would otherwise turn
  // the write into an EISDIR at the end of a long upload.
  const tempPath = path.join(scratch, name === '.' || name === '..' ? 'upload' : name);

  try {
    /* Do not "improve" this into a stream. I tried; it is worse.
       --------------------------------------------------------------------
       Streaming the upload to disk looks obviously better than materialising
       it — but `await request.formData()` above has already parsed the whole
       body into memory before this line is reached. The peak is set there and
       nothing here can lower it; anything that re-reads the bytes only adds a
       second copy.

       Measured on a 200MB file parsed from a real multipart body, peak RSS
       above the point where formData() had already finished:

         arrayBuffer + writeFileSync    +0 MB    1715 ms
         arrayBuffer + await writeFile  +401 MB   938 ms
         stream + pipeline              +201 MB  1660 ms

       arrayBuffer() hands back the bytes undici already holds, so it costs
       nothing. blob.stream() copies them.

       Genuinely bounding the memory means not using request.formData() at
       all — parsing the multipart stream by hand, or taking the file as a raw
       body with its metadata in headers. That is a real change and this is a
       localhost-only tool used by one person, so it has not been made; the
       ceiling is roughly three files at once, which is what the client
       sends. */
    const bytes = Buffer.from(await blob.arrayBuffer());
    fs.writeFileSync(tempPath, bytes);

    return await withManifestLock(async () => {
      const { doc, file: manifestFile } = manifest.loadManifestDoc(year);

      if (album) {
        manifest.addAlbum(doc, {
          slug: album,
          title: albumTitle || manifest.titleCase(album),
        });
      }

      const result = await processMod.processFile(
        { path: tempPath, name, ext, kind, relative: name },
        {
          year: Number(year),
          album,
          dryRun: false,
          force,
          targetFolder: destination.targetFolder,
          target: destination.target,
          s3: destination.s3,
          bucket: destination.bucket,
          prefix: destination.prefix,
          formats: destination.formats,
          keepOriginal: destination.keepOriginal,
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
            originalExt: result.originalExt,
            hash: result.hash,
          },
          { capturedAtInferred: Boolean(result.capturedAtInferred) },
        );
      }

      manifest.saveManifestDoc(doc, manifestFile);

      // The loaders cache parsed content; tell them the archive just moved.
      // The dev watcher would catch this too, but an upload whose album page
      // still 404s afterwards is the exact bug that cache has to not
      // reintroduce, so it does not rely on a filesystem event arriving first.
      invalidateContent();

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
