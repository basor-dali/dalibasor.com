import 'server-only';

import type {
  MediaItem,
  NowSummary,
  PostSummary,
  ProjectSummary,
  ResolvedAlbum,
} from '@/types/content';
import { site } from '@/lib/site';
import { parseDate, yearOf } from '@/lib/utils';
import { once } from './fs';
import { getAlbums, getYear, getYearSummaries } from './media';
import { getNowEntries } from './now';
import { getProjects } from './projects';
import { getPosts } from './writing';

/**
 * Years, across everything.
 *
 * Time is how this site is organised, but until these existed only the
 * photographs had a page per year. A visitor reading an essay from 2019 had no
 * way to ask what else was happening then — what was being built, where the
 * photographs were taken, what the Now entries said that spring — and the
 * homepage timeline could only link a year to its photographs, so a year with
 * writing and no photographs was a dead mark, and one with an empty manifest
 * was a link to nothing.
 *
 * A YearRecord is that question answered: everything dated to one year,
 * gathered from the loaders that already exist. Nothing new is stored; this
 * is a second view of the same files, and it gets richer every year without
 * anyone maintaining it.
 */

export type YearProjects = {
  /** Started this year — including any that also ended this year. */
  started: ProjectSummary[];
  /**
   * Started in an earlier year and came to an end in this one, by `endDate`.
   * A project that started and ended in the same year is listed once, under
   * `started`, where its status already says how it went.
   */
  ended: ProjectSummary[];
  /**
   * Started earlier and not yet ended: live ones (building, experimenting),
   * and any project with a dated log entry in this year whatever its status
   * now — a project paused today was still worked on in the year its log says
   * it was. A paused project with no log is not "still going" just because it
   * has no end date.
   */
  ongoing: ProjectSummary[];
  /** Dated log entries per project slug, in this year. */
  updates: Record<string, number>;
};

export type YearRecord = {
  year: number;
  href: string;
  /** The age Dali turned that year, from site.birthYear. Absent before it. */
  turned?: number;
  /** The year's own note, written in its photo manifest. */
  note?: string;
  posts: PostSummary[];
  projects: YearProjects;
  now: NowSummary[];
  photographs?: {
    href: string;
    photoCount: number;
    videoCount: number;
    albums: ResolvedAlbum[];
    /** A few frames chosen across the year, featured first. */
    preview: MediaItem[];
  };
  /** Things that happened in this year, not counting projects carried over. */
  total: number;
  /**
   * The part of `total` that is not scaffolding. A year made only of
   * placeholders is still a page — it is linked and it says what is coming —
   * but, like the placeholders themselves, it is not advertised to search
   * engines or listed in the sitemap.
   */
  written: number;
};

/** Live statuses: the ones that make a project "still going". */
const LIVE = new Set(['building', 'experiment']);

const loadRecords = once((): Map<number, YearRecord> => {
  const posts = getPosts();
  const projects = getProjects();
  const now = getNowEntries();
  const summaries = new Map(getYearSummaries().map((summary) => [summary.year, summary]));

  const years = new Set<number>([
    ...posts.map((post) => post.year),
    ...projects.map((project) => yearOf(project.startDate)),
    ...projects.flatMap((project) => (project.endDate ? [yearOf(project.endDate)] : [])),
    // A year in which a project was only worked on is still a year of it.
    ...projects.flatMap((project) => project.updateDates.map((date) => yearOf(date))),
    ...now.map((entry) => entry.year),
    ...[...summaries.values()].filter((s) => s.totalCount > 0).map((s) => s.year),
  ]);

  // Chronological inside a year, so a year page reads the way the year went.
  const byDate = <T>(dateOf: (value: T) => string) => (a: T, b: T) =>
    parseDate(dateOf(a)).getTime() - parseDate(dateOf(b)).getTime();

  const records = new Map<number, YearRecord>();

  for (const year of years) {
    const yearPosts = posts
      .filter((post) => post.year === year)
      .sort(byDate((post) => post.date));

    const started = projects
      .filter((project) => yearOf(project.startDate) === year)
      .sort(byDate((project) => project.startDate));
    const ended = projects
      .filter(
        (project) =>
          project.endDate &&
          yearOf(project.endDate) === year &&
          yearOf(project.startDate) < year,
      )
      .sort(byDate((project) => project.endDate ?? project.startDate));
    const updates: Record<string, number> = {};
    for (const project of projects) {
      const count = project.updateDates.filter((date) => yearOf(date) === year).length;
      if (count > 0) updates[project.slug] = count;
    }

    const ongoing = projects.filter(
      (project) =>
        (LIVE.has(project.status) || (updates[project.slug] ?? 0) > 0) &&
        yearOf(project.startDate) < year &&
        (!project.endDate || yearOf(project.endDate) > year),
    );
    const updateCount = Object.values(updates).reduce((sum, count) => sum + count, 0);

    const yearNow = now
      .filter((entry) => entry.year === year)
      .sort((a, b) => a.period.localeCompare(b.period));

    const summary = summaries.get(year);
    const resolved = getYear(year);
    const photographs =
      summary && summary.totalCount > 0 && resolved
        ? {
            href: resolved.href,
            photoCount: summary.photoCount,
            videoCount: summary.videoCount,
            albums: getAlbums(year),
            preview: summary.preview,
          }
        : undefined;

    records.set(year, {
      year,
      href: `/years/${year}`,
      turned: year >= site.birthYear ? year - site.birthYear : undefined,
      note: resolved?.note?.trim() || undefined,
      posts: yearPosts,
      projects: { started, ended, ongoing, updates },
      now: yearNow,
      photographs,
      total:
        yearPosts.length +
        started.length +
        ended.length +
        updateCount +
        yearNow.length +
        (photographs ? photographs.photoCount + photographs.videoCount : 0),
      written:
        [...yearPosts, ...started, ...ended, ...yearNow].filter((item) => !item.placeholder)
          .length +
        updateCount +
        (photographs ? photographs.photoCount + photographs.videoCount : 0),
    });
  }

  return records;
});

/** Every year with something in it, newest first. */
export function getYearRecords(): YearRecord[] {
  return [...loadRecords().values()].sort((a, b) => b.year - a.year);
}

export function getYearRecord(year: number): YearRecord | undefined {
  return loadRecords().get(year);
}

/** For `generateStaticParams`. */
export function getRecordedYears(): number[] {
  return getYearRecords().map((record) => record.year);
}
