import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NowBody } from '@/components/now/NowBody';
import { getCurrentNow, getNow, getNowNeighbours, getNowPeriods } from '@/lib/content';
import { absoluteUrl, pageMetadata } from '@/lib/metadata';
import { cx, formatPeriod, isoDateTime, truncate } from '@/lib/utils';
import type { NowSummary } from '@/types/content';

/**
 * /now/<period> — one snapshot, at a permanent address.
 *
 * `/now` shows whichever entry is newest; this route shows exactly the entry
 * you asked for and says plainly that it is past. When the two happen to be the
 * same entry the canonical points at `/now`, so the archive never competes with
 * itself for the same words.
 */

type RouteParams = { params: Promise<{ period: string }> };

export function generateStaticParams(): { period: string }[] {
  return getNowPeriods().map((period) => ({ period }));
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { period } = await params;
  const entry = getNow(period);

  if (!entry) {
    return pageMetadata({
      title: 'Not found',
      path: `/now/${period}`,
      image: '/opengraph-image',
      noIndex: true,
    });
  }

  const label = formatPeriod(entry.period);
  const meta = pageMetadata({
    title: `Now — ${label}`,
    description: entry.plain
      ? truncate(entry.plain, 160)
      : `What Dali Basor was doing in ${label}${entry.location ? `, from ${entry.location}` : ''}.`,
    path: entry.href,
    /* No per-entry OG route exists under /now, so use the site card rather than
       linking every share at a 404. */
    image: '/opengraph-image',
    type: 'article',
    publishedTime: isoDateTime(entry.date),
    // See the note in /writing/[slug]: scaffolding must not go public on the
    // day indexing is switched on.
    noIndex: entry.placeholder,
  });

  // While this entry is the live one, `/now` is the address that should rank.
  if (getCurrentNow()?.period === entry.period) {
    meta.alternates = { canonical: absoluteUrl('/now') };
  }

  return meta;
}

export default async function NowPeriodPage({ params }: RouteParams) {
  const { period } = await params;
  const entry = getNow(period);

  if (!entry) notFound();

  const current = getCurrentNow();
  const { previous, next } = getNowNeighbours(entry.period);

  return (
    <>
      <NowBody entry={entry} context="permalink" current={current} priority />

      <nav aria-label="Other Now entries" className="u-page mt-(--spacing-section)">
        <hr className="u-rule-strong" />

        <div className="grid gap-y-10 pt-10 sm:grid-cols-2 sm:gap-x-(--spacing-gutter)">
          <Neighbour entry={previous} direction="earlier" />
          <Neighbour entry={next} direction="later" />
        </div>

        <p className="u-label text-muted mt-16">
          <Link href="/now" className="u-link u-link-reveal hover:text-ivory">
            All Now entries
          </Link>
        </p>
      </nav>
    </>
  );
}

/* ==========================================================================
   Previous / next
   ========================================================================== */

function Neighbour({
  entry,
  direction,
}: {
  entry: NowSummary | undefined;
  direction: 'earlier' | 'later';
}) {
  const later = direction === 'later';

  if (!entry) {
    return (
      <div className={cx(later && 'sm:text-right')}>
        <p className="u-label text-muted">{later ? 'Later' : 'Earlier'}</p>
        <p className="u-display text-muted mt-3 text-xl">
          {later ? 'This is the newest entry' : 'This is the first entry'}
        </p>
      </div>
    );
  }

  return (
    <Link href={entry.href} className={cx('group/nb block', later && 'sm:text-right')}>
      <p className="u-label text-muted group-hover/nb:text-ember transition-colors duration-300">
        {later ? 'Later' : 'Earlier'}
      </p>
      <p className="u-display text-ivory mt-3 text-2xl transition-colors duration-300 group-hover/nb:text-white">
        {entry.title}
      </p>
      {entry.location ? (
        <p className="u-label text-muted mt-3">{entry.location}</p>
      ) : null}
    </Link>
  );
}
