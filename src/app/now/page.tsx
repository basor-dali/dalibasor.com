import type { Metadata } from 'next';
import Link from 'next/link';
import { NowBody } from '@/components/now/NowBody';
import { ArrowLink, EmptyState, SectionHeader } from '@/components/primitives';
import { getCurrentNow, getPastNowEntries } from '@/lib/content';
import { pageMetadata } from '@/lib/metadata';
import { site } from '@/lib/site';
import { formatPeriod, ordinalLabel, pluralize } from '@/lib/utils';
import type { NowSummary } from '@/types/content';

/**
 * /now — the newest entry, in full, followed by every entry that came before it.
 *
 * The list below is the point of the page. One month it is three lines long;
 * in fifteen years it is a hundred and eighty entries and still has to read
 * like a document rather than a database, which is why it groups by year and
 * carries a running number instead of a card each.
 */

export function generateMetadata(): Metadata {
  const entry = getCurrentNow();

  return pageMetadata({
    title: 'Now',
    description: entry
      ? `What Dali Basor is doing in ${formatPeriod(entry.period)}${
          entry.location ? `, from ${entry.location}` : ''
        }.`
      : `What Dali Basor is doing at this point in his life. Written from ${site.location}.`,
    path: '/now',
    /* There is no /now/opengraph-image route, so use the site card rather than
       pointing every share at a 404. */
    image: '/opengraph-image',
  });
}

export default function NowPage() {
  const entry = getCurrentNow();

  if (!entry) return <NoEntriesYet />;

  const past = getPastNowEntries();
  const total = past.length + 1;

  /* Numbered from the oldest entry forward, so an entry's number never changes
     when a newer one is written. */
  const numbered = past.map((item, index) => ({
    entry: item,
    number: ordinalLabel(total - index - 2),
  }));

  return (
    <>
      <NowBody entry={entry} context="live" priority />

      {past.length > 0 ? (
        <section className="u-page mt-(--spacing-section)" aria-label="Earlier entries">
          <SectionHeader
            eyebrow={pluralize(past.length, 'earlier entry', 'earlier entries')}
            title="The record"
            description="Nothing here is rewritten. Each month gets its own address and stays at it."
          />

          <div className="mt-14 space-y-14 sm:mt-20 sm:space-y-20">
            {groupByYear(numbered).map((group) => (
              <div key={group.year} className="u-grid">
                <h3 className="u-display u-display-tight u-nums text-mute col-span-2 text-3xl md:col-span-2 lg:sticky lg:top-32 lg:col-span-3 lg:self-start">
                  {group.year}
                </h3>

                <ul className="col-span-2 m-0 list-none p-0 md:col-span-4 lg:col-span-8 lg:col-start-5">
                  {group.rows.map(({ entry: row, number }) => (
                    <li key={row.period} className="border-line border-t last:border-b">
                      <Link
                        href={row.href}
                        className="group/row grid grid-cols-[2.75rem_minmax(0,1fr)] items-baseline gap-x-4 py-5 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:gap-x-8 sm:py-6"
                      >
                        <span className="u-label u-nums text-muted group-hover/row:text-ember transition-colors duration-300">
                          {number}
                        </span>

                        <span className="u-display text-ivory block min-w-0 text-xl transition-colors duration-300 group-hover/row:text-white">
                          {recordLabel(row)}
                        </span>

                        <span className="u-label text-muted col-start-2 mt-2 flex items-center gap-3 sm:col-start-3 sm:mt-0 sm:justify-end">
                          {row.location}
                          <svg
                            viewBox="0 0 16 16"
                            width="12"
                            height="12"
                            aria-hidden="true"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            className="text-line-strong group-hover/row:text-ember shrink-0 transition duration-500 ease-[var(--ease-out-expo)] group-hover/row:translate-x-1 motion-reduce:transform-none"
                          >
                            <path d="M3 8h10M9 4l4 4-4 4" />
                          </svg>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

/* ==========================================================================
   Empty state
   ========================================================================== */

function NoEntriesYet() {
  return (
    <div className="u-page pt-36 pb-(--spacing-section) sm:pt-44">
      <hr className="u-rule" />
      <p className="u-label text-ember mt-5">Now</p>

      <h1 className="u-display u-display-tight mt-12 max-w-[14ch] text-4xl text-white sm:mt-16">
        Not written yet
      </h1>

      <EmptyState
        className="mt-12 max-w-(--container-text-wide)"
        title="Nothing in the record"
      >
        <p>
          The first entry will appear here. Every one after it keeps its own address, so
          this page becomes a month-by-month record rather than a page that gets
          overwritten.
        </p>
      </EmptyState>

      {/* An empty page should still be a door, not a dead end. */}
      <div className="mt-14 flex flex-wrap items-center gap-x-10 gap-y-3">
        <ArrowLink href="/writing" className="py-3">
          Writing
        </ArrowLink>
        <ArrowLink href="/photos" className="py-3">
          Photos + Video
        </ArrowLink>
        <ArrowLink href="/about" className="py-3">
          About
        </ArrowLink>
      </div>
    </div>
  );
}

/* ==========================================================================
   Helpers
   ========================================================================== */

type NumberedEntry = { entry: NowSummary; number: string };
type YearGroup = { year: number; rows: NumberedEntry[] };

/** Entries arrive newest-first and years descend with them, so a single pass
    is enough — no sorting, no map of arrays. */
function groupByYear(rows: NumberedEntry[]): YearGroup[] {
  const groups: YearGroup[] = [];

  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.year === row.entry.year) {
      last.rows.push(row);
    } else {
      groups.push({ year: row.entry.year, rows: [row] });
    }
  }

  return groups;
}

/** Inside a year group the year is already set in 4rem type beside the list,
    so the row only needs the month. A hand-written title keeps its own words. */
function recordLabel(entry: NowSummary): string {
  const suffix = ` ${entry.year}`;
  if (/^\d{4}-\d{2}$/.test(entry.period) && entry.title.endsWith(suffix)) {
    return entry.title.slice(0, -suffix.length);
  }
  return entry.title;
}
