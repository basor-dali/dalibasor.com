'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { OnThisDayEntry } from '@/lib/content/on-this-day';
import { formatDayMonth, pluralize } from '@/lib/utils';

/**
 * On this day, in other years.
 *
 * The page is built ahead of time and cannot know today's date, so the list
 * of everything with a real day attached is fetched after the page has loaded
 * and today is picked out here, in the reader's own timezone. Nothing on the
 * exact day widens it to the week around it; nothing in the week, and this
 * renders nothing at all — it never stands empty on the page.
 *
 * It sits at the foot of "From the archive", well below the fold, so arriving
 * after load moves nothing anyone is looking at.
 */

/** How far either side of today to look when the day itself has nothing. */
const WINDOW_DAYS = 3;
const MAX_ROWS = 5;

function monthDay(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Days between two month-days, whatever the year, wrapping round New Year. */
function daysApart(a: string, b: string): number {
  // 2001 is not a leap year: 29 February counts as 1 March, which is close
  // enough for "the week around".
  const dayOfYear = (md: string) => {
    const [m, d] = md.split('-').map(Number);
    return Date.UTC(2001, m! - 1, d!) / 86_400_000;
  };
  const diff = Math.abs(dayOfYear(a) - dayOfYear(b));
  return Math.min(diff, 365 - diff);
}

function kindOf(entry: OnThisDayEntry): string {
  if (entry.kind === 'essay') return 'Essay';
  if (entry.kind === 'note') return 'Note';
  if (entry.kind === 'log') return 'Project log';
  return pluralize(entry.count ?? 1, 'photograph');
}

export function OnThisDay() {
  const [found, setFound] = useState<{
    exact: boolean;
    entries: OnThisDayEntry[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/on-this-day.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { entries?: OnThisDayEntry[] } | null) => {
        if (cancelled || !data?.entries) return;
        const today = new Date();
        const md = monthDay(today);
        const earlier = data.entries.filter((entry) => entry.year < today.getFullYear());
        const exact = earlier.filter((entry) => entry.md === md);
        const chosen = exact.length
          ? exact
          : earlier.filter((entry) => daysApart(entry.md, md) <= WINDOW_DAYS);
        setFound({ exact: exact.length > 0, entries: chosen.slice(0, MAX_ROWS) });
      })
      // A missing list is not worth an error: the section simply stays as it is.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!found || found.entries.length === 0) return null;

  return (
    <div id="on-this-day" className="border-line mt-(--spacing-section-sm) border-t pt-8">
      <h3 className="u-label text-ember">
        {found.exact ? 'On this day' : 'This week, in other years'}
      </h3>
      <ul className="mt-6 list-none space-y-4 p-0">
        {found.entries.map((entry) => (
          <li
            key={`${entry.date}-${entry.href}`}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-4 sm:grid-cols-[6rem_minmax(0,1fr)]"
          >
            <span className="u-label u-nums text-muted">{entry.year}</span>
            <span className="min-w-0">
              <Link
                href={entry.href}
                className="u-serif text-ivory u-link u-link-reveal text-lg transition-colors duration-300 hover:text-white"
              >
                {entry.title}
              </Link>
              <span className="u-label text-muted ml-3 whitespace-nowrap">
                {kindOf(entry)}
                {found.exact ? null : ` · ${formatDayMonth(entry.date)}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
