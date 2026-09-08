'use client';

import { useCallback, useMemo } from 'react';
import { MediaVideo } from '@/components/media/MediaVideo';
import { useLightbox } from '@/components/media/MediaLightbox';
import { responsiveImage } from '@/lib/media';
import { cx } from '@/lib/utils';
import type { MediaItem, ProjectMediaInput } from '@/types/content';

/**
 * The build gallery.
 *
 * Project frontmatter carries a plain list of public ids; this turns that list
 * into a composition. Cells claim different widths from a repeating eleven-slot
 * pattern that tiles the twelve-column grid exactly — 12 · 7+5 · 6+6 · 12 · 5+7
 * · 4+4+4 — so the sheet has full-width moments and quiet pairs instead of a
 * uniform strip, without anyone having to lay it out by hand.
 *
 * Images open in the shared lightbox (arrowing moves through the images only).
 * Videos take a whole row and load nothing until they are played — a clip
 * running at thumbnail size is not worth watching.
 *
 * Client component because the lightbox needs a click. Everything below it —
 * srcSet, ratios, lazy loading — is the same machinery the archive grid uses.
 */

export type ProjectGalleryProps = {
  items: ProjectMediaInput[];
  /** Shown in the lightbox caption line. */
  title: string;
  /** Used to build stable media ids, and as the lightbox's year. */
  slug: string;
  year: number;
  className?: string;
};

type Slot = {
  span: string;
  sizes: string;
  ratio: string;
  ladder: 'grid' | 'feature';
};

/* The pattern. Written out as literal class strings so Tailwind can see them.
   Every `sizes` is capped at the 108rem page container — without the cap a
   2560px screen asks for a 2560px file to fill an 830px box. Inside the cap
   one column is 5.2rem and the gutter is 3.5rem. */
const SLOTS: Slot[] = [
  {
    span: 'col-span-2 md:col-span-6 lg:col-span-12',
    sizes: '(min-width: 108rem) 101rem, 100vw',
    ratio: '16 / 9',
    ladder: 'feature',
  },
  {
    span: 'col-span-2 md:col-span-4 lg:col-span-7',
    sizes: '(min-width: 108rem) 57rem, (min-width: 64rem) 57vw, (min-width: 48rem) 64vw, 100vw',
    ratio: '3 / 2',
    ladder: 'feature',
  },
  {
    span: 'col-span-2 md:col-span-2 lg:col-span-5',
    sizes: '(min-width: 108rem) 40rem, (min-width: 64rem) 40vw, (min-width: 48rem) 31vw, 100vw',
    ratio: '4 / 5',
    ladder: 'grid',
  },
  {
    span: 'col-span-1 md:col-span-3 lg:col-span-6',
    sizes: '(min-width: 108rem) 49rem, (min-width: 64rem) 48vw, 48vw',
    ratio: '3 / 2',
    ladder: 'grid',
  },
  {
    span: 'col-span-1 md:col-span-3 lg:col-span-6',
    sizes: '(min-width: 108rem) 49rem, (min-width: 64rem) 48vw, 48vw',
    ratio: '3 / 2',
    ladder: 'grid',
  },
  {
    span: 'col-span-2 md:col-span-6 lg:col-span-12',
    sizes: '(min-width: 108rem) 101rem, 100vw',
    ratio: '2 / 1',
    ladder: 'feature',
  },
  {
    span: 'col-span-1 md:col-span-2 lg:col-span-5',
    sizes: '(min-width: 108rem) 40rem, (min-width: 64rem) 40vw, (min-width: 48rem) 31vw, 48vw',
    ratio: '1 / 1',
    ladder: 'grid',
  },
  {
    span: 'col-span-1 md:col-span-4 lg:col-span-7',
    sizes: '(min-width: 108rem) 57rem, (min-width: 64rem) 57vw, (min-width: 48rem) 64vw, 48vw',
    ratio: '3 / 2',
    ladder: 'feature',
  },
  {
    span: 'col-span-1 md:col-span-2 lg:col-span-4',
    sizes: '(min-width: 108rem) 31rem, (min-width: 64rem) 32vw, (min-width: 48rem) 31vw, 48vw',
    ratio: '1 / 1',
    ladder: 'grid',
  },
  {
    span: 'col-span-1 md:col-span-2 lg:col-span-4',
    sizes: '(min-width: 108rem) 31rem, (min-width: 64rem) 32vw, (min-width: 48rem) 31vw, 48vw',
    ratio: '1 / 1',
    ladder: 'grid',
  },
  {
    span: 'col-span-2 md:col-span-2 lg:col-span-4',
    sizes: '(min-width: 108rem) 31rem, (min-width: 64rem) 32vw, (min-width: 48rem) 31vw, 100vw',
    ratio: '4 / 5',
    ladder: 'grid',
  },
];

const FULL = SLOTS[0]!;
const HALF = SLOTS[3]!;
const THIRD = SLOTS[8]!;

/**
 * Video always takes a whole row, at every width. Twelve, six and two are each
 * a full row in this grid, so substituting it never leaves a hole in the
 * pattern the way a half-width video would.
 */
const VIDEO_SLOT: Slot = {
  span: 'col-span-2 md:col-span-6 lg:col-span-12',
  sizes: '(min-width: 108rem) 101rem, 100vw',
  ratio: '16 / 9',
  ladder: 'feature',
};

