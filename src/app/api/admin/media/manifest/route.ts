import fs from 'node:fs';
import { adminAvailable, devOnlyResponse } from '@/lib/admin/guard';
import { invalidateContent } from '@/lib/content/fs';
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
const EDITABLE_ITEM_FIELDS = [
  'caption',
  'alt',
  'location',
  'featured',
  'hidden',
] as const;

type ItemEdit = {
  id: string;
  caption?: string;
  alt?: string;
  location?: string;
  featured?: boolean;
  hidden?: boolean;
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

/** Album fields this endpoint will write. `slug` is the URL and is set once. */
type AlbumEdit = {
  slug: string;
  title?: string;
  subtitle?: string;
  date?: string;
  location?: string;
  note?: string;
  featured?: boolean;
  hidden?: boolean;
};

type Payload = {
  /**
   * Omitted means "save item edits", which is what this route did before it
   * could do anything else. The named actions exist so that creating a year or
   * an album is a deliberate request rather than a side effect of saving.
   */
  action?: 'create-year' | 'save-album' | 'delete-album' | 'delete-year';
  year?: string;
  items?: ItemEdit[];
  note?: string;
  cover?: string;
  album?: AlbumEdit;
};

export async function POST(request: Request): Promise<Response> {
  if (!(await adminAvailable())) return devOnlyResponse();

  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Expected JSON.' }, 400);
  }

  const year = String(payload.year ?? '');
  if (!/^\d{4}$/.test(year))
    return json({ error: 'A four digit year is required.' }, 400);

  const manifest = await manifestLib();
  const { doc, file, existed } = manifest.loadManifestDoc(year);

  /* --- create a year ---------------------------------------------------
     loadManifestDoc already returns a usable empty document when the file is
     absent, so this is only a save. Worth having as its own action all the
     same: setting up 2019 before the photographs are scanned is a real thing
     to want, and until now the only way to get a year was to upload into it. */
  if (payload.action === 'create-year') {
    if (existed) {
      return json({ ok: true, created: false, file: manifest.displayPath(file) });
    }
    manifest.saveManifestDoc(doc, file);
    invalidateContent();
    return json({ ok: true, created: true, file: manifest.displayPath(file) });
  }

  /* --- create or update an album --------------------------------------- */
  if (payload.action === 'save-album') {
    const raw = String(payload.album?.slug ?? '').trim();
    if (!raw) return json({ error: 'An album needs a slug.' }, 400);

    // Slugified here rather than trusted: the slug is a permanent URL, and the
    // site slugifies it again on read, so anything else would silently produce
    // an album whose links do not match its own address.
    const slug = manifest.slugify(raw);
    if (!slug) return json({ error: `"${raw}" does not reduce to a usable slug.` }, 400);

    const fields = {
      title: payload.album?.title?.trim() || manifest.titleCase(slug),
      subtitle: payload.album?.subtitle?.trim() ?? '',
      date: payload.album?.date?.trim() ?? '',
      location: payload.album?.location?.trim() ?? '',
      note: payload.album?.note?.trim() ?? '',
      featured: Boolean(payload.album?.featured),
      hidden: Boolean(payload.album?.hidden),
    };

    if (fields.date && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(fields.date)) {
      return json({ error: `"${fields.date}" is not YYYY, YYYY-MM or YYYY-MM-DD.` }, 400);
    }

    const created = manifest.addAlbum(doc, { slug, ...fields });
    if (!created) manifest.updateAlbum(doc, slug, fields);

    manifest.saveManifestDoc(doc, file);
    invalidateContent();

    return json({
      ok: true,
      created,
      slug,
      href: `/photos/${year}/${slug}`,
      file: manifest.displayPath(file),
    });
  }

  /* --- delete an album --------------------------------------------------
     The photographs are not deleted. They move from "in this album" to "in
     this year", their files stay in the bucket, and their manifest entries
     stay exactly as they were apart from losing the album key. Removing a
     photograph is a separate decision taken one at a time, and this is not
     it — which is also why there is no "delete everything in here" button. */
  if (payload.action === 'delete-album') {
    const slug = String(payload.album?.slug ?? '').trim();
    if (!slug) return json({ error: 'Which album?' }, 400);

    const result = manifest.removeAlbum(doc, slug);
    if (!result) return json({ error: `No album called "${slug}" in ${year}.` }, 404);

    manifest.saveManifestDoc(doc, file);
    invalidateContent();

    return json({
      ok: true,
      moved: result.moved,
      file: manifest.displayPath(file),
    });
  }

  /* --- delete a year ----------------------------------------------------
     Only when it is empty. A year manifest is the only record of what every
     photograph in it is called, where it sits in the bucket, and what was
     written about it — the files would survive and become unreachable, which
     is the worst of both outcomes. Emptying it first is a deliberate act;
     deleting it should not be able to become an accidental one. */
  if (payload.action === 'delete-year') {
    const data = (manifest.readManifestFile(file) ?? {}) as {
      albums?: unknown[];
      items?: unknown[];
    };
    const items = data.items?.length ?? 0;
    const albums = data.albums?.length ?? 0;

    if (items > 0 || albums > 0) {
      return json(
        {
          error:
            `${year} still holds ${items} photograph(s) and ${albums} album(s). ` +
            'Remove those first — deleting the manifest would leave their files in ' +
            'the bucket with nothing left to say what they are.',
        },
        409,
      );
    }

    fs.rmSync(file, { force: true });
    invalidateContent();

    return json({ ok: true, deleted: manifest.displayPath(file) });
  }

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

  // The loaders cache parsed content; tell them the archive just moved. The
  // dev watcher would catch this too, but a CMS that shows a stale page after
  // a successful save is the exact bug that cache has to not reintroduce, so
  // it does not rely on a filesystem event arriving in time.
  invalidateContent();

  return json({ ok: true, changed, file: manifest.displayPath(file) });
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
