import { adminAvailable, devOnlyResponse } from '@/lib/admin/guard';
import { manifestLib } from '@/lib/admin/pipeline';

/**
 * Read a year manifest, and save edits to the fields that are Dali's words:
 * caption, alt text, location, featured, plus album and year covers and notes.
 *
 * Technical fields — publicId, dimensions, hash, lqip — are never written from
 * here. Those belong to the importer, and letting a form overwrite them is how
 * an archive quietly loses the ability to render itself.
 *
 * Development only. See src/lib/admin/guard.ts.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The only item fields this endpoint will write. */
const EDITABLE_ITEM_FIELDS = ['caption', 'alt', 'location', 'featured'] as const;

type ItemEdit = {
  id: string;
  caption?: string;
  alt?: string;
  location?: string;
  featured?: boolean;
};

export async function GET(request: Request): Promise<Response> {
  if (!(await adminAvailable())) return devOnlyResponse();

  const year = new URL(request.url).searchParams.get('year');
  const manifest = await manifestLib();

  // No year: list what exists, so the UI can offer the years and albums.
  if (!year) {
    const files = manifest.listManifestFiles();
    const years = files.map((file) => {
      const match = /(\d{4})\.ya?ml$/.exec(file);
      const value = match ? Number(match[1]) : 0;
      const data = manifest.readManifestFile(file) as {
        albums?: { slug: string; title?: string }[];
        items?: unknown[];
      } | null;
      return {
        year: value,
        albums: (data?.albums ?? []).map((album) => ({
          slug: album.slug,
          title: album.title ?? album.slug,
        })),
        itemCount: data?.items?.length ?? 0,
      };
    });
    return json({ years: years.sort((a, b) => b.year - a.year) });
  }

  if (!/^\d{4}$/.test(year)) return json({ error: 'Invalid year.' }, 400);

  const file = manifest.findManifestPath(year);
  if (!file) return json({ year: Number(year), albums: [], items: [], exists: false });

  const data = manifest.readManifestFile(file) as Record<string, unknown> | null;
  return json({
    year: Number(year),
    exists: true,
    note: data?.note ?? '',
    cover: data?.cover ?? '',
    albums: data?.albums ?? [],
    items: data?.items ?? [],
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!(await adminAvailable())) return devOnlyResponse();

  let payload: { year?: string; items?: ItemEdit[]; note?: string; cover?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Expected JSON.' }, 400);
  }

  const year = String(payload.year ?? '');
  if (!/^\d{4}$/.test(year))
    return json({ error: 'A four digit year is required.' }, 400);

  const manifest = await manifestLib();
  const { doc, file } = manifest.loadManifestDoc(year);

  let changed = 0;

  for (const edit of payload.items ?? []) {
    if (!edit?.id) continue;
    const node = manifest.findItemNodeById(doc, edit.id);
    if (!node) continue;

    for (const field of EDITABLE_ITEM_FIELDS) {
      if (!(field in edit)) continue;
      const value = edit[field];

      // An empty string means "remove this key" rather than "store nothing" —
      // the loaders treat a missing field and an empty one differently, and a
      // file full of `caption: ''` is unreadable.
      if (value === '' || value === undefined || value === null || value === false) {
        node.delete(field);
      } else {
        node.set(field, value);
      }
      changed += 1;
    }
  }

  if (typeof payload.note === 'string') {
    if (payload.note.trim()) doc.set('note', payload.note.trim());
    else doc.delete('note');
    changed += 1;
  }

  if (typeof payload.cover === 'string') {
    if (payload.cover.trim()) doc.set('cover', payload.cover.trim());
    else doc.delete('cover');
    changed += 1;
  }

  manifest.saveManifestDoc(doc, file);

  return json({ ok: true, changed, file: manifest.displayPath(file) });
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
