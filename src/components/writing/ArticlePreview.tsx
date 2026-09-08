import Link from 'next/link';
import type { ReactNode } from 'react';
import type { CoverShape, PostSummary } from '@/types/content';
import { CoverImage } from '@/components/media/MediaImage';
import { Label } from '@/components/primitives';
import { cx, formatDate, formatDayMonth, isoDate, ordinalLabel, truncate } from '@/lib/utils';

/**
 * One post, four ways.
 *
 * The archive needs a preview that changes weight rather than a card that gets
 * repeated: an index line reads like a book's table of contents, a lead opens a
 * page, a text block sits in a column of three without becoming a tile. Same
 * data, genuinely different compositions — the system stays coherent, the
 * layouts do not repeat.
 */

export type ArticlePreviewVariant =
  /** Page opener. Cover photograph with the type block stepping onto it. */
  | 'lead'
  /** Typography only. Used in columns and in "nearby in the archive". */
  | 'text'
  /** A single ruled line in the chronological index. */
  | 'row'
  /** A tall photograph with the title beneath it. */
  | 'portrait';

export type ArticlePreviewProps = {
  post: PostSummary;
  variant?: ArticlePreviewVariant;
  /** Zero-based. Drives the 001 / 002 editorial numbering. */
  index?: number;
  numbered?: boolean;
  /** Small mono line above or beside the title — "Featured", "Selected". */
  eyebrow?: string;
  /** Row variant: print the year alongside the day and month. */
  showYear?: boolean;
  /** Above-the-fold covers only. */
  priority?: boolean;
  className?: string;
  /** Heading level, so each page keeps one honest outline. */
  headingLevel?: 2 | 3 | 4;
};

/* --- shared bits ---------------------------------------------------------- */

const COVER_RATIO: Record<CoverShape, string> = {
  wide: '16 / 9',
  tall: '4 / 5',
  square: '1 / 1',
};

/**
 * The preview heading.
 *
 * Declared at module scope rather than picked as a tag name inside each
 * variant: a component created during render is a new component type on every
 * pass, which throws away its subtree state and trips react-hooks/static-components.
 * The level is a prop so each page can keep a correct document outline.
 */
