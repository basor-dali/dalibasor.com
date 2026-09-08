import 'server-only';

import type { MediaItem, SearchDoc } from '@/types/content';
import {
  STATUS_LABELS,
  getAllAlbums,
  getAllNowWithBodies,
  getAllPages,
  getAllPostsWithBodies,
  getAllProjectsWithBodies,
  getYearSummaries,
} from '@/lib/content';
import {
  formatDate,
  formatPeriod,
  isoDate,
  pluralize,
  truncate,
  yearOf,
} from '@/lib/utils';

/**
 * The search index.
 *
 * One flat array of `SearchDoc`, built at build time and served as a static
 * JSON file. The client downloads it on first interaction and filters in
 * memory — no server, no service, nothing that has to keep running for the
 * next twenty years.
 *
 * The only real constraint is payload size, so every body is truncated. A
 * thousand-word essay contributes its first ~1200 characters: enough for a
 * match to be found and a snippet to be shown, not enough to turn the index
 * into a second copy of the site.
 */

/** Characters of body text kept per document. */
const BODY_LIMIT = 1200;
/** Photo captions are short and numerous — they get a smaller budget. */
const CAPTION_LIMIT = 700;

/* ==========================================================================
   Text
   ========================================================================== */

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function clip(value: string, limit = BODY_LIMIT): string {
  return truncate(collapse(value), limit);
}

/**
 * The searchable blob for one document.
 *
 * It always *starts* with the collapsed, lowercased title. The client relies
 * on that: it skips past the title when hunting for a snippet, so a result
 * never shows you its own heading twice.
 */
function searchable(
  title: string,
  parts: Array<string | number | undefined | null | false>,
): string {
  const pieces = [title, ...parts]
    .map((part) => (typeof part === 'number' ? String(part) : part))
    .filter((part): part is string => Boolean(part && part.trim()));
  return collapse(pieces.join(' · ')).toLowerCase();
}

