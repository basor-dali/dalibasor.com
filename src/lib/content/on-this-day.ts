import { getAllAlbums, getAllMediaItems } from './media';
import { getProjects } from './projects';
import { getPosts } from './writing';

/**
 * Everything in the archive with a real day attached, for "on this day".
 *
 * A static site cannot know what today is, so the build writes this list and
 * the reader's browser picks out today — in the reader's own timezone, which
 * is the only sense of "today" that means anything.
 *
 * Only real days: an essay's date, the day a photograph was taken, a dated
 * entry in a project's log. Not Now entries, which name a month; not circa
 * photographs, whose day nobody knows; not dates that only name a month or a
 * year. And the same rules as "From the archive": no drafts or placeholders,
 * nothing marked `resurface: false`, nothing from an album marked that way.
 */

export type OnThisDayEntry = {
  /** `06-14` — what a reader's today is compared with. */
  md: string;
  /** `2019-06-14` */
  date: string;
  year: number;
  kind: 'essay' | 'photographs' | 'log';
  title: string;
  href: string;
  /** Photographs taken that day, for kind `photographs`. */
  count?: number;
};

const DAY = /^(\d{4})-(\d{2})-(\d{2})/;

function dayOf(value: string | undefined): { date: string; md: string; year: number } | null {
  const match = value ? DAY.exec(String(value).trim()) : null;
  if (!match) return null;
  const [, y, m, d] = match;
  return { date: `${y}-${m}-${d}`, md: `${m}-${d}`, year: Number(y) };
}

export function getOnThisDayEntries(): OnThisDayEntry[] {
  const entries: OnThisDayEntry[] = [];

  for (const post of getPosts()) {
    if (post.placeholder || !post.resurface) continue;
    const day = dayOf(post.date);
    if (day) entries.push({ ...day, kind: 'essay', title: post.title, href: post.href });
  }

  for (const project of getProjects()) {
    if (project.placeholder || !project.resurface) continue;
    for (const update of project.updateDates) {
      const day = dayOf(update);
      if (day) entries.push({ ...day, kind: 'log', title: project.title, href: project.href });
    }
  }

  // Photographs, one entry per day per album: "12 photographs from Serbia",
  // linking to the first frame of that day.
  const albums = new Map(getAllAlbums().map((album) => [`${album.year}/${album.slug}`, album]));
  const days = new Map<string, OnThisDayEntry>();
  for (const item of getAllMediaItems()) {
    if (item.circa || item.resurface === false) continue;
    const album = item.album ? albums.get(`${item.year}/${item.album}`) : undefined;
    if (album?.resurface === false) continue;
    const day = dayOf(item.capturedAt);
    if (!day) continue;

    const key = `${day.date}/${item.album ?? 'everyday'}`;
    const existing = days.get(key);
    if (existing) {
      existing.count = (existing.count ?? 1) + 1;
      continue;
    }
    days.set(key, {
      ...day,
      kind: 'photographs',
      title: album?.title ?? `Everyday ${item.year}`,
      href: `/photo/${item.id}`,
      count: 1,
    });
  }
  entries.push(...days.values());

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}
