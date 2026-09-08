import type { ReactNode } from 'react';
import type { MediaItem } from '@/types/content';
import { EmptyFrame } from '@/components/media/EmptyFrame';
import { CoverImage, MediaImage } from '@/components/media/MediaImage';
import type { LadderName, SizesPreset } from '@/lib/media';
import { site } from '@/lib/site';
import { cx } from '@/lib/utils';

/**
 * A cover slot. Renders the real photograph when frontmatter has one, and the
 * placeholder frame when it does not. Every image on this page goes through
 * here so the day photographs arrive, nothing else has to change.
 */
export function CoverFrame({
  publicId,
  item,
  alt,
  ratio = '3 / 2',
  sizes = 'half',
  ladder = 'feature',
  priority = false,
  className,
  placeholderLabel,
  tone,
}: {
  publicId?: string;
  /** Manifest entry, when the loader resolved one. */
  item?: MediaItem;
  alt: string;
  ratio?: string;
  sizes?: SizesPreset | (string & {});
  ladder?: LadderName;
  priority?: boolean;
  className?: string;
  placeholderLabel?: string;
  tone?: 'surface-2' | 'surface-3';
}) {
  if (publicId) {
    return (
      <CoverImage
        publicId={publicId}
        item={item}
        alt={alt}
        ratio={ratio}
        ladder={ladder}
        sizes={sizes}
        priority={priority}
        className={className}
      />
    );
  }

  return (
    <EmptyFrame
      ratio={ratio}
      label={placeholderLabel}
      className={className}
      tone={tone}
    />
  );
}

/**
 * A read-more cue for use *inside* a wrapping <Link>. It is deliberately not a
 * link itself — nesting anchors is invalid, and the whole block is already
 * clickable. Pairs with `group` on the wrapping element.
 */
export function LinkCue({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'u-label text-muted group-hover:text-ivory inline-flex items-baseline gap-2 transition-colors duration-300',
        className,
      )}
    >
      {children}
      <svg
        viewBox="0 0 16 16"
        width="11"
        height="11"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        className="translate-y-px transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:translate-x-1 motion-reduce:transform-none"
      >
        <path d="M3 8h10M9 4l4 4-4 4" />
      </svg>
    </span>
  );
}

/* ==========================================================================
   Hero
   ==========================================================================
   A masthead strip, one full-bleed photograph, and the name set large enough
   to sit over the bottom edge of it. Everything else on the page is quieter
   than this. */

const HERO_RATIO = 'aspect-[4/5] sm:aspect-[3/2] lg:aspect-[2.4/1]';

export function Hero({
  item,
  span,
}: {
  /** A featured photograph, once the archive has one. */
  item?: MediaItem;
  span: { from: number; to: number };
}) {
  return (
    <section className="relative pb-(--spacing-section)">
      {/* --- masthead strip ------------------------------------------------ */}
      <div className="u-page pt-[calc(var(--nav-height)+2.5rem)] sm:pt-[calc(var(--nav-height)+4rem)]">
        <div className="border-line flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b pb-4">
          <p className="u-label text-muted">
            Personal archive <span aria-hidden="true">·</span> {site.location}
          </p>
          <p className="u-label u-nums text-muted">
            {span.from} <span aria-hidden="true">—</span> {span.to}
          </p>
        </div>
      </div>

      {/* --- the photograph, edge to edge ---------------------------------- */}
      <div className="relative mt-8 sm:mt-12">
        {item ? (
          <MediaImage
            item={item}
            ladder="bleed"
            sizes="full"
            priority
            className={cx('w-full', HERO_RATIO)}
          />
        ) : (
          <EmptyFrame
            className={cx('w-full border-x-0', HERO_RATIO)}
            label="Portrait pending"
          />
        )}

        {/* keeps the wordmark legible whatever photograph ends up here */}
        <div
          aria-hidden="true"
          className="from-ground via-ground/55 pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t to-transparent"
        />
      </div>

      {/* --- the name, pulled up over the bottom edge ----------------------- */}
      <div className="u-page relative z-10 -mt-[min(13vw,4rem)] sm:-mt-[min(10vw,6rem)] lg:-mt-[min(7.5vw,9rem)]">
        {/* The explicit space matters: these are two block spans, and without a
            text node between them the accessible name comes out "DaliBasor".
            Whitespace between block boxes is dropped visually, so it costs
            nothing on screen. */}
        <h1 className="u-display text-5xl text-white uppercase">
          <span className="block">Dali</span> <span className="block">Basor</span>
        </h1>
      </div>

      {/* --- descriptor ----------------------------------------------------- */}
      <div className="u-page mt-10 sm:mt-14">
        <div className="u-grid items-end">
          <p className="u-serif text-soft col-span-2 max-w-(--container-text) text-xl md:col-span-6 lg:col-span-5">
            {site.descriptor}
          </p>
          <p className="u-label text-muted col-span-2 md:col-span-6 lg:col-span-4 lg:col-start-9 lg:text-right">
            Technology <span aria-hidden="true">/</span> Projects{' '}
            <span aria-hidden="true">/</span> Life <span aria-hidden="true">/</span>{' '}
            Travel <span aria-hidden="true">/</span> Photography
          </p>
        </div>
      </div>
    </section>
  );
}