export function ProjectGallery({ items, title, slug, year, className }: ProjectGalleryProps) {
  const { open } = useLightbox();

  const cells = useMemo(() => {
    const mapped = items.map((input, index) => {
      const item = toMediaItem(input, { slug, index, year, title });
      return { item, slot: slotFor(index, items.length, item) };
    });

    // The lightbox receives images only, so each image needs its position in
    // that filtered list. Built as a lookup rather than a running counter —
    // a mutable index threaded through a map is exactly what the React
    // compiler refuses to memoise.
    const imageOrder = new Map(
      mapped
        .filter((cell) => cell.item.type === 'image')
        .map((cell, position) => [cell.item.id, position] as const),
    );

    return mapped.map((cell) => ({
      ...cell,
      imageIndex: imageOrder.get(cell.item.id) ?? -1,
    }));
  }, [items, slug, title, year]);

  const images = useMemo(
    () => cells.filter((cell) => cell.item.type === 'image').map((cell) => cell.item),
    [cells],
  );

  const openAt = useCallback((index: number) => open(images, index, title), [images, open, title]);

  if (items.length === 0) return null;

  return (
    <ul
      className={cx(
        'grid list-none grid-cols-2 items-start gap-x-3 gap-y-8 p-0 sm:gap-x-4 sm:gap-y-10 md:grid-cols-6 md:gap-x-5 lg:grid-cols-12',
        className,
      )}
    >
      {cells.map(({ item, slot, imageIndex }) => (
        <li key={item.id} className={slot.span}>
          <figure className="m-0">
            {item.type === 'video' ? (
              <MediaVideo
                item={item}
                cover={false}
                ratio={`${item.width} / ${item.height}`}
                posterWidth={1600}
              />
            ) : (
              <GalleryImage item={item} slot={slot} onOpen={() => openAt(imageIndex)} />
            )}
            {item.caption ? (
              <figcaption className="u-label mt-3 text-muted">{item.caption}</figcaption>
            ) : null}
          </figure>
        </li>
      ))}
    </ul>
  );
}

/* --- one image ------------------------------------------------------------ */

function GalleryImage({
  item,
  slot,
  onOpen,
}: {
  item: MediaItem;
  slot: Slot;
  onOpen: () => void;
}) {
  const image = responsiveImage(item, {
    ladder: slot.ladder,
    sizes: slot.sizes,
    fit: 'fill',
  });

  // A photograph with real dimensions keeps its own shape; one without falls
  // back to the shape its slot in the pattern wants.
  const ratio = item.width && item.height ? `${item.width} / ${item.height}` : slot.ratio;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full cursor-zoom-in text-left"
      aria-label={`Open image: ${image.alt}`}
    >
      <div
        className="u-frame"
        style={{
          ['--ar' as string]: ratio,
          backgroundColor: item.color ?? undefined,
          backgroundImage: item.lqip ? `url(${item.lqip})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <img
          src={image.src}
          srcSet={image.srcSet || undefined}
          sizes={image.srcSet ? image.sizes : undefined}
          width={image.width}
          height={image.height}
          alt={image.alt}
          loading="lazy"
          decoding="async"
          className="media-img transition-transform duration-[1100ms] ease-[var(--ease-out-expo)] group-hover:scale-[1.03] motion-reduce:transform-none"
        />
        <span className="pointer-events-none absolute inset-0 border border-transparent transition-colors duration-500 group-hover:border-ivory/20" />
      </div>
    </button>
  );
}

/* --- shaping -------------------------------------------------------------- */

/**
 * Short galleries get a hand-set arrangement; anything longer walks the
 * repeating pattern. Video overrides both and takes the full row.
 */
function slotFor(index: number, total: number, item: MediaItem): Slot {
  if (item.type === 'video') return VIDEO_SLOT;
  return shortForm(index, total) ?? SLOTS[index % SLOTS.length]!;
}

function shortForm(index: number, total: number): Slot | undefined {
  if (total === 1) return FULL;
  if (total === 2) return HALF;
  if (total === 3) return THIRD;
  if (total === 4) return index === 0 ? FULL : THIRD;
  return undefined;
}

/* --- input → media item --------------------------------------------------- */

function toMediaItem(
  input: ProjectMediaInput,
  context: { slug: string; index: number; year: number; title: string },
): MediaItem {
  const { slug, index, year, title } = context;
  const type = input.type === 'video' ? 'video' : 'image';
  const width = input.width && input.width > 0 ? input.width : type === 'video' ? 1920 : 2000;
  const fallbackHeight = Math.round(width * (type === 'video' ? 9 / 16 : 2 / 3));
  const height = input.height && input.height > 0 ? input.height : fallbackHeight;
  const number = String(index + 1).padStart(2, '0');

  return {
    id: `${slug}-${number}`,
    type,
    year,
    publicId: input.publicId,
    width,
    height,
    orientation: width > height ? 'landscape' : width < height ? 'portrait' : 'square',
    caption: input.caption,
    // Never an empty alt on a clickable image. The frontmatter should say what
    // the picture is; when it does not, at least say what it belongs to.
    alt: input.alt ?? input.caption ?? `${title} — ${type === 'video' ? 'clip' : 'image'} ${number}`,
    poster: input.poster,
  };
}
