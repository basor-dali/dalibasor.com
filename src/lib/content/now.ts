import 'server-only';

import type { NowEntry, NowFrontmatter, NowSummary } from '@/types/content';
import { formatPeriod, toPlainText, yearOf } from '@/lib/utils';
import { contentPath, once, readMdx, showDrafts, walk } from './fs';

/**
 * The Now archive.
 *
 * Every Now entry is kept forever. Updating /now means adding a new file, not
 * editing the old one — in twenty years this folder is a month-by-month
 * timeline of a life, and that only works if nothing is ever overwritten.
 */

const PERIOD_PATTERN = /^\d{4}(-\d{2})?$/;

const loadAll = once((): NowEntry[] => {
  const files = walk(contentPath('now'), ['.mdx', '.md']);

  const entries = files.map((file): NowEntry => {
    const { data, body, sourcePath, basename } = readMdx<NowFrontmatter>(file);

    const period = String(data?.period ?? basename).trim();
    if (!PERIOD_PATTERN.test(period)) {
      throw new Error(
        `Invalid Now period "${period}" in ${sourcePath}. Use YYYY-MM (e.g. 2026-09), ` +
          'either as the filename or as `period:` in the frontmatter.',
      );
    }

    return {
      period,
      href: `/now/${period}`,
      title: data?.title?.trim() || formatPeriod(period),
      location: data?.location,
      date: data?.date ? String(data.date) : period,
      year: yearOf(period),
      coverImage: data?.coverImage,
      coverAlt: data?.coverAlt,
      draft: Boolean(data?.draft),
      placeholder: Boolean(data?.placeholder),
      body,
      plain: toPlainText(body),
      sourcePath,
    };
  });

  const seen = new Map<string, string>();
  for (const entry of entries) {
    const existing = seen.get(entry.period);
    if (existing) {
      throw new Error(
        `Two Now entries claim the period "${entry.period}": ${entry.sourcePath} and ${existing}.`,
      );
    }
    seen.set(entry.period, entry.sourcePath);
  }

  // Newest first.
  return entries.sort((a, b) => b.period.localeCompare(a.period));
});

function visible(entries: NowEntry[]): NowEntry[] {
  return showDrafts ? entries : entries.filter((entry) => !entry.draft);
}

export function summarizeNow(entry: NowEntry): NowSummary {
  const { body: _body, plain: _plain, sourcePath: _sourcePath, ...rest } = entry;
  return rest;
}

/* ==========================================================================
   Public API
   ========================================================================== */

/** The entry shown at /now. */
export function getCurrentNow(): NowEntry | undefined {
  return visible(loadAll())[0];
}

export function getNow(period: string): NowEntry | undefined {
  return visible(loadAll()).find((entry) => entry.period === period);
}

export function getNowEntries(): NowSummary[] {
  return visible(loadAll()).map(summarizeNow);
}

export function getNowPeriods(): string[] {
  return visible(loadAll()).map((entry) => entry.period);
}

/** Past entries, excluding whichever one is currently live. */
export function getPastNowEntries(): NowSummary[] {
  return getNowEntries().slice(1);
}

export function getNowNeighbours(period: string): {
  previous?: NowSummary;
  next?: NowSummary;
} {
  const entries = getNowEntries();
  const index = entries.findIndex((entry) => entry.period === period);
  if (index === -1) return {};
  return {
    next: index > 0 ? entries[index - 1] : undefined,
    previous: index < entries.length - 1 ? entries[index + 1] : undefined,
  };
}

export function getAllNowWithBodies(): NowEntry[] {
  return visible(loadAll());
}
