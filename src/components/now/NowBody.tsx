import { MdxContent } from '@/components/mdx/MdxContent';
import { Placeholder } from '@/components/mdx/components';
import { EmptyFrame } from '@/components/media/EmptyFrame';
import { CoverImage } from '@/components/media/MediaImage';
import { ArrowLink, MetaLine } from '@/components/primitives';
import { formatDate, formatPeriod, isoDate, parseDate, pluralize } from '@/lib/utils';
import type { NowEntry, NowSummary } from '@/types/content';

/**
 * One Now entry, rendered whole.
 *
 * Shared by `/now` (which always shows the newest entry) and `/now/<period>`
 * (which shows one specific entry, forever). Keeping both on the same component
 * is what stops the live page and the archived permalink from drifting apart
 * over twenty years of entries.
 *
 * The period is the headline. The year is set at colossal size underneath it —
 * on a page whose entire subject is *when*, the date is the composition.
 */

export type NowBodyContext =
  /** Rendered at `/now`. This is the entry currently live. */
  | 'live'
  /** Rendered at `/now/<period>`. A permanent address for one snapshot. */
  | 'permalink';

const COVER_SIZES = '(min-width: 64rem) 40vw, 100vw';

export function NowBody({
  entry,
  context = 'live',
  current,
  priority = false,
}: {
  entry: NowEntry;
  context?: NowBodyContext;
  /** The entry currently live at `/now`, used to date this one against it. */
  current?: NowSummary;
  priority?: boolean;
}) {
  const isCurrent = !current || current.period === entry.period;

  /* The frontmatter title is normally `September 2026`. Split the trailing year
     off so it can be set separately and enormously; a custom title keeps its
     own words and simply gains the year beneath it. */
  const yearSuffix = ` ${entry.year}`;
  const lead = entry.title.endsWith(yearSuffix)
    ? entry.title.slice(0, -yearSuffix.length)
    : entry.title === String(entry.year)
      ? ''
      : entry.title;

  /* `date` falls back to the period when nothing was written in frontmatter.
     Only show an exact day when an exact day actually exists — inventing
     "September 1" because the file said "2026-09" would be a lie in an archive
     whose only job is to be true. */
  const hasExactDate = /^\d{4}-\d{2}-\d{2}/.test(entry.date);

  /* An entry can exist as frontmatter alone — `npm run new:now` creates the
     file before anything is written in it. */
  const hasBody = entry.body.trim().length > 0;

  const distance =
    current && !isCurrent
      ? distanceLabel(monthsBetween(entry.period, current.period))
      : undefined;

  const coverAlt =
    entry.coverAlt?.trim() || `Photograph from ${formatPeriod(entry.period)}`;

  return (
    <article>
      {/* ---------------------------------------------------------------- */}
      {/* Opener: label rail, the period at display scale, the photograph   */}
      {/* held to the right and aligned to the bottom of the type.          */}
      {/* ---------------------------------------------------------------- */}
      <header className="u-page pt-36 sm:pt-44">
        <hr className="u-rule" />

        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <p className="u-label text-ember">{isCurrent ? 'Now' : 'Archived'}</p>
          <p className="u-label u-nums text-muted">
            {context === 'permalink' && isCurrent ? 'Currently live · ' : null}
            {entry.period}
          </p>
        </div>

        <div className="u-grid mt-12 items-end sm:mt-16">
          <div className="col-span-2 min-w-0 md:col-span-6 lg:col-span-7">
            <h1 className="u-display u-display-tight text-white">
              {lead ? <span className="block text-4xl">{lead}</span> : null}
              <span className="u-nums text-colossal text-mute block max-w-full">
                {entry.year}
              </span>
            </h1>

            <MetaLine
              className="mt-8"
              items={[
                entry.location,
                hasExactDate ? (
                  <time dateTime={isoDate(entry.date)}>
                    Written {formatDate(entry.date)}
                  </time>
                ) : null,
              ]}
            />
          </div>

          <div className="col-span-2 md:col-span-6 lg:col-span-5">
            {entry.coverImage ? (
              <CoverImage
                publicId={entry.coverImage}
                item={entry.coverItem}
                alt={coverAlt}
                ratio="4 / 5"
                ladder="feature"
                sizes={COVER_SIZES}
                priority={priority}
              />
            ) : (
              <EmptyFrame ratio="4 / 5" label="Photograph pending" />
            )}
          </div>
        </div>

        {/* --- the past-snapshot band ------------------------------------ */}
        {context === 'permalink' ? (
          <div className="border-line mt-14 border-y py-6 sm:mt-20">
            <p className="u-serif text-soft max-w-(--container-text) text-xl">
              {isCurrent
                ? 'This is the entry currently shown at /now. It keeps this address once a newer one is written.'
                : `This is how things were in ${formatPeriod(entry.period)}. It has not been edited since.`}
            </p>
            <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
              <p className="u-label text-muted">
                {isCurrent ? 'Current entry' : (distance ?? 'An earlier entry')}
              </p>
              <ArrowLink href="/now">
                {isCurrent ? 'Go to /now' : 'See what is current'}
              </ArrowLink>
            </div>
          </div>
        ) : null}
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Body: a quiet standing rail on the left, the writing offset right */}
      {/* of centre and held to the reading measure.                        */}
      {/* ---------------------------------------------------------------- */}
      <div className="u-page mt-(--spacing-section-sm)">
        <div className="u-grid">
          <div className="col-span-2 md:col-span-6 lg:col-span-2">
            <div className="border-line border-b pb-6 lg:sticky lg:top-32 lg:border-b-0 lg:pb-0">
              <span aria-hidden="true" className="bg-ember-deep mb-4 block h-px w-10" />
              <div className="flex flex-wrap gap-x-6 gap-y-2 lg:block lg:space-y-2">
                <p className="u-label text-muted">{formatPeriod(entry.period)}</p>
                {entry.location ? (
                  <p className="u-label text-muted">{entry.location}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="col-span-2 min-w-0 md:col-span-6 lg:col-span-8 lg:col-start-4">
            <div className="prose max-w-(--container-text)">
              {hasBody ? (
                <MdxContent source={entry.body} />
              ) : (
                /* The file exists but nothing has been written into it yet.
                   Say so loudly rather than fill a month of someone's life. */
                <Placeholder />
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ==========================================================================
   Time between entries
   ==========================================================================
   Deliberately measured against the current entry rather than against the
   wall clock. A statically built page that says "eight months ago" becomes a
   lie the moment it is not rebuilt; "eight months before the current entry"
   is a fact about the archive and stays true forever. */

function monthsBetween(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  );
}

function distanceLabel(months: number): string | undefined {
  if (months <= 0) return undefined;
  if (months < 12) return `${pluralize(months, 'month')} before the current entry`;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearPart = pluralize(years, 'year');

  return rest === 0
    ? `${yearPart} before the current entry`
    : `${yearPart}, ${pluralize(rest, 'month')} before the current entry`;
}
