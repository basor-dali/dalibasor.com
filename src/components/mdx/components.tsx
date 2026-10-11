import Link from 'next/link';
import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import type { MDXComponents } from 'mdx/types';
import type { MediaItem } from '@/types/content';
import { CoverImage } from '@/components/media/MediaImage';
import { MediaVideo } from '@/components/media/MediaVideo';
import { frameRatio } from '@/components/media/AlbumCard';
import { findMediaByRef } from '@/lib/content';
import { cx } from '@/lib/utils';

/**
 * What Dali can write inside an .mdx file.
 *
 * Kept small on purpose. The more exotic components exist here, the more a
 * post from 2026 depends on this repository still existing in 2046. Plain
 * markdown carries almost everything; these handle photographs, video and the
 * two or three editorial devices worth having.
 */

/* --- links ---------------------------------------------------------------- */

function Anchor({ href = '', children, ...rest }: React.ComponentProps<'a'>) {
  const isInternal = href.startsWith('/') || href.startsWith('#');
  if (isInternal) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" {...rest}>
      {children}
    </a>
  );
}

/* --- photographs ---------------------------------------------------------- */

/**
 * A single image inside an article.
 *
 *   <Figure src="dalibasor/2026/serbia/img_0042" alt="…" caption="…" bleed />
 *
 * `src` is resolved against the photo archive, and that matters twice over.
 * Without the manifest entry nothing knows which widths and formats exist, so
 * under R2 every photograph in every essay was the single 1024px JPEG — no
 * srcset, no AVIF. And without its real dimensions every one was cropped to a
 * fixed 3:2, which turns a portrait into a band across someone's chest. The
 * photograph now keeps its own proportions, clamped only at the extremes, and
 * an explicit `ratio` still wins when you want a crop.
 */
