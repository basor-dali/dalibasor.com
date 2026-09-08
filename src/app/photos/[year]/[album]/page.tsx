import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { albumCountLabel } from '@/components/media/AlbumCard';
import { PhotoEssay } from '@/components/media/PhotoEssay';
import { ArrowLink, EmptyState, Label } from '@/components/primitives';
import { getAlbum, getAlbumParams, getAlbums } from '@/lib/content';
import { mediaProvider } from '@/lib/media';
import { breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/metadata';
import { cx, formatDate, formatDayMonth, formatMonthYear, isoDate, ordinalLabel } from '@/lib/utils';
import type { MediaItem, ResolvedAlbum } from '@/types/content';

/**
 * An album, read end to end.
 *
 * Not a gallery page: a sequence. The title and whatever Dali wrote about it
 * open the page at full editorial scale, and then the photographs run down the
 * screen in compositions that vary — one given the whole width, two read
 * together, three as a strip — with every frame at its own proportions.
 */

type Params = { year: string; album: string };

export function generateStaticParams(): Params[] {
  return getAlbumParams();
}

function parseYear(value: string): number | undefined {
  if (!/^\d{4}$/.test(value)) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function findAlbum(params: Params): ResolvedAlbum | undefined {
  const year = parseYear(params.year);
  if (year === undefined) return undefined;
  return getAlbum(year, params.album);
}

function ogImage(item: MediaItem | undefined): string | undefined {
  if (!item || item.type !== 'image') return undefined;
  return mediaProvider().imageUrl(item.publicId, { width: 1200, height: 630, fit: 'fill' });
}

/** The span the photographs were actually taken over, when EXIF knows. */
function capturedRange(album: ResolvedAlbum): string | undefined {
  const dates = album.items
    .map((item) => item.capturedAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  const first = dates[0];
  const last = dates[dates.length - 1];

  if (!first || !last) {
    return album.date ? formatMonthYear(album.date) : undefined;
  }
  if (isoDate(first) === isoDate(last)) return formatDate(first);
  return `${formatDayMonth(first)} — ${formatDate(last)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const resolved = await params;
  const album = findAlbum(resolved);

  if (!album) {
    return pageMetadata({
      title: 'Album not found',
      path: `/photos/${resolved.year}/${resolved.album}`,
      noIndex: true,
    });
  }

  return pageMetadata({
    title: `${album.title} — ${album.year}`,
    description: album.note
      ? album.note.replace(/\s+/g, ' ').trim().slice(0, 200)
      : `${albumCountLabel(album.photoCount, album.videoCount)} from ${album.year}.`,
    path: album.href,
    image: ogImage(album.coverItem) ?? '/opengraph-image',
  });
}

export default async function AlbumPage({ params }: { params: Promise<Params> }) {
  const resolved = await params;
  const album = findAlbum(resolved);

  if (!album) notFound();

  const siblings = getAlbums(album.year);
  const position = siblings.findIndex((entry) => entry.slug === album.slug);
  const others = siblings.filter((entry) => entry.slug !== album.slug);

  const countLabel = albumCountLabel(album.photoCount, album.videoCount);
  const dateLabel = capturedRange(album);

  const noteParagraphs = album.note
    ? album.note
        .trim()
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];

  return (
    <article className="pb-(--spacing-section)">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Photos + Video', path: '/photos' },
            { name: String(album.year), path: `/photos/${album.year}` },
            { name: album.title, path: album.href },
          ]),
        )}
      />

      {/* --- opening ----------------------------------------------------- */}
      <header className="u-page pt-32 sm:pt-40">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
          <Link
            href={`/photos/${album.year}`}
            className="u-label text-muted transition-colors duration-300 hover:text-ivory"
          >
            <span aria-hidden="true">&larr;</span> {album.year}
          </Link>
          {position >= 0 ? (
            <Label as="p">
              Album {ordinalLabel(position)} of {String(siblings.length).padStart(3, '0')}
            </Label>
          ) : null}
        </div>

        <div className="u-grid mt-12 lg:mt-16">
          <div className="col-span-2 md:col-span-6 lg:col-span-8">
            <h1 className="u-display u-display-tight max-w-[15ch] text-4xl text-white">
              {album.title}
            </h1>
            {album.subtitle ? (
              <p className="u-serif mt-6 max-w-[22ch] text-2xl text-muted">{album.subtitle}</p>
            ) : null}
          </div>

          <div className="col-span-2 md:col-span-6 lg:col-span-3 lg:col-start-10 lg:self-end">
            <ul className="list-none space-y-2.5 p-0">
              <li className="u-label text-muted">{countLabel}</li>
              {album.location ? <li className="u-label text-muted">{album.location}</li> : null}
              {dateLabel ? <li className="u-label text-muted">{dateLabel}</li> : null}
            </ul>
          </div>
        </div>
      </header>

      {/* --- the note ----------------------------------------------------- */}
      {noteParagraphs.length > 0 ? (
        <section className="u-page mt-(--spacing-section-sm)">
          <div className="lg:pl-[8.33%]">
            <div className="max-w-(--container-text-wide)">
              {noteParagraphs.map((paragraph, index) => (
                <p
                  key={index}
                  className={cx('u-serif text-xl leading-[1.5] text-ivory', index > 0 && 'mt-6')}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* --- the photographs ---------------------------------------------- */}
      {album.items.length > 0 ? (
        <section className="u-page mt-(--spacing-section)">
          <h2 className="sr-only">Photographs</h2>
          <PhotoEssay
            items={album.items}
            contextLabel={album.title}
            initialBlocks={5}
            chunkSize={5}
            priorityCount={1}
          />
        </section>
      ) : (
        <div className="u-page mt-(--spacing-section-sm)">
          <EmptyState title="This album is still empty">
            <p>
              The album is declared in{' '}
              <span className="font-mono text-ivory">content/media/{album.year}.yml</span>.
              Photographs tagged with{' '}
              <span className="font-mono text-ivory">album: {album.slug}</span> land here.
            </p>
          </EmptyState>
        </div>
      )}

      {/* --- back out ------------------------------------------------------ */}
      <footer className="u-page mt-(--spacing-section)">
        <hr className="u-rule-strong" />

        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-10 gap-y-6">
          <Link href={`/photos/${album.year}`} className="group block">
            <span className="u-label block text-muted">Back to</span>
            <span className="u-display u-nums mt-3.5 block text-3xl text-ivory transition-colors duration-300 group-hover:text-white">
              <span aria-hidden="true" className="mr-3 text-muted">
                &larr;
              </span>
              {album.year}
            </span>
          </Link>
          <ArrowLink href="/photos">The whole archive</ArrowLink>
        </div>

        {others.length > 0 ? (
          <nav aria-label={`Other albums from ${album.year}`} className="mt-16 sm:mt-24">
            <Label as="p">More from {album.year}</Label>
            <ul className="mt-6 list-none divide-y divide-line border-t border-b border-line p-0">
              {others.map((entry) => (
                <li key={entry.slug}>
                  <Link
                    href={entry.href}
                    className="group flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 py-5"
                  >
                    <span className="u-display text-xl text-ivory transition-colors duration-300 group-hover:text-white">
                      {entry.title}
                      {entry.subtitle ? (
                        <span className="u-serif ml-3 text-lg text-muted">{entry.subtitle}</span>
                      ) : null}
                    </span>
                    <span className="u-label text-muted">
                      {albumCountLabel(entry.photoCount, entry.videoCount)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </footer>
    </article>
  );
}
