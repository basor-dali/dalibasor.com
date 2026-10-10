import Link from 'next/link';
import type { ReactNode } from 'react';
import type { MediaItem, NowSummary, PostSummary, ProjectSummary } from '@/types/content';
import { EmptyFrame } from '@/components/media/EmptyFrame';
import { CoverImage, MediaImage } from '@/components/media/MediaImage';
import { StatusDot } from '@/components/primitives';
import { STATUS_LABELS } from '@/lib/content';
import type { LadderName, SizesPreset } from '@/lib/media';
import { site } from '@/lib/site';
import { cx, formatDate } from '@/lib/utils';

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
   than this.

   Until a photograph is marked featured there is nothing to put edge to edge,
   and a hero-sized empty frame was the first thing anyone saw: it read as an
   image that had failed to load. So the opener has a second, typographic
   form — the name alone at full size, and under it three doors into the site
   (the newest writing, what is on the bench, what this month is). The day a
   photograph is featured the full-bleed version returns unchanged. */

const HERO_RATIO = 'aspect-[4/5] sm:aspect-[3/2] lg:aspect-[2.4/1]';

/** The three doors the typographic opener offers. Any may be missing. */
export type HeroPointers = {
  latest?: PostSummary;
  building?: ProjectSummary;
  now?: NowSummary;
};

export function Hero({
  item,
  span,
  pointers,
}: {
  /** A featured photograph, once the archive has one. */
  item?: MediaItem;
  span: { from: number; to: number };
  pointers?: HeroPointers;
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
            {span.from}
            <span aria-hidden="true"> — </span>
            <span className="sr-only"> to </span>
            {span.to}
          </p>
        </div>
      </div>

      {item ? (
        <>
          {/* --- the photograph, edge to edge ------------------------------ */}
          <div className="relative mt-8 sm:mt-12">
            <MediaImage
              item={item}
              ladder="bleed"
              sizes="full"
              priority
              className={cx('w-full', HERO_RATIO)}
            />

            {/* keeps the wordmark legible whatever photograph ends up here */}
            <div
              aria-hidden="true"
              className="from-ground via-ground/55 pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t to-transparent"
            />
          </div>

          {/* --- the name, pulled up over the bottom edge ------------------- */}
          <div className="u-page relative z-10 -mt-[min(13vw,4rem)] sm:-mt-[min(10vw,6rem)] lg:-mt-[min(7.5vw,9rem)]">
            <HeroName />
          </div>
        </>
      ) : (
        /* --- no photograph yet: the name is the opener ------------------- */
        <div className="u-page mt-16 sm:mt-24 lg:mt-32">
          <HeroName />
        </div>
      )}

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

      {!item && pointers ? <HeroDoors pointers={pointers} /> : null}
    </section>
  );
}

function HeroName() {
  return (
    // The explicit space matters: these are two block spans, and without a
    // text node between them the accessible name comes out "DaliBasor".
    // Whitespace between block boxes is dropped visually, so it costs nothing
    // on screen.
    <h1 className="u-display text-5xl text-white uppercase">
      <span className="block">Dali</span> <span className="block">Basor</span>
    </h1>
  );
}

/**
 * Three ways in, for the opener that has no photograph to lead with.
 *
 * Each is a real link with the title as its name — the cell is clickable
 * through a stretched pseudo-element, so a screen reader hears "Why I'm
 * Starting This Website at 33", not a paragraph of labels.
 */
function HeroDoors({ pointers }: { pointers: HeroPointers }) {
  const doors: { key: string; label: string; href: string; title: string; meta: ReactNode }[] =
    [];

  if (pointers.latest) {
    doors.push({
      key: 'latest',
      label: 'Latest writing',
      href: pointers.latest.href,
      title: pointers.latest.title,
      meta: formatDate(pointers.latest.date),
    });
  }
  if (pointers.building) {
    doors.push({
      key: 'building',
      label: 'On the bench',
      href: pointers.building.href,
      title: pointers.building.title,
      meta: (
        <span className="inline-flex items-center gap-2">
          <StatusDot status={pointers.building.status} />
          {STATUS_LABELS[pointers.building.status]}
          <span aria-hidden="true" className="text-line-strong">
            ·
          </span>
          <span className="u-nums">{pointers.building.period}</span>
        </span>
      ),
    });
  }
  if (pointers.now) {
    doors.push({
      key: 'now',
      label: 'Now',
      href: '/now',
      title: pointers.now.title,
      meta: pointers.now.location ?? 'This month',
    });
  }

  if (doors.length === 0) return null;

  return (
    <nav aria-label="Start here" className="u-page mt-(--spacing-section-sm)">
      <ul className="u-grid m-0 list-none p-0">
        {doors.map((door) => (
          <li
            key={door.key}
            className="group border-line hover:border-line-strong relative col-span-2 border-t pt-5 transition-colors duration-500 md:col-span-2 lg:col-span-4"
          >
            <p className="u-label text-muted group-hover:text-ember transition-colors duration-300">
              {door.label}
            </p>
            <p className="u-display text-ivory mt-3 text-xl transition-colors duration-300 group-hover:text-white">
              <Link href={door.href} className="after:absolute after:inset-0 after:content-['']">
                {door.title}
              </Link>
            </p>
            <p className="u-label text-muted mt-3">{door.meta}</p>
          </li>
        ))}
      </ul>
    </nav>
  );
}
