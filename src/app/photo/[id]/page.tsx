import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { MediaItem } from '@/types/content';
import { MediaImage } from '@/components/media/MediaImage';
import { MediaVideo } from '@/components/media/MediaVideo';
import { PlaceLink } from '@/components/places/PlaceLink';
import { ArrowLink, Label, MetaLine } from '@/components/primitives';
import { getMediaIds, getMediaPlacement, type MediaPlacement } from '@/lib/content';
import { mediaAlt, shareImageUrl } from '@/lib/media';
import { breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/metadata';
import { cx, formatCaptured } from '@/lib/utils';

/**
 * /photo/[id] — one photograph, on a page of its own.
 *
 * The viewer is the way to look through an album; this is the way to send
 * someone one frame. Its link unfurls with the photograph itself rather than
 * the album's cover, and it says what the viewer only shows in passing: when,
 * where, which album, which year.
 *
 * Addressed by id alone because ids are permanent — a photograph keeps its id
 * when its album is renamed or deleted, so this address outlives both.
 */

type Params = { id: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getMediaIds().map((id) => ({ id }));
}

function kindOf(item: MediaItem): string {
  return item.type === 'video' ? 'Video' : 'Photograph';
}

/** Where it lives, in words: the album's title, or the year's everyday set. */
function whereOf(placement: MediaPlacement): string {
  return placement.album?.title ?? `Everyday ${placement.item.year}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const placement = getMediaPlacement(id);
  if (!placement) {
    return pageMetadata({ title: 'Not found', path: `/photo/${id}`, noIndex: true });
  }

  const { item, index, sequence } = placement;
  const where = placement.album
    ? `${placement.album.title}, ${item.year}`
    : whereOf(placement);
  const frame = `${index + 1} of ${sequence.length}`;
  // Two frames in one album can share a caption; their titles must not, or
  // search engines see the same page twice. Only then does the number join in.
  const repeated =
    Boolean(item.caption) &&
    sequence.filter((other) => other.caption === item.caption).length > 1;
  return pageMetadata({
    title: item.caption
      ? `${item.caption} — ${where}${repeated ? `, ${frame}` : ''}`
      : `${kindOf(item)} ${frame} — ${where}`,
    description: mediaAlt(item),
    path: `/photo/${item.id}`,
    image: shareImageUrl(item) ?? '/opengraph-image',
    // A frame with words of yours is worth finding on its own. One without is
    // a frame in an album, and the album is the page that should be found.
    noIndex: !item.caption,
  });
}

function Neighbour({
  item,
  direction,
  number,
  className,
}: {
  item?: MediaItem;
  direction: 'Previous' | 'Next';
  number: number;
  className?: string;
}) {
  const align = direction === 'Next' ? 'md:flex-row-reverse md:text-right' : undefined;
  if (!item) return <div className={cx('hidden py-8 md:block', className)} />;

  return (
    <div className={cx('group relative flex items-center gap-5 py-8', align, className)}>
      {item.type === 'image' ? (
        // The link names it; the thumbnail is there for the eye.
        <MediaImage
          item={item}
          ladder="thumb"
          sizes="96px"
          maxWidth={320}
          ratio="1 / 1"
          alt=""
          className="w-16 shrink-0 sm:w-20"
        />
      ) : null}
      <div className="min-w-0">
        <Label className="block">{direction}</Label>
        <p className="u-serif text-ivory mt-2 text-lg transition-colors duration-300 group-hover:text-white">
          <Link
            href={`/photo/${item.id}`}
            className="after:absolute after:inset-0 after:content-['']"
          >
            {item.caption ?? `${kindOf(item)} ${number}`}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default async function PhotoPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const placement = getMediaPlacement(id);
  if (!placement) notFound();

  const { item, album, sequence, index, previous, next } = placement;
  const year = item.year;
  // The viewer opens on this frame wherever its sequence is shown.
  const home = album?.href ?? `/photos/${year}`;
  const where = whereOf(placement);
  const ratio = (item.width / Math.max(1, item.height)).toFixed(4);
  const captured = item.capturedAt
    ? formatCaptured(item.capturedAt, item.circa)
    : undefined;
  const title = item.caption ?? `${album ? `${album.title}, ` : 'Everyday, '}${year}`;

  return (
    <article className="pb-(--spacing-section)">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Photos + Video', path: '/photos' },
            { name: String(year), path: `/photos/${year}` },
            ...(album ? [{ name: album.title, path: album.href }] : []),
            {
              name: item.caption ?? `${kindOf(item)} ${index + 1}`,
              path: `/photo/${item.id}`,
            },
          ]),
        )}
      />

      <header className="u-page pt-32 sm:pt-40">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
          <Link
            href={home}
            className="u-label text-muted hover:text-ivory transition-colors duration-300"
          >
            <span aria-hidden="true">&larr;</span> {where}
            {album ? `, ${year}` : null}
          </Link>
          <Label as="p">
            {kindOf(item)} {index + 1} of {sequence.length}
          </Label>
        </div>

        <h1
          className={cx(
            'mt-10 max-w-[30ch] text-white',
            item.caption ? 'u-serif text-3xl' : 'u-display u-display-tight text-3xl',
          )}
        >
          {title}
        </h1>
        <MetaLine
          className="mt-5"
          items={[
            captured,
            item.location ? <PlaceLink key="place" location={item.location} /> : null,
          ]}
        />
      </header>

      {/* As large as the screen allows and never cropped: the width is capped
          so the whole frame fits in about four fifths of the window's height. */}
      <figure className="u-page mt-10 sm:mt-14">
        <div className="mx-auto" style={{ width: `min(100%, calc(82svh * ${ratio}))` }}>
          {item.type === 'video' ? (
            <MediaVideo
              item={item}
              cover={false}
              ratio={`${item.width} / ${item.height}`}
              posterWidth={1600}
            />
          ) : (
            <MediaImage
              item={item}
              ladder="bleed"
              fit="fit"
              ratio={`${item.width} / ${item.height}`}
              sizes={`min(92vw, calc(82vh * ${ratio}))`}
              priority
            />
          )}
        </div>
      </figure>

      <footer className="u-page mt-14 sm:mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-4">
          <ArrowLink href={`${home}?photo=${encodeURIComponent(item.id)}`}>
            {album ? `See it in ${album.title}` : `See it with ${year}`}
          </ArrowLink>
          <ArrowLink href={`/years/${year}`}>Everything from {year}</ArrowLink>
        </div>

        {previous || next ? (
          <nav
            aria-label="Either side in this sequence"
            className="border-line mt-12 grid border-t md:grid-cols-2"
          >
            <Neighbour
              item={previous}
              direction="Previous"
              number={index}
              className="border-line border-b md:border-r md:border-b-0 md:pr-(--spacing-gutter)"
            />
            <Neighbour
              item={next}
              direction="Next"
              number={index + 2}
              className="md:pl-(--spacing-gutter)"
            />
          </nav>
        ) : null}
      </footer>
    </article>
  );
}
