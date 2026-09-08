'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LadderName } from '@/lib/media';
import type { MediaItem } from '@/types/content';
import { formatDuration, mediaAlt, responsiveImage, responsiveVideo } from '@/lib/media';
import { cx, formatDayMonth } from '@/lib/utils';
import { useLightbox } from './MediaLightbox';
import { Picture } from './Picture';

/**
 * An album, read as a sequence rather than browsed as a grid.
 *
 * The photographs arrive in captured order and are composed into blocks: a
 * single frame given the whole width, two read as a spread, occasionally three
 * as a strip. Nothing is ever cropped to a square — a pair is laid out with
 * each frame's flex-grow set to its own aspect ratio, which is the old
 * justified-row trick: both frames end up the same height while both keep
 * their exact proportions.
 *
 * It stays fast the same way MediaGrid does. Only the first few blocks are in
 * the DOM; a sentinel reveals the next few as it approaches, and blocks that
 * are in the DOM but off-screen are skipped for layout and paint by
 * `content-visibility`. An album of four hundred frames costs about as much to
 * open as one of twenty.
 *
 * Every frame — video included — opens the shared lightbox at its own place in
 * the sequence.
 */

/* ==========================================================================
   Composition
   ========================================================================== */

type BlockKind = 'full' | 'solo' | 'pair' | 'triptych';

type Block = {
  kind: BlockKind;
  /** Index of the block's first item in the flat sequence. */
  start: number;
  items: MediaItem[];
};

function isPortrait(item: MediaItem): boolean {
  return item.orientation === 'portrait';
}

/**
 * Deterministic — the same items always produce the same page. A rhythm
 * counter, never a random one: the sequence has to be identical on the server
 * and after hydration, and identical between builds.
 */
