import type { MetadataRoute } from 'next';
import type { MediaItem } from '@/types/content';
import {
  getAllAlbums,
  getArchiveYears,
  getNowEntries,
  getPosts,
  getProjects,
  getTags,
  getYear,
} from '@/lib/content';
import { absoluteUrl } from '@/lib/metadata';
import { parseDate } from '@/lib/utils';

/**
 * The sitemap.
 *
 * Every URL the site actually serves, with a real `lastModified` wherever the
 * content carries a date. Priorities are relative and modest: the index pages
 * and the writing rank highest, the deep archive pages lower — not because
 * they matter less, but because that is what the field means.
 */

type Entry = MetadataRoute.Sitemap[number];

function entry(
  path: string,
  options: {
    lastModified?: Date | undefined;
    changeFrequency?: Entry['changeFrequency'];
    priority?: number;
  } = {},
): Entry {
  return {
    url: absoluteUrl(path),
    ...(options.lastModified ? { lastModified: options.lastModified } : {}),
    ...(options.changeFrequency ? { changeFrequency: options.changeFrequency } : {}),
    ...(options.priority !== undefined ? { priority: options.priority } : {}),
  };
}

/**
 * The newest of a run of dates.
 *
 * These are compared as parsed dates, never as strings: YAML turns an unquoted
 * `date: 2024-03-02` into a Date, which reaches us stringified as
 * `Sat Mar 02 2024 …` — and sorting *those* alphabetically puts Friday first.
 */
function latest(values: Array<string | Date | undefined>): Date | undefined {
  let newest: Date | undefined;

  for (const value of values) {
    if (!value) continue;
    const date = value instanceof Date ? value : parseDate(value);
    const time = date.getTime();
    if (Number.isNaN(time)) continue;
    if (!newest || time > newest.getTime()) newest = date;
  }

  return newest;
}

/** The most recent capture time in a run of media, if any of them carry one. */
function lastCapture(items: MediaItem[]): Date | undefined {
  return latest(items.map((item) => item.capturedAt));
}

export default function sitemap(): MetadataRoute.Sitemap {
  /* Scaffolding is left out, matching the noindex those pages carry and the
     feeds that skip them. A sitemap is a list of pages worth crawling, and a
     page whose body is a note to myself about what to write there is not one.
     They stay on the site and stay linked; they are just not advertised.

     Section indexes are unconditional. /writing is worth crawling even while
     everything under it is unwritten — it is the page that says so. */
  const written = <T extends { placeholder: boolean }>(items: T[]): T[] =>
    items.filter((item) => !item.placeholder);

  const posts = written(getPosts());
  const projects = written(getProjects());
  const albums = getAllAlbums();
  const nowEntries = written(getNowEntries());
  const years = getArchiveYears();

  /* Resolved once — the year pages need the items anyway, and the archive
     index wants to know when the last photograph in it was taken. */
  const resolvedYears = years
    .map((year) => getYear(year))
    .filter((year): year is NonNullable<typeof year> => Boolean(year));

  const captureOf = (year: (typeof resolvedYears)[number]) =>
    lastCapture([...year.everyday, ...year.albums.flatMap((album) => album.items)]);

  const newestPost = latest(posts.map((post) => post.date));
  const newestProject = latest(
    projects.map((project) => project.endDate ?? project.startDate),
  );
  const newestNow = latest(nowEntries.map((now) => now.date));
  const newestAlbum = latest(albums.map((album) => album.date));
  const newestCapture = latest(resolvedYears.map(captureOf));
  const siteUpdated = latest([
    newestPost,
    newestProject,
    newestNow,
    newestAlbum,
    newestCapture,
  ]);

  const entries: MetadataRoute.Sitemap = [
    /* --- the fixed pages ---------------------------------------------- */
    entry('/', {
      lastModified: siteUpdated,
      changeFrequency: 'weekly',
      priority: 1,
    }),
    entry('/writing', {
      lastModified: newestPost,
      changeFrequency: 'weekly',
      priority: 0.9,
    }),
    entry('/projects', {
      lastModified: newestProject,
      changeFrequency: 'monthly',
      priority: 0.9,
    }),
    entry('/photos', {
      lastModified: newestAlbum ?? siteUpdated,
      changeFrequency: 'monthly',
      priority: 0.9,
    }),
    entry('/now', {
      lastModified: newestNow,
      changeFrequency: 'monthly',
      priority: 0.8,
    }),
    entry('/about', {
      changeFrequency: 'yearly',
      priority: 0.7,
    }),
    entry('/search', {
      changeFrequency: 'yearly',
      priority: 0.3,
    }),
  ];

  /* --- writing --------------------------------------------------------- */

  for (const post of posts) {
    entries.push(
      entry(post.href, {
        lastModified: parseDate(post.date),
        changeFrequency: 'yearly',
        priority: post.featured ? 0.8 : 0.7,
      }),
    );
  }

  for (const tag of getTags()) {
    entries.push(
      entry(`/writing/tag/${tag.slug}`, {
        lastModified: newestPost,
        changeFrequency: 'monthly',
        priority: 0.4,
      }),
    );
  }

  /* --- projects -------------------------------------------------------- */

  for (const project of projects) {
    entries.push(
      entry(project.href, {
        lastModified: parseDate(project.endDate ?? project.startDate),
        // A project that is still being built genuinely does change.
        changeFrequency: project.endDate ? 'yearly' : 'monthly',
        priority: project.featured ? 0.8 : 0.7,
      }),
    );
  }

  /* --- the photo archive ------------------------------------------------ */

  for (const year of years) {
    const resolved = getYear(year);
    if (!resolved) continue;

    const allItems = [
      ...resolved.everyday,
      ...resolved.albums.flatMap((album) => album.items),
    ];

    entries.push(
      entry(resolved.href, {
        lastModified: lastCapture(allItems),
        changeFrequency: 'monthly',
        priority: 0.6,
      }),
    );
  }

  for (const album of albums) {
    entries.push(
      entry(album.href, {
        lastModified: album.date ? parseDate(album.date) : lastCapture(album.items),
        changeFrequency: 'yearly',
        priority: album.featured ? 0.7 : 0.6,
      }),
    );
  }

  /* --- now ------------------------------------------------------------- */

  for (const now of nowEntries) {
    entries.push(
      entry(now.href, {
        lastModified: parseDate(now.date),
        changeFrequency: 'yearly',
        priority: 0.4,
      }),
    );
  }

  return entries;
}