export function Figure({
  src,
  alt,
  caption,
  ratio,
  bleed = false,
  fit = 'fill',
  rowShare,
}: {
  src: string;
  alt: string;
  caption?: ReactNode;
  ratio?: string;
  /** Break out of the reading measure to the wide container. */
  bleed?: boolean;
  fit?: 'fill' | 'fit';
  /** Set by Row, never by hand: this figure's share of the row's width. */
  rowShare?: number;
}) {
  const item = findMediaByRef(src);
  const inRow = rowShare !== undefined;
  const shape =
    ratio?.trim() ||
    (item ? frameRatio(item, inRow ? 0.5 : 0.8, inRow ? 3 : 2.4) : '3 / 2');

  return (
    <figure
      className={cx(bleed && 'bleed-wide', inRow && 'min-w-0')}
      style={rowShare !== undefined ? { flex: `${rowShare.toFixed(4)} 1 0%` } : undefined}
    >
      <CoverImage
        publicId={src}
        item={item}
        alt={alt}
        ratio={shape}
        fit={fit}
        ladder={bleed ? 'bleed' : 'feature'}
        sizes={inRow ? '(min-width: 40rem) 45vw, 92vw' : bleed ? 'wide' : 'measure'}
      />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

/** The aspect a Figure will be drawn at, before it is drawn. */
function figureAspect(props: { src?: string; ratio?: string }): number {
  const explicit = props.ratio?.split('/').map((part) => Number(part.trim()));
  if (explicit && explicit.length === 2 && explicit[0]! > 0 && explicit[1]! > 0) {
    return explicit[0]! / explicit[1]!;
  }
  const item = props.src ? findMediaByRef(props.src) : undefined;
  if (!item?.width || !item.height) return 1.5;
  return Math.min(3, Math.max(0.5, item.width / item.height));
}

/**
 * Two or three photographs side by side. Collapses to a stack on mobile.
 *
 * A justified row rather than a grid of equal cells: each figure's share of
 * the width is its own aspect ratio, so every photograph in the row comes out
 * the same height at its true proportions — the trick the album pages use for
 * their pairs. A grid of equal cells has to crop a portrait next to a
 * landscape, and did.
 */
export function Row({
  children,
  caption,
  bleed = true,
}: {
  children: ReactNode;
  caption?: ReactNode;
  bleed?: boolean;
}) {
  const laidOut = Children.map(children, (child) =>
    isValidElement<{ src?: string; ratio?: string }>(child) && child.type === Figure
      ? cloneElement(child as React.ReactElement<{ rowShare?: number }>, {
          rowShare: figureAspect(child.props),
        })
      : child,
  );

  return (
    <figure className={cx(bleed && 'bleed-wide')}>
      <div className="grid gap-3 sm:flex sm:items-start [&_figcaption]:mt-2 [&>figure]:m-0">
        {laidOut}
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

/**
 * Video inside an article. Loads nothing until it is played.
 *
 * Resolved against the archive like Figure, so a clip uploaded through the
 * importer brings its real dimensions, poster, duration and placeholder with
 * it. The props are the fallback for a clip the archive does not know.
 */
export function Video({
  src,
  poster,
  caption,
  ratio,
  width = 1920,
  height = 1080,
  bleed = false,
}: {
  src: string;
  poster?: string;
  caption?: ReactNode;
  ratio?: string;
  width?: number;
  height?: number;
  bleed?: boolean;
}) {
  const known = findMediaByRef(src);
  const item: MediaItem = known
    ? {
        ...known,
        poster: known.poster ?? poster,
        caption: typeof caption === 'string' ? caption : known.caption,
      }
    : {
        id: src,
        type: 'video',
        year: 0,
        publicId: src,
        width,
        height,
        orientation: width >= height ? 'landscape' : 'portrait',
        poster,
        caption: typeof caption === 'string' ? caption : undefined,
      };

  return (
    <figure className={cx(bleed && 'bleed-wide')}>
      <MediaVideo
        item={item}
        ratio={ratio?.trim() || `${item.width} / ${item.height}`}
        cover={false}
      />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

/* --- editorial devices ---------------------------------------------------- */

/** A pull quote. Larger and more theatrical than a blockquote. */
export function Pull({ children, cite }: { children: ReactNode; cite?: string }) {
  return (
    <aside className="bleed-wide border-line my-16 border-y py-10 sm:py-14">
      <p className="u-serif mx-auto max-w-4xl text-center text-3xl leading-[1.15] text-white">
        {children}
      </p>
      {cite ? <p className="u-label text-muted mt-6 text-center">{cite}</p> : null}
    </aside>
  );
}

/** A short aside in a lighter voice. */
export function Note({
  children,
  label = 'Note',
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <aside className="border-line-strong my-10 border-l pl-5">
      <p className="u-label text-muted mb-2">{label}</p>
      <div className="text-muted text-sm [&>*+*]:mt-3">{children}</div>
    </aside>
  );
}

/**
 * Scaffolding marker.
 *
 * Every placeholder on this site is wrapped in one of these. It is deliberately
 * loud: unfinished writing should be embarrassing to leave up, and a global
 * search for "Placeholder" should find all of it.
 */
export function Placeholder({ children }: { children?: ReactNode }) {
  return (
    <div className="border-ember-deep/70 bg-ember-deep/[0.06] my-10 border border-dashed p-5 sm:p-7">
      <p className="u-label text-ember mb-3">Placeholder — replace this</p>
      <div className="text-soft text-sm [&>*+*]:mt-3">
        {children ?? (
          <p>
            <strong className="text-ivory">[DALI: WRITE THIS IN YOUR OWN WORDS]</strong>
          </p>
        )}
      </div>
    </div>
  );
}

/* --- tables --------------------------------------------------------------- */

/**
 * A table that scrolls inside itself rather than off the page.
 *
 * Handled here rather than asking the author to remember a wrapper: a table is
 * ordinary markdown, and the day this matters is the day you write one with
 * four columns and read the post on a phone.
 *
 * tabIndex is not decoration. Chromium gives a scroll container keyboard access
 * only when it is focusable, so without it the hidden columns are unreachable
 * by keyboard as well as invisible.
 */
function Table(props: React.ComponentProps<'table'>) {
  return (
    <div className="prose-scroll" tabIndex={0} role="region" aria-label="Table">
      <table {...props} />
    </div>
  );
}

/* --- map ------------------------------------------------------------------ */

export const mdxComponents: MDXComponents = {
  a: Anchor,
  table: Table,
  Figure,
  Row,
  Video,
  Pull,
  Note,
  Placeholder,
};
