import 'server-only';

import type { ArchiveEntry } from '@/types/content';
import { site } from '@/lib/site';
import { hashString, yearOf } from '@/lib/utils';
import { getAllAlbums, getArchiveYears, getFeaturedMedia, getYear } from './media';
import { getNowEntries } from './now';
import { getPosts } from './writing';
import { getProjects } from './projects';

/**
 * "From the archive".
 *
 * The point of this feature is that it gets better with age: at year one it
 * surfaces the two things that exist, and at year twenty it is a genuine
 * lucky dip through a life. So it is built to weight *older* material higher
 * — the whole appeal is being shown something you had forgotten.
 */

/** Everything old enough to be worth resurfacing. */
export function getArchiveEntries(options: { minAgeMonths?: number } = {}): ArchiveEntry[] {
  const minAgeMonths = options.minAgeMonths ?? 0;
  const cutoff = Date.now() - minAgeMonths * 30 * 24 * 60 * 60 * 1000;

  const entries: ArchiveEntry[] = [];

  for (const post of getPosts()) {
    entries.push({ kind: 'post', date: post.date, year: post.year, post });
  }

  for (const project of getProjects()) {
    const date = project.endDate ?? project.startDate;
    entries.push({ kind: 'project', date, year: yearOf(date), project });
  }

  for (const album of getAllAlbums()) {
    const date = album.date ?? `${album.year}-06-15`;
    entries.push({ kind: 'album', date, year: album.year, album });
  }

  for (const item of getFeaturedMedia(60)) {
    const date = item.capturedAt ?? `${item.year}-06-15`;
    entries.push({ kind: 'photo', date, year: item.year, item });
  }

  for (const now of getNowEntries()) {
    entries.push({ kind: 'now', date: now.date, year: now.year, now });
  }

  return entries
    .filter((entry) => new Date(entry.date).getTime() <= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Pick one entry deterministically from a seed.
 *
 * Deterministic matters: this renders inside a statically generated page, so
 * `Math.random()` would produce a different result on the server and in any
 * later revalidation. Seeding from the build date gives everyone the same
 * pick, and a fresh one each time the site is rebuilt.
 *
 * Older material is weighted up — an entry from eight years ago is worth more
 * than one from last month, which is the entire point of the feature.
 */
export function pickArchiveEntry(seed: string): ArchiveEntry | undefined {
  const entries = getArchiveEntries();
  if (entries.length === 0) return undefined;
  if (entries.length === 1) return entries[0];

  const thisYear = new Date().getUTCFullYear();

  // Weight = 1 + years old, capped so a single ancient item does not dominate.
  const weights = entries.map((entry) =>
    Math.min(12, 1 + Math.max(0, thisYear - entry.year)),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  let cursor = hashString(seed) % total;
  for (let i = 0; i < entries.length; i += 1) {
    cursor -= weights[i]!;
    if (cursor < 0) return entries[i];
  }

  return entries[entries.length - 1];
}

/** A seed that is stable within a build but changes between builds. */
export function buildSeed(): string {
  // BUILD_ID differs per deploy; the date keeps it moving even on rebuilds of
  // identical content. Both are resolved once, at module load, on the server.
  return `${process.env.VERCEL_GIT_COMMIT_SHA ?? ''}-${new Date().toISOString().slice(0, 10)}`;
}

/* ==========================================================================
   Timeline
   ==========================================================================
   `2016 ——— 2020 ——— 2024 ——— 2026`. Time is the site's organising principle,
   so the set of years that actually contain something is a first-class thing
   to be able to ask for. */

export type TimelineYear = {
  year: number;
  posts: number;
  projects: number;
  photos: number;
  videos: number;
  albums: number;
  total: number;
  /** Where a year page exists to link to. */
  href?: string;
};

export function getTimeline(): TimelineYear[] {
  const posts = getPosts();
  const projects = getProjects();
  const mediaYears = new Set(getArchiveYears());

  const years = new Set<number>([
    ...posts.map((post) => post.year),
    ...projects.map((project) => yearOf(project.startDate)),
    ...mediaYears,
    ...getNowEntries().map((entry) => entry.year),
  ]);

  // Always show the declared start of the archive, even before it has content.
  years.add(site.archiveStartYear);

  return [...years]
    .sort((a, b) => b - a)
    .map((year) => {
      const media = getYear(year);
      const yearPosts = posts.filter((post) => post.year === year).length;
      const yearProjects = projects.filter(
        (project) => yearOf(project.startDate) === year,
      ).length;

      return {
        year,
        posts: yearPosts,
        projects: yearProjects,
        photos: media?.photoCount ?? 0,
        videos: media?.videoCount ?? 0,
        albums: media?.albums.length ?? 0,
        total:
          yearPosts + yearProjects + (media?.totalCount ?? 0) + (media?.albums.length ?? 0),
        href: media ? media.href : undefined,
      };
    });
}

/** The first and last years the archive knows about. */
export function getArchiveSpan(): { from: number; to: number } {
  const timeline = getTimeline().filter((year) => year.total > 0);
  if (timeline.length === 0) {
    const now = new Date().getUTCFullYear();
    return { from: site.archiveStartYear, to: now };
  }
  return {
    from: timeline[timeline.length - 1]!.year,
    to: timeline[0]!.year,
  };
}