function Heading({
  level,
  className,
  children,
}: {
  level: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  if (level === 2) return <h2 className={className}>{children}</h2>;
  if (level === 4) return <h4 className={className}>{children}</h4>;
  return <h3 className={className}>{children}</h3>;
}

function coverAltFor(post: PostSummary): string {
  return post.coverAlt ?? post.title;
}

function summaryOf(post: PostSummary, max: number): string | undefined {
  const text = post.excerpt ?? post.subtitle;
  return text ? truncate(text, max) : undefined;
}

function TagRun({ post, className }: { post: PostSummary; className?: string }) {
  if (post.tags.length === 0) return null;
  return (
    <p className={cx('u-label text-muted', className)}>{post.tags.slice(0, 4).join(' · ')}</p>
  );
}

function ReadingTime({ post, className }: { post: PostSummary; className?: string }) {
  return (
    <span className={cx('u-label u-nums text-muted', className)}>{post.readingMinutes} min</span>
  );
}

/* ==========================================================================
   Row — the index line
   ==========================================================================
   The title is the only anchor; a stretched pseudo-element makes the whole
   line clickable without burying the accessible name under a paragraph of
   metadata, and without nesting interactive elements. */

function RowPreview({ post, showYear, className, headingLevel = 3 }: ArticlePreviewProps) {

  return (
    <article className={cx('group relative border-t border-line', className)}>
      {/* An ember hairline that draws itself across the rule on hover. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 -top-px h-px origin-left scale-x-0 bg-ember-deep transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-x-100 motion-reduce:transition-none"
      />

      <div className="grid grid-cols-1 gap-x-6 gap-y-2 py-6 sm:py-7 md:grid-cols-[7.5rem_minmax(0,1fr)_4.5rem] md:items-baseline">
        <time
          dateTime={isoDate(post.date)}
          className="u-label u-nums text-muted transition-colors duration-300 group-hover:text-ember"
        >
          {showYear ? formatDate(post.date) : formatDayMonth(post.date)}
        </time>

        <div className="min-w-0">
          <Heading level={headingLevel} className="u-display text-xl text-ivory transition-colors duration-300 group-hover:text-white">
            <Link href={post.href} className="after:absolute after:inset-0 after:content-['']">
              {post.title}
            </Link>
          </Heading>

          {post.subtitle ? (
            <p className="mt-2 max-w-(--container-text) text-sm text-muted">{post.subtitle}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
            <TagRun post={post} />
            {post.placeholder ? <span className="u-label text-ember">Unfinished</span> : null}
            <ReadingTime post={post} className="md:hidden" />
          </div>
        </div>

        <ReadingTime post={post} className="hidden md:block md:text-right" />
      </div>
    </article>
  );
}

/* ==========================================================================
   Text — typography only
   ========================================================================== */

function TextPreview({
  post,
  index = 0,
  numbered = false,
  eyebrow,
  className,
  headingLevel = 3,
}: ArticlePreviewProps) {
  const summary = summaryOf(post, 150);

  return (
    <article className={cx('group relative', className)}>
      <hr className="u-rule" />

      <div className="flex items-baseline justify-between gap-4 pt-5">
        <time dateTime={isoDate(post.date)} className="u-label u-nums text-muted">
          {formatDate(post.date)}
        </time>
        {numbered ? (
          <Label>{ordinalLabel(index)}</Label>
        ) : eyebrow ? (
          <Label className="text-ember">{eyebrow}</Label>
        ) : null}
      </div>

      <Heading level={headingLevel} className="u-display mt-5 text-2xl text-ivory transition-colors duration-300 group-hover:text-white">
        <Link href={post.href} className="after:absolute after:inset-0 after:content-['']">
          {post.title}
        </Link>
      </Heading>

      {summary ? <p className="mt-4 text-sm text-muted">{summary}</p> : null}
      <TagRun post={post} className="mt-5" />
    </article>
  );
}

/* ==========================================================================
   Portrait — a tall photograph with the title beneath
   ========================================================================== */

function PortraitPreview({
  post,
  eyebrow,
  priority = false,
  className,
  headingLevel = 3,
}: ArticlePreviewProps) {

  return (
    <article className={cx('group relative', className)}>
      {post.coverImage ? (
        <CoverImage
          publicId={post.coverImage}
          alt={coverAltFor(post)}
          ratio="4 / 5"
          ladder="grid"
          /* A third of the page on desktop, half on tablet, full on phones. */
          sizes="(min-width: 64rem) 31vw, (min-width: 48rem) 45vw, 92vw"
          priority={priority}
          className="transition-opacity duration-500 group-hover:opacity-90"
        />
      ) : (
        <div aria-hidden="true" className="aspect-[4/5] w-full border border-line bg-surface" />
      )}

      <div className="flex items-baseline justify-between gap-4 pt-6">
        <time dateTime={isoDate(post.date)} className="u-label u-nums text-muted">
          {formatDate(post.date)}
        </time>
        {eyebrow ? <Label className="text-ember">{eyebrow}</Label> : null}
      </div>

      <Heading level={headingLevel} className="u-display mt-4 text-2xl text-ivory transition-colors duration-300 group-hover:text-white">
        <Link href={post.href} className="after:absolute after:inset-0 after:content-['']">
          {post.title}
        </Link>
      </Heading>

      <TagRun post={post} className="mt-5" />
    </article>
  );
}

/* ==========================================================================
   Lead — the opener
   ========================================================================== */

function LeadPreview({
  post,
  eyebrow,
  priority = true,
  className,
  headingLevel = 2,
}: ArticlePreviewProps) {
  const summary = summaryOf(post, 260);
  const cover = post.coverImage;

  return (
    <article className={cx('group relative', className)}>
      <div className="u-grid items-start">
        {cover ? (
          /* The type block below carries the real link and the accessible
             name; this one only widens the target to the photograph, so it is
             hidden from assistive tech rather than repeated to it. */
          <Link
            href={post.href}
            aria-hidden="true"
            tabIndex={-1}
            className="col-span-2 md:col-span-6 lg:col-span-8"
          >
            <CoverImage
              /* Decorative here: the link beside it already says what this is,
                 and the article page shows the same photograph described. */
              alt=""
              publicId={cover}
              ratio={COVER_RATIO[post.coverShape] ?? COVER_RATIO.wide}
              ladder="feature"
              /* Two thirds of the page on desktop, the whole of it below that. */
              sizes="(min-width: 64rem) 63vw, 92vw"
              priority={priority}
              className="transition-opacity duration-500 group-hover:opacity-90"
            />
          </Link>
        ) : null}

        {/* The type block steps onto the photograph's lower corner on wide
            screens and simply sits underneath it on small ones. */}
        <div
          className={cx(
            'relative z-10 col-span-2 md:col-span-6',
            cover
              ? 'lg:col-span-6 lg:col-start-6 lg:-mt-32 lg:bg-ground lg:pt-10 lg:pl-10'
              : 'lg:col-span-9',
          )}
        >
          {eyebrow ? <Label className="mb-5 block text-ember">{eyebrow}</Label> : null}

          <Heading level={headingLevel} className="u-display u-display-tight max-w-[15ch] text-3xl text-white">
            <Link href={post.href} className="after:absolute after:inset-0 after:content-['']">
              {post.title}
            </Link>
          </Heading>

          {post.subtitle ? (
            <p className="u-serif mt-6 max-w-(--container-text) text-xl text-soft">
              {post.subtitle}
            </p>
          ) : null}

          {summary && !post.subtitle ? (
            <p className="mt-6 max-w-(--container-text) text-soft">{summary}</p>
          ) : null}

          <div className="mt-8 flex flex-wrap items-baseline gap-x-5 gap-y-2">
            <time dateTime={isoDate(post.date)} className="u-label u-nums text-muted">
              {formatDate(post.date)}
            </time>
            <span aria-hidden="true" className="u-label text-line-strong">
              /
            </span>
            <ReadingTime post={post} />
            {post.location ? (
              <>
                <span aria-hidden="true" className="u-label text-line-strong">
                  /
                </span>
                <span className="u-label text-muted">{post.location}</span>
              </>
            ) : null}
          </div>

          <TagRun post={post} className="mt-4" />
        </div>
      </div>
    </article>
  );
}

/* ==========================================================================
   Entry point
   ========================================================================== */

export function ArticlePreview(props: ArticlePreviewProps) {
  const { variant = 'row' } = props;

  switch (variant) {
    case 'lead':
      return <LeadPreview {...props} />;
    case 'text':
      return <TextPreview {...props} />;
    case 'portrait':
      return <PortraitPreview {...props} />;
    default:
      return <RowPreview {...props} />;
  }
}
