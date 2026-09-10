import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import type {
  Album,
  ManifestItem,
  MediaItem,
  MediaOrientation,
  ResolvedAlbum,
  ResolvedYear,
  YearManifest,
  YearSummary,
} from '@/types/content';
import { slugify, toDateString } from '@/lib/utils';
import { CONTENT_ROOT, once } from './fs';

/**
 * The photo + video archive.
 *
 * One YAML file per year in /content/media. Portable, diffable, and readable by
 * a human twenty years from now with nothing but a text editor.
 *
 * Every year is parsed the first time anything asks for anything, and the whole
 * archive is parsed together. Measured, rather than assumed: a year holding 500
 * photographs is a 417KB file that takes about 835ms to parse. That is fine
 * once per build process, which is all a static build pays. It is emphatically
 * not fine per request, which is what a dev server would do without the cache
 * in ./fs.ts — see the note there, which exists because of exactly this.
 *
 * Everything downstream reads from these types. Nothing downstream knows which
 * provider the files are actually stored on.
 */

const MEDIA_DIR = path.join(CONTENT_ROOT, 'media');
const EVERYDAY_LABEL = 'Everyday';

/* ==========================================================================
   Parsing
   ========================================================================== */

const loadManifests = once((): Map<number, YearManifest> => {
  const manifests = new Map<number, YearManifest>();
  if (!fs.existsSync(MEDIA_DIR)) return manifests;

  const files = fs
    .readdirSync(MEDIA_DIR)
    .filter((name) => /^\d{4}\.ya?ml$/i.test(name))
    .sort();

  for (const name of files) {
    const full = path.join(MEDIA_DIR, name);
    const year = Number.parseInt(name.slice(0, 4), 10);

    let parsed: unknown;
    try {
      parsed = YAML.parse(fs.readFileSync(full, 'utf8'));
    } catch (error) {
      throw new Error(
        `Could not parse content/media/${name}: ${(error as Error).message}\n` +
          'Run `npm run media:check` to find the bad entry.',
      );
    }

    manifests.set(year, normalizeManifest(year, parsed, `content/media/${name}`));
  }

  return manifests;
});

function normalizeManifest(year: number, raw: unknown, source: string): YearManifest {
  const input = (raw ?? {}) as {
    note?: string;
    cover?: string;
    albums?: Album[];
    items?: ManifestItem[];
  };

  const albums: Album[] = Array.isArray(input.albums)
    ? input.albums
        .filter((album): album is Album => Boolean(album?.slug))
        .map((album) => ({
          ...album,
          slug: slugify(album.slug),
          title: album.title || album.slug,
          /* A date has to come out of here as a string, whatever went in.
             YAML types a bare `date: 2019` as a number and a bare
             `date: 2019-07-15` as a Date depending on the schema, and album
             ordering calls .localeCompare on it — so one unquoted year in one
             hand-edited manifest took out the whole photographs section with
             "a.date.localeCompare is not a function". The file tells you to
             quote it; this makes that advice rather than a requirement. */
          date: album.date === undefined ? undefined : toDateString(album.date) || undefined,
        }))
    : [];

  const albumSlugs = new Set(albums.map((album) => album.slug));

  const items: MediaItem[] = Array.isArray(input.items)
    ? input.items
        .filter((item): item is ManifestItem => Boolean(item?.publicId))
        .map((item, index) => normalizeItem(item, year, index, albumSlugs, source))
    : [];

  // The same guard writing.ts applies to slugs. An id addresses a photograph in
  // the lightbox and in a shared ?photo= link, so a repeat makes one of the two
  // unreachable forever — and it is exactly what a hand-edit or a split year
  // file introduces without anyone noticing.
  const seenIds = new Map<string, number>();
  for (const [index, item] of items.entries()) {
    const first = seenIds.get(item.id);
    if (first !== undefined) {
      throw new Error(
        `Duplicate media id "${item.id}" in ${source}, at items[${first}] and items[${index}]. ` +
          'Ids are permanent addresses. Run `npm run media:check` to find them all.',
      );
    }
    seenIds.set(item.id, index);
  }

  return {
    year,
    note: input.note,
    cover: input.cover,
    albums,
    items,
  };
}

function normalizeItem(
  item: ManifestItem,
  year: number,
  index: number,
  albumSlugs: Set<string>,
  source: string,
): MediaItem {
  // Provenance stays in the manifest and out of the browser. `originalFilename`
  // and `hash` are read by media:backup and the importer, straight from the
  // YAML; nothing rendered has ever used them. Left in, they ride along in the
  // payload of every page that shows a photograph — and the filenames are the
  // one field here that describes a private disk rather than a photograph.
  const { originalFilename: _f, originalExt: _e, hash: _h, ...rest } = item;

  const width = Number(rest.width) || 0;
  const height = Number(rest.height) || 0;
  const album = rest.album ? slugify(rest.album) : undefined;

  if (album && !albumSlugs.has(album)) {
    // Not fatal — an orphaned item still belongs to the year. But say so, or
    // photographs quietly vanish from the album they were meant for.
    console.warn(
      `[media] ${source}: item "${rest.id ?? rest.publicId}" references unknown album ` +
        `"${album}". It will appear in the year's everyday photographs instead.`,
    );
  }

  return {
    ...rest,
    id: rest.id || `${year}-${album ?? 'everyday'}-${String(index + 1).padStart(4, '0')}`,
    type: rest.type === 'video' ? 'video' : 'image',
    year,
    album: album && albumSlugs.has(album) ? album : undefined,
    width: width || 1600,
    height: height || 1067,
    orientation: orientationOf(width, height),
  };
}

