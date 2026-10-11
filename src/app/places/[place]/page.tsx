import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Rubric } from '@/components/archive/Rubric';
import { albumCountLabel } from '@/components/media/AlbumCard';
import { MediaImage } from '@/components/media/MediaImage';
import { MetaLine } from '@/components/primitives';
import { ArticlePreview } from '@/components/writing/ArticlePreview';
import { getPlace, getPlaces, placeCounts } from '@/lib/content';
import { mediaAlt } from '@/lib/media';
import { breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/metadata';
import { formatPeriod, pluralize } from '@/lib/utils';

/**
 * /places/[place] — everything filed under one place.
 *
 * The writing done there, the albums and photographs taken there, the months
 * it was written from — across every year, which is what a year page cannot
 * show. Each year it turns up in leads to that year.
 */

type Params = { place: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getPlaces().map((place) => ({ place: place.slug }));
}

/** Photographs shown here before "and more in their albums" takes over. */
const PHOTO_LIMIT = 24;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { place: slug } = await params;
  const place = getPlace(slug);
  if (!place)
    return pageMetadata({ title: 'Not found', path: `/places/${slug}`, noIndex: true });

  return pageMetadata({
    title: place.name,
    description: `Everything on the site from ${place.name}: ${placeCounts(place).join(', ')}.`,
    path: place.href,
  });
}

export default async function PlacePage({ params }: { params: Promise<Params> }) {
  const { place: slug } = await params;
  const place = getPlace(slug);
  if (!place) notFound();

  const photos = place.photos.filter((item) => item.type === 'image');
  const shown = photos.slice(0, PHOTO_LIMIT);

  return (
    <article className="pb-(--spacing-section)">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Places', path: '/places' },
            { name: place.name, path: place.href },
          ]),
        )}
      />

      <header className="u-page pt-32 sm:pt-40">
        <Link
          href="/places"
          className="u-label text-muted hover:text-ivory transition-colors duration-300"
        >
          <span aria-hidden="true">&larr;</span> Every place
        </Link>
        <h1 className="u-display u-display-tight mt-10 max-w-[18ch] text-4xl text-white">
          {place.name}
        </h1>
        <MetaLine
          className="mt-6"
          items={[
            ...place.years.map((year) => (
              <Link key={year} href={`/years/${year}`} className="u-link u-link-reveal">
                {year}
              </Link>
            )),
          ]}
        />
        <p className="u-label text-muted mt-3">{placeCounts(place).join('  ·  ')}</p>
      </header>

      {place.posts.length > 0 ? (
        <Rubric
          id="place-writing"
          title="Writing"
          count={`${pluralize(place.posts.length, 'essay')} written here`}
        >
          <ol className="m-0 list-none p-0">
            {place.posts.map((post) => (
              <li key={post.slug}>
                <ArticlePreview post={post} variant="row" headingLevel={3} />
              </li>
            ))}
          </ol>
        </Rubric>
      ) : null}

      {place.albums.length > 0 ? (
        <Rubric
          id="place-albums"
          title="Albums"
          count={pluralize(place.albums.length, 'album')}
        >
          <ul className="border-line m-0 list-none border-b p-0">
            {place.albums.map((album) => (
              <li key={`${album.year}/${album.slug}`} className="border-line border-t">
                <Link
                  href={album.href}
                  className="group flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 py-5"
                >
                  <span className="u-display text-ivory text-xl transition-colors duration-300 group-hover:text-white">
                    {album.title}
                    <span className="sr-only">,</span>
                  </span>
                  <span className="u-label u-nums text-muted">
                    {[
                      String(album.year),
                      albumCountLabel(album.photoCount, album.videoCount),
                    ].join('  ·  ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Rubric>
      ) : null}

      {shown.length > 0 ? (
        <Rubric
          id="place-photographs"
          title="Photographs"
          count={
            photos.length > shown.length
              ? `${shown.length} of ${pluralize(photos.length, 'photograph')}, newest first`
              : pluralize(photos.length, 'photograph')
          }
        >
          <ul className="grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
            {shown.map((item) => (
              <li key={item.id}>
                {/* The photograph is the link's only content, so its alt names it. */}
                <Link href={`/photo/${item.id}`} className="group block">
                  <MediaImage
                    item={item}
                    ladder="thumb"
                    ratio="1 / 1"
                    sizes="(min-width: 64rem) 12vw, (min-width: 40rem) 22vw, 30vw"
                    alt={mediaAlt(item)}
                    imgClassName="transition-transform duration-[1100ms] ease-[var(--ease-out-expo)] group-hover:scale-[1.03] motion-reduce:transform-none"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Rubric>
      ) : null}

      {place.now.length > 0 ? (
        <Rubric
          id="place-now"
          title="Now"
          count={`${pluralize(place.now.length, 'month')} written from here`}
        >
          <ul className="border-line m-0 list-none border-b p-0">
            {place.now.map((entry) => (
              <li key={entry.period} className="border-line border-t">
                <Link
                  href={entry.href}
                  className="u-display text-ivory block py-5 text-xl transition-colors duration-300 hover:text-white"
                >
                  {formatPeriod(entry.period)}
                </Link>
              </li>
            ))}
          </ul>
        </Rubric>
      ) : null}
    </article>
  );
}