function titleize(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function joinMeta(parts: Array<string | undefined | null | false>): string | undefined {
  const present = parts.filter((part): part is string => Boolean(part && part.trim()));
  return present.length > 0 ? present.join(' · ') : undefined;
}

/** `48 photographs · 3 films` — omits whichever half is zero. */
function frameCount(photos: number, videos: number): string | undefined {
  const parts: string[] = [];
  if (photos > 0) parts.push(pluralize(photos, 'photograph'));
  if (videos > 0) parts.push(pluralize(videos, 'film'));
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** Captions and locations from a run of media, deduped, as one string. */
function captionsOf(items: MediaItem[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  let length = 0;

  for (const item of items) {
    for (const value of [item.caption, item.location]) {
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
      length += value.length + 3;
      // Stop well before the clip limit — no point building a megabyte string
      // only to throw most of it away.
      if (length > CAPTION_LIMIT * 2) return out.join(' · ');
    }
  }

  return out.join(' · ');
}

/* ==========================================================================
   Standalone pages
   ==========================================================================
   One-off pages live at the root of the site. `about` is the only one with a
   route today; anything added later follows the same shape. */

const PAGE_HREFS: Record<string, string> = {
  about: '/about',
};

function pageHref(slug: string): string {
  return PAGE_HREFS[slug] ?? `/${slug}`;
}

/* ==========================================================================
   The index
   ========================================================================== */

export function buildSearchIndex(): SearchDoc[] {
  const docs: SearchDoc[] = [];

  /* --- writing --------------------------------------------------------- */

  for (const post of getAllPostsWithBodies()) {
    docs.push({
      id: `post:${post.slug}`,
      kind: 'post',
      title: post.title,
      href: post.href,
      meta: joinMeta([
        formatDate(post.date),
        `${post.readingMinutes} min read`,
        post.location,
      ]),
      tags: post.tags,
      year: post.year,
      date: isoDate(post.date),
      /* Prose first, metadata last. The client cuts its snippet at the first
         match after the title, so putting the writing ahead of the tags and
         the date means a snippet usually shows a sentence rather than a
         filing label. */
      text: searchable(post.title, [
        post.subtitle,
        post.excerpt,
        clip(post.plain),
        post.location,
        // The written-out date, so `august` and `2019` are searchable words.
        // In an archive this long, the year is one of the likeliest queries.
        formatDate(post.date),
        post.tags.join(' '),
      ]),
    });
  }

  /* --- projects -------------------------------------------------------- */

  for (const project of getAllProjectsWithBodies()) {
    docs.push({
      id: `project:${project.slug}`,
      kind: 'project',
      title: project.title,
      href: project.href,
      meta: joinMeta([STATUS_LABELS[project.status], project.period]),
      tags: project.technologies,
      year: yearOf(project.startDate),
      date: isoDate(project.endDate ?? project.startDate),
      text: searchable(project.title, [
        project.description,
        clip(project.plain),
        STATUS_LABELS[project.status],
        // `2023 — 2025`, so the years a project ran are searchable words.
        project.period,
        project.technologies.join(' '),
        project.collaborators.join(' '),
      ]),
    });
  }

  /* --- albums ---------------------------------------------------------- */

  const albums = getAllAlbums();

  for (const album of albums) {
    const captions = clip(captionsOf(album.items), CAPTION_LIMIT);
    // The album's location is usually already on every photograph in it.
    const albumLocation =
      album.location && !captions.toLowerCase().includes(album.location.toLowerCase())
        ? album.location
        : undefined;

    docs.push({
      id: `album:${album.year}-${album.slug}`,
      kind: 'album',
      title: album.title,
      href: album.href,
      meta: joinMeta([
        String(album.year),
        album.location,
        frameCount(album.photoCount, album.videoCount),
      ]),
      year: album.year,
      date: album.date ? isoDate(album.date) : `${album.year}-06-15`,
      text: searchable(album.title, [
        album.subtitle,
        album.note,
        captions,
        albumLocation,
        String(album.year),
      ]),
    });
  }

  /* --- years ----------------------------------------------------------- */

  for (const year of getYearSummaries()) {
    const yearAlbums = albums.filter((album) => album.year === year.year);

    docs.push({
      id: `year:${year.year}`,
      kind: 'year',
      title: String(year.year),
      href: year.href,
      meta: joinMeta([
        frameCount(year.photoCount, year.videoCount),
        year.albumCount > 0 ? pluralize(year.albumCount, 'album') : undefined,
      ]),
      year: year.year,
      date: `${year.year}-12-31`,
      text: searchable(String(year.year), [
        year.note,
        yearAlbums.map((album) => album.title).join(' · '),
        [
          ...new Set(
            yearAlbums
              .map((album) => album.location)
              .filter((location): location is string => Boolean(location)),
          ),
        ].join(' · '),
      ]),
    });
  }

  /* --- now ------------------------------------------------------------- */

  for (const entry of getAllNowWithBodies()) {
    const period = formatPeriod(entry.period);
    // Most Now entries are titled after their period already — only add it
    // when the title says something else.
    const periodText =
      entry.title.toLowerCase() === period.toLowerCase() ? undefined : period;

    docs.push({
      id: `now:${entry.period}`,
      kind: 'now',
      title: entry.title,
      href: entry.href,
      meta: joinMeta([period, entry.location]),
      year: entry.year,
      date: isoDate(entry.date),
      text: searchable(entry.title, [clip(entry.plain), periodText, entry.location]),
    });
  }

  /* --- standalone pages ------------------------------------------------- */

  for (const page of getAllPages()) {
    const title = page.title?.trim() || titleize(page.slug);
    docs.push({
      id: `page:${page.slug}`,
      kind: 'page',
      title,
      href: pageHref(page.slug),
      meta: page.subtitle ? collapse(page.subtitle) : undefined,
      text: searchable(title, [page.subtitle, clip(page.plain)]),
    });
  }

  /* Newest first, so any tie in the client's ranking still reads
     chronologically rather than in filesystem order. */
  return docs.sort(
    (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id),
  );
}

/** Rough serialised size in bytes. Worth watching once the archive is large. */
export function searchIndexSize(docs: SearchDoc[]): number {
  return Buffer.byteLength(JSON.stringify(docs), 'utf8');
}