function orientationOf(width: number, height: number): MediaOrientation {
  if (!width || !height) return 'landscape';
  const ratio = width / height;
  if (ratio > 1.06) return 'landscape';
  if (ratio < 0.94) return 'portrait';
  return 'square';
}

/* ==========================================================================
   Ordering
   ========================================================================== */

/**
 * Chronological where we know the capture time, stable everywhere else.
 * Items with no EXIF date sort by id, which the importer assigns in filename
 * order — so a Snapchat export with no metadata still comes out in sequence.
 */
function compareItems(a: MediaItem, b: MediaItem): number {
  if (a.capturedAt && b.capturedAt) {
    const delta = a.capturedAt.localeCompare(b.capturedAt);
    if (delta !== 0) return delta;
  } else if (a.capturedAt) {
    return -1;
  } else if (b.capturedAt) {
    return 1;
  }
  return a.id.localeCompare(b.id);
}

function compareAlbums(a: ResolvedAlbum, b: ResolvedAlbum): number {
  if (a.date && b.date) {
    const delta = a.date.localeCompare(b.date);
    if (delta !== 0) return delta;
  } else if (a.date) {
    return -1;
  } else if (b.date) {
    return 1;
  }
  return a.title.localeCompare(b.title);
}

/* ==========================================================================
   Resolution
   ========================================================================== */

/* Hiding happens once, here, and everything downstream sees an archive that
   simply does not contain the hidden thing.
   --------------------------------------------------------------------------
   Deliberately not filtered per-page. Counts, the timeline, "from the
   archive", the search index, the sitemap and the lightbox all read from this
   one resolution, and a filter applied at four of those six is the version
   where a photograph you hid still shows up in a count, or is still reachable
   by arrowing to it. Removing it at the source is the only way to be sure.

   Hidden also applies in development. Drafts are visible while writing because
   the point of a draft is to look at it; the point of hiding a photograph is
   that it is not on the site, and a tool that shows it anyway invites exactly
   the mistake it exists to prevent. The admin reads the raw manifest, so that
   is where hidden things stay visible. */
const resolveAll = once((): Map<number, ResolvedYear> => {
  const resolved = new Map<number, ResolvedYear>();

  for (const [year, manifest] of loadManifests()) {
    const byAlbum = new Map<string, MediaItem[]>();
    const everyday: MediaItem[] = [];

    // An item inside a hidden album is hidden too, whatever it says itself.
    const hiddenAlbums = new Set(
      manifest.albums.filter((album) => album.hidden).map((album) => album.slug),
    );

    const visibleItems = manifest.items.filter(
      (item) => !item.hidden && !(item.album && hiddenAlbums.has(item.album)),
    );

    for (const item of visibleItems) {
      if (item.album) {
        const bucket = byAlbum.get(item.album);
        if (bucket) bucket.push(item);
        else byAlbum.set(item.album, [item]);
      } else {
        everyday.push(item);
      }
    }

    everyday.sort(compareItems);

    const albums: ResolvedAlbum[] = manifest.albums
      .filter((album) => !album.hidden)
      .map((album) => {
        const items = (byAlbum.get(album.slug) ?? []).sort(compareItems);
        return {
          ...album,
          year,
          href: `/photos/${year}/${album.slug}`,
          items,
          photoCount: items.filter((item) => item.type === 'image').length,
          videoCount: items.filter((item) => item.type === 'video').length,
          coverItem: pickCover(album.cover, items),
        };
      })
      .sort(compareAlbums);

    const allItems = visibleItems;

    resolved.set(year, {
      year,
      href: `/photos/${year}`,
      note: manifest.note,
      coverItem: pickCover(manifest.cover, [...everyday, ...allItems]),
      albums,
      everyday,
      photoCount: allItems.filter((item) => item.type === 'image').length,
      videoCount: allItems.filter((item) => item.type === 'video').length,
      totalCount: allItems.length,
    });
  }

  return resolved;
});

/** Cover can be a media id or a raw provider public id. Falls back to the first image. */
function pickCover(cover: string | undefined, items: MediaItem[]): MediaItem | undefined {
  if (cover) {
    const match = items.find((item) => item.id === cover || item.publicId === cover);
    if (match) return match;
  }
  return items.find((item) => item.type === 'image') ?? items[0];
}

/* ==========================================================================
   Public API
   ========================================================================== */

/** Years that have a manifest, newest first. */
export function getArchiveYears(): number[] {
  return [...resolveAll().keys()].sort((a, b) => b - a);
}

export function getYear(year: number): ResolvedYear | undefined {
  return resolveAll().get(year);
}

