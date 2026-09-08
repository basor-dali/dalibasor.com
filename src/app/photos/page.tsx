import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyFrame, frameRatio } from '@/components/media/AlbumCard';
import { MediaImage } from '@/components/media/MediaImage';
import { EmptyState, Label, YearMark } from '@/components/primitives';
import { getArchiveSpan, getArchiveTotals, getTimeline, getYearSummaries } from '@/lib/content';
import { mediaProvider } from '@/lib/media';
import { pageMetadata } from '@/lib/metadata';
import { cx, pluralize, truncate } from '@/lib/utils';
import type { MediaItem, YearSummary } from '@/types/content';

/**
 * The archive overview.
 *
 * Two ideas carry the page. First, the span: the years the archive covers, set
 * as large as the screen allows, because the length of the record is the point
 * of keeping it. Second, the years themselves — each one a substantial visual
 * moment with its own composition, so scrolling back through them feels like
 * walking backwards through a life rather than paging a list.
 */

const IMAGE_HOVER =
  'transition-transform duration-[1100ms] ease-[var(--ease-out-expo)] group-hover:scale-[1.03] motion-reduce:transform-none';

function ogImage(item: MediaItem | undefined): string | undefined {
  if (!item || item.type !== 'image') return undefined;
  return mediaProvider().imageUrl(item.publicId, { width: 1200, height: 630, fit: 'fill' });
}

export function generateMetadata(): Metadata {
  const totals = getArchiveTotals();
  const hasMedia = totals.photos + totals.videos > 0;

  return pageMetadata({
    title: 'Photos + Video',
    description: hasMedia
      ? `${totals.photos.toLocaleString('en-US')} photographs and ${totals.videos.toLocaleString(
          'en-US',
        )} videos, ${totals.firstYear} to ${totals.lastYear}.`
      : 'The photograph and video archive, year by year.',
    path: '/photos',
    // There is no /photos/opengraph-image route, so point at the newest cover
    // and fall back to the site card rather than a URL that would 404.
    image: ogImage(getYearSummaries()[0]?.coverItem) ?? '/opengraph-image',
  });
}