function composeBlocks(items: MediaItem[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  let n = 0;

  while (i < items.length) {
    const a = items[i];
    if (!a) break;
    const b = items[i + 1];
    const c = items[i + 2];
    const rhythm = n % 6;

    // A clip is worth watching at size, never at thumbnail scale.
    if (a.type === 'video') {
      blocks.push({ kind: isPortrait(a) ? 'solo' : 'full', start: i, items: [a] });
      i += 1;
      n += 1;
      continue;
    }

    if (rhythm === 4 && b && c && b.type === 'image' && c.type === 'image') {
      blocks.push({ kind: 'triptych', start: i, items: [a, b, c] });
      i += 3;
      n += 1;
      continue;
    }

    if ((rhythm === 0 || rhythm === 3) && !isPortrait(a)) {
      blocks.push({ kind: 'full', start: i, items: [a] });
      i += 1;
      n += 1;
      continue;
    }

    if (b && b.type === 'image' && rhythm !== 5) {
      blocks.push({ kind: 'pair', start: i, items: [a, b] });
      i += 2;
      n += 1;
      continue;
    }

    blocks.push({ kind: 'solo', start: i, items: [a] });
    i += 1;
    n += 1;
  }

  return blocks;
}

function aspect(item: MediaItem): number {
  const ratio = (item.width || 3) / (item.height || 2);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1.5;
}

/** Rough height so `content-visibility` does not lie to the scrollbar. */
function estimateBlockHeight(block: Block): number {
  const first = block.items[0];
  if (!first) return 320;
  const share = block.kind === 'pair' ? 0.5 : block.kind === 'triptych' ? 0.34 : 1;
  const width = block.kind === 'solo' ? 640 : 1120;
  const height = (width * share) / aspect(first);
  return Math.round(Math.min(1200, Math.max(220, height)));
}

/* ==========================================================================
   The essay
   ========================================================================== */

export type PhotoEssayProps = {
  items: MediaItem[];
  /** Shown in the lightbox caption line — usually the album title. */
  contextLabel?: string;
  /** Compositions rendered before the first scroll. */
  initialBlocks?: number;
  /** Compositions revealed each time the sentinel is reached. */
  chunkSize?: number;
  /** Frames loaded eagerly. Normally 1: the opening photograph. */
  priorityCount?: number;
  className?: string;
};

export function PhotoEssay({
  items,
  contextLabel,
  initialBlocks = 6,
  chunkSize = 6,
  priorityCount = 1,
  className,
}: PhotoEssayProps) {
  const blocks = useMemo(() => composeBlocks(items), [items]);
  const [visibleBlocks, setVisibleBlocks] = useState(() =>
    Math.min(initialBlocks, blocks.length),
  );
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { open } = useLightbox();

  const visible = useMemo(() => blocks.slice(0, visibleBlocks), [blocks, visibleBlocks]);
  const hasMore = visibleBlocks < blocks.length;
  const shownCount = visible.reduce((sum, block) => sum + block.items.length, 0);

  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      // A browser this old will never fire the sentinel, so reveal the whole
      // essay rather than stranding photographs behind it. Deferred by a tick
      // so this is not a synchronous setState inside an effect.
      const id = setTimeout(() => setVisibleBlocks(blocks.length), 0);
      return () => clearTimeout(id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleBlocks((current) => Math.min(current + chunkSize, blocks.length));
        }
      },
      { rootMargin: '1400px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [blocks.length, chunkSize, hasMore]);

  const openAt = useCallback(
    (index: number) => open(items, index, contextLabel),
    [contextLabel, items, open],
  );

  if (items.length === 0) return null;

  return (
    <div className={className}>
      {visible.map((block, blockIndex) => (
        <div
          key={block.start}
          className={cx('media-cell', blockIndex > 0 && 'mt-14 sm:mt-20 lg:mt-28')}
          style={{ containIntrinsicSize: `auto ${estimateBlockHeight(block)}px` }}
        >
          <BlockView
            block={block}
            blockIndex={blockIndex}
            onOpen={openAt}
            priorityCount={priorityCount}
          />
        </div>
      ))}

      {hasMore ? (
        <>
          <div ref={sentinelRef} className="flex justify-center py-20" aria-hidden="true">
            <span className="u-label text-mute">{items.length - shownCount} more</span>
          </div>
          <noscript>
            <p className="u-label py-8 text-center text-mute">
              {items.length - shownCount} more frames load as you scroll.
            </p>
          </noscript>
        </>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   Blocks
   ========================================================================== */

function BlockView({
  block,
  blockIndex,
  onOpen,
  priorityCount,
}: {
  block: Block;
  blockIndex: number;
  onOpen: (index: number) => void;
  priorityCount: number;
}) {
  const first = block.items[0];
  if (!first) return null;

  if (block.kind === 'full') {
    return (
      <EssayFrame
        item={first}
        index={block.start}
        onOpen={onOpen}
        priority={block.start < priorityCount}
        ladder="feature"
        sizes="(min-width: 112rem) 100rem, 92vw"
        posterWidth={1600}
      />
    );
  }

  if (block.kind === 'solo') {
    const portrait = isPortrait(first);
    // Alternating side, so a run of single frames walks down the page instead
    // of stacking in a column.
    const side = blockIndex % 2 === 0 ? 'lg:mr-auto' : 'lg:ml-auto';
    return (
      <EssayFrame
        item={first}
        index={block.start}
        onOpen={onOpen}
        priority={block.start < priorityCount}
        ladder="feature"
        sizes={
          portrait
            ? '(min-width: 64rem) 40vw, (min-width: 48rem) 56vw, 92vw'
            : '(min-width: 64rem) 58vw, (min-width: 48rem) 78vw, 92vw'
        }
        posterWidth={1200}
        className={cx(side, portrait ? 'md:w-[58%] lg:w-[42%]' : 'md:w-[80%] lg:w-[60%]')}
      />
    );
  }

  // Pair and triptych: flex-grow set to each frame's own aspect ratio, so the
  // row comes out one height with every photograph at its true proportions.
  const isTriptych = block.kind === 'triptych';

  return (
    <div
      className={cx(
        isTriptych
          ? 'grid grid-cols-2 gap-2.5 sm:gap-3 md:flex md:items-start md:gap-5'
          : 'grid grid-cols-1 gap-8 md:flex md:items-start md:gap-5 lg:gap-7',
      )}
    >
      {block.items.map((item, offset) => (
        <EssayFrame
          key={item.id}
          item={item}
          index={block.start + offset}
          onOpen={onOpen}
          priority={block.start + offset < priorityCount}
          ladder={isTriptych ? 'grid' : 'feature'}
          sizes={
            isTriptych
              ? offset === 0
                ? '(min-width: 48rem) 31vw, 92vw'
                : '(min-width: 48rem) 31vw, 46vw'
              : '(min-width: 48rem) 46vw, 92vw'
          }
          posterWidth={isTriptych ? 800 : 1200}
          className={cx('min-w-0', isTriptych && offset === 0 && 'col-span-2 md:col-span-1')}
          style={{ flex: `${aspect(item).toFixed(4)} 1 0%` }}
          compact={isTriptych}
        />
      ))}
    </div>
  );
}

/* ==========================================================================
   A single frame
   ========================================================================== */

function EssayFrame({
  item,
  index,
  onOpen,
  priority,
  ladder,
  sizes,
  posterWidth,
  className,
  style,
  compact = false,
}: {
  item: MediaItem;
  index: number;
  onOpen: (index: number) => void;
  priority: boolean;
  ladder: LadderName;
  sizes: string;
  posterWidth: number;
  className?: string;
  style?: CSSProperties;
  compact?: boolean;
}) {
  const isVideo = item.type === 'video';
  const alt = mediaAlt(item);

  const image = isVideo ? null : responsiveImage(item, { ladder, sizes, fit: 'fill' });
  const video = isVideo ? responsiveVideo(item, { posterWidth }) : null;

  const frameStyle: CSSProperties = {
    ['--ar' as string]: `${item.width} / ${item.height}`,
    backgroundColor: item.color ?? undefined,
    backgroundImage: item.lqip ? `url(${item.lqip})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };

  return (
    <figure className={cx('m-0', className)} style={style}>
      <button
        type="button"
        onClick={() => onOpen(index)}
        className="group block w-full cursor-zoom-in text-left"
        aria-label={`Open ${isVideo ? 'video' : 'photograph'}: ${alt}`}
      >
        <div className="u-frame" style={frameStyle}>
          {image ? (
            <Picture image={image} priority={priority} alt={alt} />
          ) : (
            <img
              src={video?.poster}
              alt={alt}
              width={item.width}
              height={item.height}
              loading={priority ? 'eager' : 'lazy'}
              decoding={priority ? 'sync' : 'async'}
              fetchPriority={priority ? 'high' : 'auto'}
              className="media-img"
            />
          )}

          {isVideo ? (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span
                className={cx(
                  'flex items-center justify-center border border-ivory/40 bg-ground/40 backdrop-blur-[2px] transition-colors duration-500 group-hover:border-ivory/85',
                  compact ? 'h-11 w-11' : 'h-14 w-14 sm:h-20 sm:w-20',
                )}
              >
                <svg
                  viewBox="0 0 24 24"
                  width={compact ? 13 : 18}
                  height={compact ? 13 : 18}
                  fill="currentColor"
                  aria-hidden="true"
                  className="translate-x-px text-ivory"
                >
                  <path d="M5 3.5 20 12 5 20.5z" />
                </svg>
              </span>
            </span>
          ) : null}
        </div>
      </button>

      <FrameCaption item={item} compact={compact} />
    </figure>
  );
}

function FrameCaption({ item, compact }: { item: MediaItem; compact: boolean }) {
  const stamp = item.capturedAt ? formatDayMonth(item.capturedAt) : undefined;
  const duration = item.type === 'video' ? formatDuration(item.duration) : undefined;
  const bits = [item.location, stamp, duration].filter(Boolean) as string[];

  if (!item.caption && bits.length === 0) return null;

  return (
    <figcaption
      className={cx(
        'flex flex-wrap items-baseline gap-x-4 gap-y-1',
        compact ? 'mt-2.5 sm:mt-3' : 'mt-3 sm:mt-4',
      )}
    >
      {item.caption ? (
        <span
          className={cx('max-w-(--container-text) text-muted', compact ? 'text-xs' : 'text-sm')}
        >
          {item.caption}
        </span>
      ) : null}
      {bits.length > 0 ? <span className="u-label text-mute">{bits.join('  ·  ')}</span> : null}
    </figcaption>
  );
}
