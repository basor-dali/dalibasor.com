import Link from 'next/link';
import type { MediaItem, YearSummary } from '@/types/content';
import { ArrowLink, Label, YearMark } from '@/components/primitives';
import { MediaImage } from '@/components/media/MediaImage';
import { site } from '@/lib/site';
import { pluralize } from '@/lib/utils';
import { LinkCue, PlaceholderFrame } from './Hero';

/**
 * The life archive.
 *
 * The loudest thing on the page. One year is set at colossal size with a run
 * of photographs pushed across its lower half; the years behind it collapse
 * into a tight editorial list. Time is the interface here, not a filter.
 */

/** The trio of photographs sitting over the numeral. */
const LEAD_SIZES = '(min-width: 64rem) 22vw, (min-width: 48rem) 26vw, 30vw';

export function ArchivePreview({ years }: { years: YearSummary[] }) {
  const lead = years[0];
  const rest = years.slice(1, 5);

  return (
    <section className="py-(--spacing-section)" aria-labelledby="home-archive">
      {/* --- header, hung on the right for once ----------------------------- */}
      <div className="u-page">
        <hr className="u-rule" />
        <div className="mt-7 flex flex-wrap items-end justify-between gap-x-10 gap-y-6 md:flex-row-reverse">
          <div className="w-full md:w-auto md:text-right">
            <Label className="mb-5 block">
              Life <span aria-hidden="true">·</span> Photographs{' '}
              <span aria-hidden="true">·</span> Video
            </Label>
            <h2 id="home-archive" className="u-display u-display-tight text-4xl text-white">
              The Archive
            </h2>
          </div>
          <ArrowLink href="/photos" className="pb-2">
            Every year
          </ArrowLink>
        </div>
      </div>

      {lead ? <LeadYear year={lead} /> : <ArchiveEmpty />}

      {rest.length > 0 ? (
        <div className="u-page mt-(--spacing-section-sm)">
          <ul className="list-none border-t border-line p-0">
            {rest.map((year) => (
              <li key={year.year} className="border-b border-line">
                <YearRow year={year} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/* ==========================================================================
   The lead year
   ========================================================================== */

function LeadYear({ year }: { year: YearSummary }) {
  const images = year.preview.filter((item) => item.type === 'image').slice(0, 3);
  const cells: (MediaItem | undefined)[] = [images[0], images[1], images[2]];

  return (
    <article className="u-page mt-14 sm:mt-20">
      <Link href={year.href} className="group block">
        <YearMark
          year={year.year}
          className="text-line-strong transition-colors duration-700 group-hover:text-muted"
        />

        {/* pushed right and pulled up so the photographs sit across the
            numeral's lower half rather than beside it */}
        <div className="relative z-10 -mt-[min(4vw,2rem)] grid grid-cols-3 gap-2 sm:-mt-[min(6vw,4rem)] sm:gap-3 md:-mt-[min(8vw,7rem)] md:ml-[16%] lg:-mt-[min(9vw,11rem)] lg:ml-[28%] lg:gap-4">
          {cells.map((item, index) =>
            item ? (
              <MediaImage
                key={item.id}
                item={item}
                ladder="grid"
                sizes={LEAD_SIZES}
                ratio="4 / 5"
                className="transition-opacity duration-700 group-hover:opacity-90"
              />
            ) : (
              <PlaceholderFrame
                key={`empty-${index}`}
                ratio="4 / 5"
                label="Photograph"
                tone={index === 1 ? 'surface-3' : 'surface-2'}
              />
            ),
          )}
        </div>

        <div className="mt-7 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 border-t border-line pt-5">
          <p className="u-label text-muted">{countLine(year)}</p>
          <LinkCue>Open {year.year}</LinkCue>
        </div>

        {year.note ? (
          <p className="u-serif mt-7 max-w-(--container-text) text-xl text-soft">{year.note}</p>
        ) : null}
      </Link>
    </article>
  );
}

/* ==========================================================================
   The years behind it
   ========================================================================== */

function YearRow({ year }: { year: YearSummary }) {
  const cover = year.coverItem;

  return (
    <Link
      href={year.href}
      className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 py-5 sm:gap-8 sm:py-7"
    >
      <span className="u-display u-nums text-2xl text-ivory transition-colors duration-300 group-hover:text-white">
        {year.year}
      </span>

      <span className="u-label min-w-0 truncate text-muted">{countLine(year)}</span>

      <span className="flex items-center gap-4">
        {cover && cover.type === 'image' ? (
          <MediaImage
            item={cover}
            ladder="thumb"
            sizes="120px"
            maxWidth={320}
            ratio="1 / 1"
            className="w-12 shrink-0 sm:w-16"
          />
        ) : (
          <PlaceholderFrame
            ratio="1 / 1"
            label=""
            marks={false}
            tone="surface-3"
            className="w-12 shrink-0 sm:w-16"
          />
        )}
        <span className="hidden sm:block">
          <LinkCue>Open</LinkCue>
        </span>
      </span>
    </Link>
  );
}

/* ==========================================================================
   Empty — still a composition
   ========================================================================== */

function ArchiveEmpty() {
  return (
    <div className="u-page mt-14 sm:mt-20">
      <YearMark year={site.archiveStartYear} className="text-line" />
      <div className="relative z-10 -mt-[min(4vw,2rem)] grid grid-cols-3 gap-2 sm:-mt-[min(6vw,4rem)] sm:gap-3 md:-mt-[min(8vw,7rem)] md:ml-[16%] lg:-mt-[min(9vw,11rem)] lg:ml-[28%] lg:gap-4">
        {[0, 1, 2].map((index) => (
          <PlaceholderFrame
            key={index}
            ratio="4 / 5"
            label="Photograph"
            tone={index === 1 ? 'surface-3' : 'surface-2'}
          />
        ))}
      </div>
      <div className="mt-7 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 border-t border-line pt-5">
        <p className="u-label text-muted">The archive starts here</p>
        <ArrowLink href="/photos">Photos + Video</ArrowLink>
      </div>
    </div>
  );
}

/* ==========================================================================
   Helpers
   ========================================================================== */

function countLine(year: YearSummary): string {
  if (year.totalCount === 0) return 'No photographs yet';

  const parts = [pluralize(year.photoCount, 'photograph')];
  if (year.videoCount > 0) parts.push(pluralize(year.videoCount, 'video'));
  if (year.albumCount > 0) parts.push(pluralize(year.albumCount, 'album'));
  return parts.join('  ·  ');
}