export function getYearSummaries(): YearSummary[] {
  return getArchiveYears().map((year) => {
    const resolved = resolveAll().get(year)!;
    return {
      year,
      href: resolved.href,
      note: resolved.note,
      coverItem: resolved.coverItem,
      albumCount: resolved.albums.length,
      photoCount: resolved.photoCount,
      videoCount: resolved.videoCount,
      totalCount: resolved.totalCount,
      preview: previewItems(resolved, 5),
    };
  });
}

/**
 * A handful of representative items for a year, preferring anything marked
 * featured and otherwise spreading the pick across the year so the preview is
 * not five photographs from the same afternoon.
 */
function previewItems(year: ResolvedYear, count: number): MediaItem[] {
  const all = [...year.everyday, ...year.albums.flatMap((album) => album.items)];
  const featured = all.filter((item) => item.featured);
  if (featured.length >= count) return featured.slice(0, count);

  const pool = all.filter((item) => !item.featured && item.type === 'image');
  const stride = Math.max(1, Math.floor(pool.length / Math.max(1, count - featured.length)));
  const spread: MediaItem[] = [];
  for (let i = 0; i < pool.length && spread.length < count - featured.length; i += stride) {
    spread.push(pool[i]!);
  }

  return [...featured, ...spread].slice(0, count);
}

export function getAlbum(year: number, slug: string): ResolvedAlbum | undefined {
  return resolveAll()
    .get(year)
    ?.albums.find((album) => album.slug === slug);
}

export function getAlbums(year: number): ResolvedAlbum[] {
  return resolveAll().get(year)?.albums ?? [];
}

/** Every album across every year, newest year first. */
export function getAllAlbums(): ResolvedAlbum[] {
  return getArchiveYears().flatMap((year) => getAlbums(year));
}

/** `[{ year, album }]` for `generateStaticParams`. */
export function getAlbumParams(): { year: string; album: string }[] {
  return getAllAlbums().map((album) => ({
    year: String(album.year),
    album: album.slug,
  }));
}

export function getAllMediaItems(): MediaItem[] {
  return getArchiveYears().flatMap((year) => {
    const resolved = resolveAll().get(year)!;
    return [...resolved.everyday, ...resolved.albums.flatMap((album) => album.items)];
  });
}

export function getFeaturedMedia(
  limit = 12,
  type: 'image' | 'video' | 'any' = 'image',
): MediaItem[] {
  // Images by default. Both callers hand the result to something that renders
  // an <img> — the homepage hero and "from the archive" — so a clip marked
  // featured used to become a broken hero image, and on the homepage that is
  // the LCP element. Nothing in the manifest stops you ticking Featured on a
  // video, so the filter belongs here rather than at each call site.
  return getAllMediaItems()
    .filter((item) => item.featured && (type === 'any' || item.type === type))
    .slice(0, limit);
}

/**
 * Every item in the archive, addressable by either handle.
 *
 * Built once instead of scanned per lookup. The scan version was quadratic in
 * a way that only shows up years in: every post, project and Now entry with a
 * cover walks the whole archive, so the cost is posts × photographs. At seven
 * posts and six photographs that is free; at 400 posts and 10,000 photographs
 * it is four million comparisons per render.
 */
const byRef = once((): Map<string, MediaItem> => {
  const index = new Map<string, MediaItem>();
  for (const item of getAllMediaItems()) {
    // Id first, so it wins if a public id ever collides with one.
    if (!index.has(item.publicId)) index.set(item.publicId, item);
    index.set(item.id, item);
  }
  return index;
});

/**
 * Look up one media item by whichever handle you have.
 *
 * Frontmatter refers to photographs by provider public id (`coverImage:
 * dalibasor/2026/serbia/img_0042`); the lightbox and covers refer to them by
 * archive id (`2026-serbia-0007`). Both are stable, and callers should not have
 * to know which they are holding.
 *
 * This matters more than it looks. Without it, a cover referenced only by
 * public id has no manifest entry behind it, so nothing knows which widths and
 * formats exist — and under R2 that means every article hero and every in-post
 * photograph degrades to the single 1024px JPEG fallback, with no srcSet and no
 * AVIF, on a page where the hero is the LCP element.
 */
export function findMediaByRef(ref: string | undefined): MediaItem | undefined {
  if (!ref) return undefined;
  return byRef().get(ref);
}


export function getArchiveTotals(): {
  photos: number;
  videos: number;
  albums: number;
  years: number;
  firstYear: number;
  lastYear: number;
} {
  const years = getArchiveYears();
  const resolved = years.map((year) => resolveAll().get(year)!);
  return {
    photos: resolved.reduce((sum, year) => sum + year.photoCount, 0),
    videos: resolved.reduce((sum, year) => sum + year.videoCount, 0),
    albums: resolved.reduce((sum, year) => sum + year.albums.length, 0),
    years: years.length,
    firstYear: years.length > 0 ? years[years.length - 1]! : new Date().getUTCFullYear(),
    lastYear: years.length > 0 ? years[0]! : new Date().getUTCFullYear(),
  };
}

export { EVERYDAY_LABEL };
