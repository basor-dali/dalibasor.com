import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { frameRatio } from '@/components/media/AlbumCard';
import { AlbumGrid } from '@/components/media/AlbumGrid';
import { MediaGrid } from '@/components/media/MediaGrid';
import { MediaImage } from '@/components/media/MediaImage';
import { YearSelector } from '@/components/media/YearSelector';
import { EmptyState, Label, MetaLine, YearMark } from '@/components/primitives';
import { EVERYDAY_LABEL, getArchiveYears, getYear } from '@/lib/content';
import { mediaProvider } from '@/lib/media';
import { breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/metadata';
import { cx, pluralize } from '@/lib/utils';
import type { MediaItem } from '@/types/content';

/**
 * One year of the archive.
 *
 * The year opens with its own photograph and the numeral run across the foot
 * of it — time set as the loudest thing on the page, which is the whole
 * organising idea of this site. Below that: whatever Dali wrote about the
 * year, the albums, and then everything that never belonged to an album,
 * revealed a chunk at a time as you scroll.
 */

type Params = { year: string };

export function generateStaticParams(): Params[] {
  return getArchiveYears().map((year) => ({ year: String(year) }));
}

function parseYear(value: string): number | undefined {
  if (!/^\d{4}$/.test(value)) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function ogImage(item: MediaItem | undefined): string | undefined {
  if (!item || item.type !== 'image') return undefined;
  return mediaProvider().imageUrl(item.publicId, { width: 1200, height: 630, fit: 'fill' });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { year: raw } = await params;
  const parsed = parseYear(raw);
  const year = parsed === undefined ? undefined : getYear(parsed);

  if (!year) {
    return pageMetadata({
      title: 'Year not found',
      path: `/photos/${raw}`,
      noIndex: true,
    });
  }

  const counts = [
    year.photoCount > 0 ? pluralize(year.photoCount, 'photograph') : undefined,
    year.videoCount > 0 ? pluralize(year.videoCount, 'video') : undefined,
  ].filter(Boolean) as string[];

  return pageMetadata({
    title: `${year.year} — Photos + Video`,
    description:
      counts.length > 0
        ? `${counts.join(' and ')} from ${year.year}.`
        : `The ${year.year} page of the archive.`,
    path: year.href,
    image: ogImage(year.coverItem) ?? '/opengraph-image',
  });
}

export default async function YearPage({ params }: { params: Promise<Params> }) {
  const { year: raw } = await params;
  const parsed = parseYear(raw);
  const year = parsed === undefined ? undefined : getYear(parsed);

  if (!year) notFound();

  // A year whose only material is video has no still to open with — the frame
  // is simply left out rather than pointing an <img> at a video.
  const cover = year.coverItem?.type === 'image' ? year.coverItem : undefined;
  const portraitCover = cover?.orientation === 'portrait';
  const allYears = getArchiveYears();
  const position = allYears.indexOf(year.year);

  const counts = [
    year.photoCount > 0 ? pluralize(year.photoCount, 'photograph') : undefined,
    year.videoCount > 0 ? pluralize(year.videoCount, 'video') : undefined,
    year.albums.length > 0 ? pluralize(year.albums.length, 'album') : undefined,
  ].filter(Boolean) as string[];

  const noteParagraphs = year.note
    ? year.note
        .trim()
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];

  const everydayHeading =
    year.albums.length > 0 ? `Other moments from ${year.year}` : `${year.year} in photographs`;

  return (
    <article className="pb-(--spacing-section)">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Photos + Video', path: '/photos' },
            { name: String(year.year), path: year.href },
          ]),
        )}
      />

      {/* --- opening ----------------------------------------------------- */}
      <header className="u-page pt-32 sm:pt-40">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
          <Link
            href="/photos"
            className="u-label text-muted transition-colors duration-300 hover:text-ivory"
          >
            <span aria-hidden="true">&larr;</span> The archive
          </Link>
          {position >= 0 ? (
            <Label as="p">
              Year {position + 1} of {allYears.length}
            </Label>
          ) : null}
        </div>

        {cover ? (
          <div className="u-grid mt-12">
            <figure
              className={cx(
                'relative col-span-2 m-0 md:col-span-6',
                portraitCover
                  ? 'lg:col-span-5 lg:col-start-8'
                  : 'lg:col-span-9 lg:col-start-4',
              )}
            >
              <MediaImage
                item={cover}
                ladder="bleed"
                sizes={
                  portraitCover ? '(min-width: 64rem) 40vw, 92vw' : '(min-width: 64rem) 72vw, 92vw'
                }
                ratio={frameRatio(cover, 0.62, 2.6)}
                priority
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-ground via-ground/45 to-transparent"
              />
            </figure>
          </div>
        ) : null}

        <h1
          className={cx('relative', !cover && 'mt-14')}
          style={cover ? { marginTop: 'calc(var(--text-colossal) * -0.27)' } : undefined}
        >
          <span className="sr-only">Photographs and video from {year.year}</span>
          <YearMark year={year.year} as="span" className="text-white" />
        </h1>

        <MetaLine className="mt-10" items={counts.length > 0 ? counts : ['Nothing filed yet']} />
      </header>

      {/* --- the year, in Dali's words ----------------------------------- */}
      {noteParagraphs.length > 0 ? (
        <section className="u-page mt-(--spacing-section-sm)">
          <div className="lg:pl-[16.6%]">
            <div className="max-w-(--container-text-wide)">
              {noteParagraphs.map((paragraph, index) => (
                <p
                  key={index}
                  className={cx(
                    'u-serif text-2xl leading-[1.32] text-ivory',
                    index > 0 && 'mt-7',
                  )}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* --- albums ------------------------------------------------------ */}
      {year.albums.length > 0 ? (
        <section className="u-page mt-(--spacing-section)">
          <header>
            <hr className="u-rule mb-7" />
            <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
              <h2 className="u-display text-2xl text-white">Albums</h2>
              <p className="u-label text-muted">{pluralize(year.albums.length, 'album')}</p>
            </div>
          </header>
          <AlbumGrid
            className="mt-14"
            albums={year.albums}
            numberFrom={0}
            priorityFirst={!cover}
            headingLevel={3}
          />
        </section>
      ) : null}

      {/* --- everything that never belonged to an album ------------------- */}
      {year.everyday.length > 0 ? (
        <section className="u-page mt-(--spacing-section)">
          <header>
            <hr className="u-rule mb-7" />
            <Label as="p">{EVERYDAY_LABEL}</Label>
            <div className="mt-3.5 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
              <h2 className="u-display text-2xl text-white">{everydayHeading}</h2>
              <p className="u-label text-muted">{pluralize(year.everyday.length, 'frame')}</p>
            </div>
          </header>
          <MediaGrid
            className="mt-12"
            items={year.everyday}
            contextLabel={String(year.year)}
            initialCount={24}
            chunkSize={24}
            priorityCount={cover || year.albums.length > 0 ? 0 : 2}
          />
        </section>
      ) : null}

      {/* --- empty year --------------------------------------------------- */}
      {year.totalCount === 0 ? (
        <div className="u-page mt-(--spacing-section-sm)">
          <EmptyState title={`Nothing filed under ${year.year} yet`}>
            <p>
              The manifest for this year exists but has no photographs in it. Anything imported
              into <span className="font-mono text-ivory">content/media/{year.year}.yml</span>{' '}
              shows up here.
            </p>
          </EmptyState>
        </div>
      ) : null}

      {/* --- moving between years ----------------------------------------- */}
      <YearSelector
        years={allYears}
        current={year.year}
        className="u-page mt-(--spacing-section)"
      />
    </article>
  );
}
