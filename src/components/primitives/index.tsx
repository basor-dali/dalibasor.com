import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx, formatDate, isoDate } from '@/lib/utils';

/**
 * The small shared vocabulary. Every page is built out of these plus
 * typography, so section-to-section variation stays intentional rather than
 * accidental.
 */

/* --- eyebrow label -------------------------------------------------------- */

/**
 * Colour utilities from the palette, so Label can tell whether a caller has
 * already chosen one. `cx` is a plain string join — it cannot resolve a
 * conflict — so emitting a default colour alongside a caller's `text-ember`
 * left both classes on the element and handed the decision to stylesheet
 * source order. `text-muted` sorts later than `text-ember`, so every eyebrow
 * that asked for ember silently painted grey.
 */
const COLOR_UTILITY =
  /(^|\s)text-(white|ivory|soft|muted|mute|ember|ember-deep|line|line-strong|ground|ground-deep|surface|surface-2|surface-3)(\/|\s|$)/;

export function Label({
  children,
  className,
  as: Tag = 'span',
}: {
  children: ReactNode;
  className?: string;
  as?: 'span' | 'p' | 'div' | 'h2';
}) {
  // `muted` (5.40:1) rather than `mute` (3.58:1): u-label is 11px, which needs
  // 4.5:1. This is the colour of nearly every date, tag and count on the site.
  const colored = className ? COLOR_UTILITY.test(className) : false;
  return (
    <Tag className={cx('u-label', !colored && 'text-muted', className)}>{children}</Tag>
  );
}

/* --- section header ------------------------------------------------------- */

/**
 * An eyebrow, a display title and an optional link out. Used to open each
 * homepage section and each index page. The rule underneath is what ties the
 * whole site together visually.
 */
export function SectionHeader({
  eyebrow,
  title,
  link,
  description,
  className,
  headingLevel = 2,
  rule = true,
}: {
  eyebrow?: string;
  title: ReactNode;
  link?: { href: string; label: string };
  description?: ReactNode;
  className?: string;
  headingLevel?: 1 | 2 | 3;
  rule?: boolean;
}) {
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3';

  return (
    <header className={cx(className)}>
      {rule ? <hr className="u-rule mb-6" /> : null}
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          {eyebrow ? <Label className="mb-3 block">{eyebrow}</Label> : null}
          <Heading className="u-display text-2xl text-white">{title}</Heading>
        </div>
        {link ? (
          <ArrowLink href={link.href}>{link.label}</ArrowLink>
        ) : null}
      </div>
      {description ? (
        <div className="mt-4 max-w-(--container-text) text-soft">{description}</div>
      ) : null}
    </header>
  );
}

/* --- links ---------------------------------------------------------------- */

export function ArrowLink({
  href,
  children,
  className,
  external = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  external?: boolean;
}) {
  const content = (
    <span className="inline-flex items-baseline gap-2">
      <span className="u-link u-link-reveal">{children}</span>
      <svg
        viewBox="0 0 16 16"
        width="11"
        height="11"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        className="translate-y-px transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover/arrow:translate-x-1 motion-reduce:transform-none"
      >
        <path d="M3 8h10M9 4l4 4-4 4" />
      </svg>
    </span>
  );

  const classes = cx(
    'group/arrow u-label shrink-0 text-muted transition-colors duration-300 hover:text-ivory',
    className,
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}

/* --- metadata ------------------------------------------------------------- */

export function TimeStamp({
  date,
  format = 'full',
  className,
}: {
  date: string;
  format?: 'full' | 'raw';
  className?: string;
}) {
  return (
    <time dateTime={isoDate(date)} className={cx('u-label u-nums', className)}>
      {format === 'raw' ? date : formatDate(date)}
    </time>
  );
}

/** A dot-separated run of small metadata. Renders nothing if it is all empty. */
export function MetaLine({
  items,
  className,
}: {
  items: (ReactNode | undefined | false | null)[];
  className?: string;
}) {
  const present = items.filter(Boolean);
  if (present.length === 0) return null;

  return (
    <p className={cx('u-label flex flex-wrap items-center gap-x-2 gap-y-1 text-muted', className)}>
      {present.map((item, index) => (
        <span key={index} className="flex items-center gap-x-2">
          {index > 0 ? (
            <span aria-hidden="true" className="text-line-strong">
              ·
            </span>
          ) : null}
          {item}
        </span>
      ))}
    </p>
  );
}

/* --- tags ----------------------------------------------------------------- */

export function TagList({
  tags,
  className,
  linked = true,
}: {
  tags: { label: string; slug: string }[];
  className?: string;
  linked?: boolean;
}) {
  if (tags.length === 0) return null;

  return (
    <ul className={cx('flex list-none flex-wrap gap-x-2 gap-y-1.5 p-0', className)}>
      {tags.map((tag) => (
        <li key={tag.slug}>
          {linked ? (
            <Link
              href={`/writing/tag/${tag.slug}`}
              className="u-label border border-line px-2 py-1 text-muted transition-colors duration-300 hover:border-line-strong hover:text-ivory"
            >
              {tag.label}
            </Link>
          ) : (
            <span className="u-label border border-line px-2 py-1 text-muted">{tag.label}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* --- status --------------------------------------------------------------- */

export function StatusDot({ status }: { status: string }) {
  const live = status === 'building' || status === 'experiment';
  const dead = status === 'abandoned';

  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-block h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full',
        live ? 'bg-ember' : dead ? 'bg-line-strong' : 'bg-mute',
      )}
    />
  );
}

/* --- big numerals --------------------------------------------------------- */

/**
 * A year set at colossal size. Used behind and beside photography — time is a
 * design element on this site, not a caption.
 */
export function YearMark({
  year,
  className,
  as: Tag = 'span',
}: {
  year: number | string;
  className?: string;
  as?: 'span' | 'h1' | 'h2';
}) {
  return (
    <Tag
      className={cx(
        'u-display u-display-tight u-nums block text-colossal font-semibold',
        className,
      )}
    >
      {year}
    </Tag>
  );
}

/* --- page opener ---------------------------------------------------------- */

/**
 * The standard top of a non-home page: a big title, an optional line of
 * metadata, and a lot of space above it so the fixed nav never crowds it.
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  meta,
  children,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx('u-page pt-36 pb-(--spacing-section-sm) sm:pt-44', className)}>
      {eyebrow ? <Label className="mb-6 block">{eyebrow}</Label> : null}
      <h1 className="u-display u-display-tight max-w-[16ch] text-4xl text-white">{title}</h1>
      {lede ? (
        <p className="u-serif mt-8 max-w-(--container-text) text-xl text-soft">{lede}</p>
      ) : null}
      {meta ? <div className="mt-8">{meta}</div> : null}
      {children}
    </header>
  );
}

/* --- empty state ---------------------------------------------------------- */

export function EmptyState({
  title,
  children,
  className,
}: {
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('border border-line px-6 py-16 text-center', className)}>
      <p className="u-display text-xl text-ivory">{title}</p>
      {children ? (
        <div className="mx-auto mt-3 max-w-md text-sm text-muted">{children}</div>
      ) : null}
    </div>
  );
}
