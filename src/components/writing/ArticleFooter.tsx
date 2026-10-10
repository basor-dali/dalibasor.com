import Link from 'next/link';
import type { PostSummary } from '@/types/content';
import { ArrowLink, Label, SectionHeader } from '@/components/primitives';
import { replyHref } from '@/lib/site';
import { cx, formatDate, isoDate } from '@/lib/utils';
import { ArticlePreview } from './ArticlePreview';

/**
 * The end of an article.
 *
 * A colophon, the two entries either side of this one in time, and a few
 * things on the same subjects. Nothing to sign up for, nothing to share,
 * nothing to count. The archive is the reward.
 *
 * And two quiet ways to stay in touch with the person behind it: an email
 * with the subject already filled in — no comments here, but a reply has
 * always been possible, it just was not offered — and the feeds, for anyone
 * who wants the next one. Neither tracks anything.
 */

export type ArticleFooterProps = {
  post: PostSummary;
  /** Older — the entry published before this one. */
  previous?: PostSummary;
  /** Newer — the entry published after this one. */
  next?: PostSummary;
  related?: PostSummary[];
};

function Neighbour({
  post,
  direction,
  fallback,
  className,
}: {
  post?: PostSummary;
  direction: 'Older' | 'Newer';
  fallback: string;
  className?: string;
}) {
  return (
    <div className={cx('group relative py-9', className)}>
      <Label className={cx('block', direction === 'Newer' && 'md:text-right')}>
        {direction}
      </Label>

      {post ? (
        <>
          <p
            className={cx(
              'u-display text-ivory mt-5 text-xl transition-colors duration-300 group-hover:text-white',
              direction === 'Newer' && 'md:text-right',
            )}
          >
            <Link
              href={post.href}
              className="after:absolute after:inset-0 after:content-['']"
            >
              {post.title}
            </Link>
          </p>
          <time
            dateTime={isoDate(post.date)}
            className={cx(
              'u-label u-nums text-muted mt-4 block',
              direction === 'Newer' && 'md:text-right',
            )}
          >
            {formatDate(post.date)}
          </time>
        </>
      ) : (
        <p
          className={cx(
            'u-serif text-muted mt-5 text-xl',
            direction === 'Newer' && 'md:text-right',
          )}
        >
          {fallback}
        </p>
      )}
    </div>
  );
}

export function ArticleFooter({
  post,
  previous,
  next,
  related = [],
}: ArticleFooterProps) {
  return (
    <footer className="u-page pb-(--spacing-section)">
      {/* --- colophon ------------------------------------------------------ */}
      <div className="u-grid border-line-strong border-t pt-8">
        <p className="u-label text-muted col-span-2 md:col-span-4 lg:col-span-6">
          Written on{' '}
          <time dateTime={isoDate(post.date)} className="u-nums text-soft">
            {formatDate(post.date)}
          </time>
          {post.location ? <> in {post.location}</> : null}
        </p>
        {/* The year this was written, as a place to go: everything else
            from then — what was being built, the photographs, the Now
            entries. */}
        <div className="col-span-2 flex flex-wrap gap-x-8 gap-y-3 md:col-span-2 lg:col-span-5 lg:col-start-8 lg:justify-end">
          <ArrowLink href={`/years/${post.year}`}>More from {post.year}</ArrowLink>
          <ArrowLink href="/writing">The full archive</ArrowLink>
        </div>
      </div>

      {/* --- answer, follow -------------------------------------------------- */}
      <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
        <a
          href={replyHref(`Re: ${post.title}`)}
          className="u-label border-line-strong text-ivory hover:border-ember border px-4 py-3 transition-colors duration-300 hover:text-white"
        >
          Reply by email
        </a>
        <p className="u-label text-muted">
          Follow by{' '}
          <Link href="/feeds" className="u-link u-link-reveal hover:text-ivory">
            RSS or JSON Feed
          </Link>
        </p>
      </div>

      {/* --- either side in time ------------------------------------------- */}
      <nav
        aria-label="Nearby entries"
        className="border-line mt-(--spacing-section-sm) grid border-t md:grid-cols-2"
      >
        <Neighbour
          post={previous}
          direction="Older"
          fallback="The beginning of the archive."
          className="border-line border-b md:border-r md:border-b-0 md:pr-(--spacing-gutter)"
        />
        <Neighbour
          post={next}
          direction="Newer"
          fallback="This is the most recent."
          className="md:pl-(--spacing-gutter)"
        />
      </nav>

      {/* --- same subjects ------------------------------------------------- */}
      {related.length > 0 ? (
        <section className="mt-(--spacing-section)">
          <SectionHeader eyebrow="Related" title="Nearby in the archive" />
          <ol className="mt-14 grid list-none grid-cols-1 gap-x-(--spacing-gutter) gap-y-12 p-0 md:grid-cols-3">
            {related.slice(0, 3).map((entry, index) => (
              <li
                key={entry.slug}
                /* A staircase rather than three equal tiles. */
                className={cx(index === 1 && 'md:mt-10', index === 2 && 'md:mt-20')}
              >
                <ArticlePreview
                  post={entry}
                  variant="text"
                  index={index}
                  numbered
                  headingLevel={3}
                />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </footer>
  );
}
