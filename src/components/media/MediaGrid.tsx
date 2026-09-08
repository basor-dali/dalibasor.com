'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '@/types/content';
import { formatDuration, mediaAlt, responsiveImage, responsiveVideo } from '@/lib/media';
import { cx, formatShortMonthYear } from '@/lib/utils';
import { useDeepLinkedPhoto, useLightbox } from './MediaLightbox';
import { Picture } from './Picture';

/**
 * The photograph grid.
 *
 * Two things make this survive a year with four hundred images:
 *
 *   1. Only the first `initialCount` cells are put in the DOM. A sentinel near
 *      the bottom reveals the next chunk as it comes into view, so the DOM
 *      grows with scrolling rather than existing all at once.
 *   2. Cells that are in the DOM but off-screen are `content-visibility: auto`,
 *      so the browser skips their layout and paint entirely.
 *
 * Combined with native lazy loading and a srcSet trimmed to the source's own
 * width, opening 2019 costs about as much as opening a blog post.
 *
 * Layout is deliberately not a uniform card grid: cells span one or two columns
 * based on their own orientation, and a `rhythm` pattern promotes the occasional
 * photograph to full width so the page breathes like a contact sheet rather than
 * a search-results page.
 */

export type MediaGridProps = {
  items: MediaItem[];
  /** How many cells to render before the first scroll. */
  initialCount?: number;
  /** How many more to reveal each time the sentinel is reached. */
  chunkSize?: number;
  /** Shown in the lightbox caption line, e.g. an album title. */
  contextLabel?: string;
  /** `contact` is the dense uniform sheet; `editorial` varies cell sizes. */
  variant?: 'editorial' | 'contact';
  className?: string;
  /** Marks the first row as high priority for LCP. */
  priorityCount?: number;
};

export function MediaGrid({
  items,
  initialCount = 30,
  chunkSize = 30,
  contextLabel,
  variant = 'editorial',
  className,
  priorityCount = 0,
}: MediaGridProps) {
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(initialCount, items.length),
  );
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { open } = useLightbox();
  useDeepLinkedPhoto(items, open, contextLabel);

  const visible = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  // Note on the two-column phone tier: a portrait (one column) followed by a
  // landscape (two) leaves a half-width gap, because the landscape cannot fit
  // beside it. That is deliberate. Promoting the lone portrait to full width
  // closes every gap, but on an archive that alternates portrait and landscape
  // it promotes *everything* — one photograph per row, and twice the
  // scrolling. A half-width gap in a contact sheet reads as negative space;
  // a wall of full-bleed frames reads as a different site.
  const cells = useMemo(
    () => visible.map((item, index) => cellFor(item, index, variant)),
    [visible, variant],
  );
  const hasMore = visibleCount < items.length;

  /* Reveal the next chunk as the sentinel approaches. rootMargin is generous
     so the next rows are already in the DOM (and their images already
     downloading) by the time they scroll into view. */
  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      // A browser this old will never fire the sentinel, so reveal everything
      // rather than stranding photographs behind it. Deferred by a tick so
      // this is not a synchronous setState inside an effect.
      const id = setTimeout(() => setVisibleCount(items.length), 0);
      return () => clearTimeout(id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => Math.min(current + chunkSize, items.length));
        }
      },
      { rootMargin: '1200px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [chunkSize, hasMore, items.length]);

  const openAt = useCallback(
    (index: number) => open(items, index, contextLabel),
    [contextLabel, items, open],
  );

  if (items.length === 0) return null;

  return (
    <div className={className}>
      <ul
        className={cx(
          'grid list-none grid-cols-2 gap-x-2 gap-y-2 p-0 sm:gap-x-3 sm:gap-y-3 md:grid-cols-6 md:gap-x-4 md:gap-y-4 lg:grid-cols-12',
        )}
      >
        {visible.map((item, index) => (
          <li
            key={item.id}
            className={cx('media-cell', cells[index]!.span)}
            style={{ containIntrinsicSize: `auto ${estimateHeight(item)}px` }}
          >
            <GridCell
              item={item}
              index={index}
              sizes={cells[index]!.sizes}
              onOpen={openAt}
              priority={index < priorityCount}
            />
          </li>
        ))}
      </ul>

      {hasMore ? (
        <div ref={sentinelRef} className="flex justify-center py-16" aria-hidden="true">
          <span className="u-label text-muted">{items.length - visibleCount} more</span>
        </div>
      ) : null}

      {/* Without JavaScript the sentinel never fires, so say so rather than
          silently hiding two hundred photographs. */}
      {hasMore ? (
        <noscript>
          <p className="u-label text-muted py-8 text-center">
            {items.length - visibleCount} more photographs load as you scroll.
          </p>
        </noscript>
      ) : null}
    </div>
  );
}

const HOVER_IMG =
  'transition-[transform,filter] duration-[900ms] ease-[var(--ease-out-expo)] group-hover:scale-[1.03] motion-reduce:transform-none';

/* ==========================================================================
   Cell
   ========================================================================== */

