import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

import type {
  Album,
  MediaItem,
  MediaOrientation,
  ResolvedAlbum,
  ResolvedYear,
  YearManifest,
  YearSummary,
} from '@/types/content';
import { slugify } from '@/lib/utils';
import { CONTENT_ROOT, once } from './fs';

/**
 * The photo + video archive.
 *
 * One YAML file per year in /content/media. Portable, diffable, and readable
 * by a human twenty years from now with nothing but a text editor. A year with
 * 500 photographs is roughly a 200KB file — small enough to parse eagerly, and
 * the parse happens once per build process.
 *
 * Everything downstream reads from these types, never from Cloudinary.
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
  const input = (raw ?? {}) as Partial<YearManifest>;

  const albums: Album[] = Array.isArray(input.albums)
    ? input.albums
        .filter((album): album is Album => Boolean(album?.slug))
        .map((album) => ({
          ...album,
          slug: slugify(album.slug),
          title: album.title || album.slug,
        }))
    : [];

  const albumSlugs = new Set(albums.map((album) => album.slug));

  const items: MediaItem[] = Array.isArray(input.items)
    ? input.items
        .filter((item): item is MediaItem => Boolean(item?.publicId))
        .map((item, index) => normalizeItem(item, year, index, albumSlugs, source))
    : [];

  return {
    year,
    note: input.note,
    cover: input.cover,
    albums,
    items,
  };
}

function normalizeItem(
  item: MediaItem,
  year: number,
  index: number,
  albumSlugs: Set<string>,
  source: string,
): MediaItem {
  const width = Number(item.width) || 0;
  const height = Number(item.height) || 0;
  const album = item.album ? slugify(item.album) : undefined;

  if (album && !albumSlugs.has(album)) {
    // Not fatal — an orphaned item still belongs to the year. But say so, or
    // photographs quietly vanish from the album they were meant for.
    console.warn(
      `[media] ${source}: item "${item.id ?? item.publicId}" references unknown album ` +
        `"${album}". It will appear in the year's everyday photographs instead.`,
    );
  }

  return {
    ...item,
    id: item.id || `${year}-${album ?? 'everyday'}-${String(index + 1).padStart(4, '0')}`,
    type: item.type === 'video' ? 'video' : 'image',
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

const resolveAll = once((): Map<number, ResolvedYear> => {
  const resolved = new Map<number, ResolvedYear>();

  for (const [year, manifest] of loadManifests()) {
    const byAlbum = new Map<string, MediaItem[]>();
    const everyday: MediaItem[] = [];

    for (const item of manifest.items) {
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

    const allItems = manifest.items;

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

export function getFeaturedMedia(limit = 12): MediaItem[] {
  return getAllMediaItems()
    .filter((item) => item.featured)
    .slice(0, limit);
}

/** Look up a single item anywhere in the archive — used by deep-linked lightboxes. */
export function getMediaItem(id: string): MediaItem | undefined {
  return getAllMediaItems().find((item) => item.id === id);
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
