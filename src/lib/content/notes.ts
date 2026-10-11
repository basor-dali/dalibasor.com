import 'server-only';

import type { Note, NoteFrontmatter, NoteSummary } from '@/types/content';
import { parseDate, slugify, toDateString, toPlainText, truncate, yearOf } from '@/lib/utils';
import { contentPath, once, readMdx, showDrafts, walk } from './fs';
import { findMediaByRef } from './media';

/**
 * Notes: the small things.
 *
 * An essay is something you sit down to write. A note is a sentence, a
 * photograph, a link — the things that would otherwise never be written down,
 * which over twenty years are most of a life. Personal sites that last are
 * kept alive by these, because the gap between "something happened" and
 * "worth an essay" is where they go quiet.
 *
 * One file each, in content/notes/, named however you like; the filename is
 * the permanent address. `npm run note -- "…"` writes one with today's date.
 * A note with a place feeds that place, one with a day feeds "on this day",
 * and every note lands on its year — so the small thing fills the archive's
 * other rooms without anyone furnishing them.
 */

/** `2026-10-11`, `2026-10-11 14:30`, `2026-10-11T14:30`. */
const DAY_TIME = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2}))?/;

/**
 * The day and, when written, the time — both read as written, never shifted.
 * YAML turns `2026-10-11 14:30:00` (with seconds) into a Date at UTC; the UTC
 * getters read it back as the same wall clock, so either spelling works.
 */
function dayAndTime(raw: unknown): { date: string; time?: string } {
  if (raw instanceof Date) {
    const date = toDateString(raw);
    const h = raw.getUTCHours();
    const m = raw.getUTCMinutes();
    return h || m
      ? { date, time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
      : { date };
  }
  const match = DAY_TIME.exec(String(raw ?? '').trim());
  if (!match) return { date: '' };
  const [, date, h, m] = match;
  return h ? { date: date!, time: `${h.padStart(2, '0')}:${m}` } : { date: date! };
}

/** What a list, a feed or a tab calls a note with no title: its opening words. */
function labelOf(title: string | undefined, plain: string, date: string): string {
  if (title?.trim()) return title.trim();
  if (plain) return truncate(plain, 72);
  return `Note, ${date}`;
}

const loadAll = once((): Note[] => {
  const files = walk(contentPath('notes'), ['.mdx', '.md']);

  const notes = files.map((file): Note => {
    const { data, body, sourcePath, basename } = readMdx<NoteFrontmatter>(file);
    const { date, time } = dayAndTime(data?.date);
    if (!date) {
      throw new Error(
        `Missing or unreadable "date" in ${sourcePath}. Write it as 2026-10-11, or 2026-10-11 14:30.`,
      );
    }

    const plain = toPlainText(body);
    const tags = Array.isArray(data.tags)
      ? [...new Set(data.tags.map((tag) => String(tag).trim()).filter(Boolean))]
      : [];
    const slug = slugify(basename);

    return {
      slug,
      href: `/notes/${slug}`,
      title: data.title?.trim() || undefined,
      date,
      time,
      year: yearOf(date),
      photo: data.photo?.trim() || undefined,
      photoAlt: data.photoAlt?.trim() || undefined,
      photoItem: findMediaByRef(data.photo),
      link: data.link?.trim() || undefined,
      location: data.location?.trim() || undefined,
      tags,
      draft: Boolean(data.draft),
      resurface: data.resurface !== false,
      noindex: data.noindex === true,
      label: labelOf(data.title, plain, date),
      body,
      plain,
      sourcePath,
    };
  });

  const seen = new Map<string, string>();
  for (const note of notes) {
    const existing = seen.get(note.slug);
    if (existing) {
      throw new Error(
        `Two notes share the address /notes/${note.slug}: ${note.sourcePath} and ${existing}. ` +
          'Rename one file — the filename is the permanent address.',
      );
    }
    seen.set(note.slug, note.sourcePath);
  }

  // Newest first: by day, then by time within a day (untimed last), then by
  // address so builds are byte-identical.
  return notes.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (b.time ?? '').localeCompare(a.time ?? '') ||
      b.slug.localeCompare(a.slug),
  );
});

function visible(notes: Note[]): Note[] {
  return showDrafts ? notes : notes.filter((note) => !note.draft);
}

function summarize(note: Note): NoteSummary {
  const { plain: _plain, sourcePath: _sourcePath, ...rest } = note;
  return rest;
}

/** Every published note, newest first. Bodies included: notes are short. */
export function getNotes(): NoteSummary[] {
  return visible(loadAll()).map(summarize);
}

export function getNote(slug: string): Note | undefined {
  return visible(loadAll()).find((note) => note.slug === slug);
}

export function getNoteSlugs(): string[] {
  return visible(loadAll()).map((note) => note.slug);
}

export function getRecentNotes(limit = 4): NoteSummary[] {
  return getNotes().slice(0, limit);
}

/** With plain text, for search and feeds. */
export function getAllNotesWithBodies(): Note[] {
  return visible(loadAll());
}

export function getNoteNeighbours(slug: string): { previous?: NoteSummary; next?: NoteSummary } {
  const notes = getNotes();
  const index = notes.findIndex((note) => note.slug === slug);
  if (index === -1) return {};
  return {
    next: index > 0 ? notes[index - 1] : undefined,
    previous: index < notes.length - 1 ? notes[index + 1] : undefined,
  };
}

/** Notes by year, newest year first — the shape /notes is drawn in. */
export function getNotesByYear(): { year: number; notes: NoteSummary[] }[] {
  const groups = new Map<number, NoteSummary[]>();
  for (const note of getNotes()) {
    const bucket = groups.get(note.year);
    if (bucket) bucket.push(note);
    else groups.set(note.year, [note]);
  }
  return [...groups.entries()]
    .map(([year, notes]) => ({ year, notes }))
    .sort((a, b) => b.year - a.year);
}

/** For the feeds: newest first, real days only. */
export function getFeedNotes(): Note[] {
  return getAllNotesWithBodies().sort(
    (a, b) =>
      parseDate(b.date).getTime() - parseDate(a.date).getTime() ||
      (b.time ?? '').localeCompare(a.time ?? '') ||
      a.slug.localeCompare(b.slug),
  );
}