function GridCell({
  item,
  index,
  sizes,
  onOpen,
  priority,
}: {
  item: MediaItem;
  index: number;
  sizes: string;
  onOpen: (index: number) => void;
  priority: boolean;
}) {
  const isVideo = item.type === 'video';
  const media = isVideo
    ? responsiveVideo(item, { posterWidth: 800 })
    : responsiveImage(item, { ladder: 'grid', sizes, fit: 'fill' });

  const src = isVideo
    ? (media as ReturnType<typeof responsiveVideo>).poster
    : (media as ReturnType<typeof responsiveImage>).src;

  const stamp = item.capturedAt ? formatShortMonthYear(item.capturedAt) : undefined;

  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      className="group relative block w-full cursor-zoom-in text-left"
      aria-label={`Open ${isVideo ? 'video' : 'photograph'}: ${mediaAlt(item)}`}
    >
      <div
        className="u-frame"
        style={{
          ['--ar' as string]: `${item.width} / ${item.height}`,
          backgroundColor: item.color ?? undefined,
          backgroundImage: item.lqip ? `url(${item.lqip})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {isVideo ? (
          // A poster frame is a single still, not a responsive ladder.
          <img
            src={src}
            alt={mediaAlt(item)}
            width={item.width}
            height={item.height}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            fetchPriority={priority ? 'high' : 'auto'}
            className={cx('media-img', HOVER_IMG)}
          />
        ) : (
          <Picture
            image={media as ReturnType<typeof responsiveImage>}
            priority={priority}
            alt={mediaAlt(item)}
            className={HOVER_IMG}
          />
        )}

        {/* A whisper of a scrim on hover so the label stays legible on a
            bright photograph, and nothing at all otherwise. */}
        <span className="from-ground-deep/55 pointer-events-none absolute inset-0 bg-gradient-to-t via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

        {isVideo ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="border-ivory/40 bg-ground/40 group-hover:border-ivory/80 flex h-11 w-11 items-center justify-center border backdrop-blur-[2px] transition-colors duration-500">
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="currentColor"
                aria-hidden="true"
                className="text-ivory translate-x-px"
              >
                <path d="M5 3.5 20 12 5 20.5z" />
              </svg>
            </span>
          </span>
        ) : null}

        {(stamp || item.location || (isVideo && item.duration)) && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5 opacity-0 transition-opacity duration-500 group-hover:opacity-100 sm:p-3">
            <span className="u-label text-ivory/85 truncate">
              {item.location ?? stamp}
            </span>
            {isVideo && item.duration ? (
              <span className="u-label text-ivory/85 shrink-0">
                {formatDuration(item.duration)}
              </span>
            ) : null}
          </span>
        )}
      </div>
    </button>
  );
}

/* ==========================================================================
   Composition
   ==========================================================================
   The grid is 12 columns on desktop. Cells claim 3, 4 or 6 of them depending
   on their shape and their position in the sequence, which produces an uneven
   but rhythmic sheet rather than a wall of identical squares. */

type Cell = {
  /** Column span classes across the three tiers. */
  span: string;
  /**
   * What the browser should assume this cell measures.
   *
   * Derived from the very same decision that picks the span, so the two cannot
   * drift. They had: every cell declared `quarter` (25vw desktop, 50vw phone)
   * while landscape cells actually occupy a third of a twelve-column grid and
   * every cell is full-width-ish on a phone — under-declaring by up to 1.85×,
   * which is the browser choosing a 640px file for a 1184px slot and rendering
   * every landscape frame visibly soft.
   *
   * The absolute first clause matters: above --container-page (108rem) the page
   * stops growing, so vw units no longer track the layout.
   */
  sizes: string;
};

const CELL: Record<'wide' | 'landscape' | 'portrait' | 'contact', Cell> = {
  wide: {
    span: 'col-span-2 md:col-span-4 lg:col-span-6',
    sizes:
      '(min-width: 108rem) 50rem, (min-width: 64rem) 47vw, (min-width: 48rem) 62vw, 92vw',
  },
  landscape: {
    span: 'col-span-2 md:col-span-3 lg:col-span-4',
    sizes:
      '(min-width: 108rem) 33rem, (min-width: 64rem) 31vw, (min-width: 48rem) 46vw, 92vw',
  },
  portrait: {
    span: 'col-span-1 md:col-span-2 lg:col-span-3',
    sizes:
      '(min-width: 108rem) 25rem, (min-width: 64rem) 23vw, (min-width: 48rem) 30vw, 45vw',
  },
  contact: {
    span: 'col-span-1 md:col-span-1 lg:col-span-2',
    sizes:
      '(min-width: 108rem) 16rem, (min-width: 64rem) 15vw, (min-width: 48rem) 15vw, 45vw',
  },
};

function cellFor(item: MediaItem, index: number, variant: MediaGridProps['variant']): Cell {
  if (variant === 'contact') return CELL.contact;

  const isPortrait = item.orientation === 'portrait';
  const isVideo = item.type === 'video';

  // Every seventh landscape photograph gets a wide moment. Videos always do —
  // a clip playing at thumbnail size is not worth watching.
  if ((!isPortrait && index % 7 === 3) || isVideo) return CELL.wide;
  return isPortrait ? CELL.portrait : CELL.landscape;
}

/** Rough pixel height for `contain-intrinsic-size`, keeping scrollbars honest. */
function estimateHeight(item: MediaItem): number {
  const ratio = item.height / (item.width || 1);
  return Math.round(Math.min(900, Math.max(180, 420 * ratio)));
}