export default function PhotosPage() {
  const totals = getArchiveTotals();
  const span = getArchiveSpan();
  const years = getYearSummaries();
  const hasMedia = totals.photos + totals.videos > 0;
  const singleYear = totals.firstYear === totals.lastYear;
  // Writing and projects can reach further back than the photographs do — but
  // only say so when there is actually something back there.
  const olderMaterial =
    span.from < totals.firstYear && getTimeline().some((entry) => entry.total > 0);

  return (
    <div className="pb-(--spacing-section)">
      {/* --- the span ---------------------------------------------------- */}
      <section className="u-page pt-36 sm:pt-44">
        <Label as="p">The archive</Label>

        <h1 className="mt-10">
          <span className="sr-only">
            {singleYear
              ? `Photographs and video from ${totals.lastYear}`
              : `Photographs and video, ${totals.firstYear} to ${totals.lastYear}`}
          </span>
          <span aria-hidden="true" className="block">
            {singleYear ? null : (
              <>
                <span className="u-display u-display-tight u-nums block text-colossal text-white">
                  {totals.firstYear}
                </span>
                <span className="my-3 flex items-center gap-6 sm:my-5 sm:gap-10">
                  <span className="h-px flex-1 bg-ember-deep" />
                  <span className="u-label shrink-0 text-mute">
                    {pluralize(totals.years, 'year')} filed
                  </span>
                </span>
              </>
            )}
            <span
              className={cx(
                'u-display u-display-tight u-nums block text-colossal text-white',
                singleYear ? 'text-left' : 'text-right',
              )}
            >
              {totals.lastYear}
            </span>
          </span>
        </h1>

        <dl className="mt-16 grid grid-cols-2 gap-x-6 gap-y-10 border-t border-line pt-10 sm:grid-cols-4 sm:gap-x-10">
          <Stat label="Photographs" value={totals.photos} />
          <Stat label="Videos" value={totals.videos} />
          <Stat label="Albums" value={totals.albums} />
          <Stat label="Years" value={totals.years} />
        </dl>

        {olderMaterial ? (
          <p className="u-label mt-10 text-mute">
            The wider archive — writing and projects — runs from {span.from}
          </p>
        ) : null}
      </section>

      {/* --- the years --------------------------------------------------- */}
      {years.length === 0 ? (
        <div className="u-page mt-(--spacing-section)">
          <EmptyState title="No years filed yet">
            <p>
              Each year lives in one file under{' '}
              <span className="font-mono text-ivory">content/media</span>. The first one to land
              there opens the archive.
            </p>
          </EmptyState>
        </div>
      ) : (
        <section className="u-page mt-(--spacing-section)">
          <h2 className="sr-only">Years</h2>
          <ol className="list-none p-0">
            {years.map((summary, index) => (
              <li
                key={summary.year}
                className="border-t border-line py-(--spacing-section-sm) last:pb-0"
              >
                <YearBlock summary={summary} index={index} priority={index === 0 && hasMedia} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/* ==========================================================================
   Counts
   ========================================================================== */

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="u-label text-mute">{label}</dt>
      <dd className="u-display u-nums mt-3.5 text-2xl text-ivory">
        {value.toLocaleString('en-US')}
      </dd>
    </div>
  );
}

/* ==========================================================================
   One year
   ==========================================================================
   Three compositions, cycling: the year set beneath a large offset photograph
   and overlapping it; the numeral beside a pair of frames; the numeral run
   above a contact-sheet strip. A year with too few photographs for its turn in
   the cycle falls back to a simpler one rather than leaving holes. */

function YearBlock({
  summary,
  index,
  priority,
}: {
  summary: YearSummary;
  index: number;
  priority: boolean;
}) {
  const { year } = summary;

  // Cover first, then the preview, de-duplicated. Photographs only: a still
  // frame pulled out of a video belongs to the grid, not to a year opener.
  const frames: MediaItem[] = [];
  const seen = new Set<string>();
  for (const item of [summary.coverItem, ...summary.preview]) {
    if (!item || item.type !== 'image' || seen.has(item.id)) continue;
    seen.add(item.id);
    frames.push(item);
  }
  const lead = frames[0];
  const second = frames[1];

  let variant = index % 3;
  if (variant === 2 && frames.length < 3) variant = 1;
  if (variant === 1 && frames.length === 0) variant = 0;

  const counts = [
    summary.photoCount > 0 ? pluralize(summary.photoCount, 'photograph') : undefined,
    summary.videoCount > 0 ? pluralize(summary.videoCount, 'video') : undefined,
    summary.albumCount > 0 ? pluralize(summary.albumCount, 'album') : undefined,
  ].filter(Boolean) as string[];
  const countLine = counts.length > 0 ? counts.join('  ·  ') : 'Nothing filed yet';

  const note = summary.note
    ? truncate(summary.note.replace(/\s+/g, ' ').trim(), 150)
    : undefined;

  return (
    <Link
      href={summary.href}
      className="group block"
      aria-label={`${year} — ${countLine.replace(/\s+·\s+/g, ', ')}`}
    >
      {variant === 0 ? (
        <>
          <div className="u-grid items-end">
            <figure className="relative col-span-2 m-0 md:col-span-6 lg:col-span-8 lg:col-start-5 lg:row-start-1">
              {lead ? (
                <MediaImage
                  item={lead}
                  ladder="feature"
                  sizes="(min-width: 64rem) 62vw, 92vw"
                  ratio={frameRatio(lead, 0.85, 2.4)}
                  priority={priority}
                  imgClassName={IMAGE_HOVER}
                />
              ) : (
                <EmptyFrame ratio="3 / 2" label={`Nothing filed under ${year} yet`} />
              )}
              {/* The numeral runs across the foot of the photograph — the
                  gradient is what keeps it legible over a bright frame. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-ground via-ground/45 to-transparent"
              />
            </figure>

            {second ? (
              <figure className="m-0 hidden lg:col-span-3 lg:col-start-1 lg:row-start-1 lg:block">
                <MediaImage
                  item={second}
                  ladder="grid"
                  sizes="24vw"
                  ratio={frameRatio(second, 0.7, 1.7)}
                  imgClassName={IMAGE_HOVER}
                />
              </figure>
            ) : null}
          </div>

          <h3
            className="relative"
            style={{ marginTop: 'calc(var(--text-colossal) * -0.27)' }}
          >
            <YearMark
              year={year}
              as="span"
              className="text-white transition-colors duration-500 group-hover:text-ivory"
            />
          </h3>
        </>
      ) : null}

      {variant === 1 ? (
        <div className="u-grid items-end">
          <h3 className="col-span-2 md:col-span-6 lg:col-span-4 lg:row-start-1">
            <span className="u-display u-display-tight u-nums block text-5xl text-white transition-colors duration-500 group-hover:text-ivory">
              {year}
            </span>
          </h3>

          {lead ? (
            <figure className="col-span-2 m-0 md:col-span-4 lg:col-span-5 lg:col-start-6 lg:row-start-1">
              <MediaImage
                item={lead}
                ladder="feature"
                sizes="(min-width: 64rem) 40vw, (min-width: 48rem) 62vw, 92vw"
                ratio={frameRatio(lead, 0.72, 2.2)}
                priority={priority}
                imgClassName={IMAGE_HOVER}
              />
            </figure>
          ) : null}

          {second ? (
            <figure className="m-0 hidden md:col-span-2 md:block lg:col-span-2 lg:col-start-11 lg:row-start-1">
              <MediaImage
                item={second}
                ladder="thumb"
                sizes="(min-width: 64rem) 16vw, 30vw"
                ratio={frameRatio(second, 0.7, 1.4)}
                imgClassName={IMAGE_HOVER}
              />
            </figure>
          ) : null}
        </div>
      ) : null}

      {variant === 2 ? (
        <div>
          <h3 className="text-right">
            <YearMark
              year={year}
              as="span"
              className="text-white transition-colors duration-500 group-hover:text-ivory"
            />
          </h3>

          <div className="u-grid mt-10 items-end">
            <ContactFrame
              item={frames[0]}
              className="col-span-2 md:col-span-6 lg:col-span-5"
              sizes="(min-width: 64rem) 40vw, 92vw"
              ladder="feature"
              priority={priority}
            />
            <ContactFrame
              item={frames[1]}
              className="col-span-1 md:col-span-3 lg:col-span-4"
              sizes="(min-width: 64rem) 32vw, 46vw"
              ladder="grid"
            />
            <ContactFrame
              item={frames[2]}
              className="col-span-1 md:col-span-3 lg:col-span-3"
              sizes="(min-width: 64rem) 24vw, 46vw"
              ladder="thumb"
            />
          </div>
        </div>
      ) : null}

      {/* --- the line under every year ---------------------------------- */}
      <div className="mt-9 flex flex-wrap items-baseline justify-between gap-x-10 gap-y-4">
        <p className="u-label text-muted">{countLine}</p>
        <span className="u-label text-muted transition-colors duration-300 group-hover:text-ivory">
          Open {year} <span aria-hidden="true">&rarr;</span>
        </span>
      </div>

      {note ? (
        <p className="u-serif mt-7 max-w-(--container-text) text-lg text-muted">{note}</p>
      ) : null}
    </Link>
  );
}

function ContactFrame({
  item,
  className,
  sizes,
  ladder,
  priority = false,
}: {
  item: MediaItem | undefined;
  className?: string;
  sizes: string;
  ladder: 'thumb' | 'grid' | 'feature';
  priority?: boolean;
}) {
  if (!item) return null;

  return (
    <figure className={cx('m-0', className)}>
      <MediaImage
        item={item}
        ladder={ladder}
        sizes={sizes}
        ratio={frameRatio(item, 0.7, 2.2)}
        priority={priority}
        imgClassName={IMAGE_HOVER}
      />
    </figure>
  );
}
