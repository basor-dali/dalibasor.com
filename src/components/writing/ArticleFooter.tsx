import Link from 'next/link';
import type { PostSummary } from '@/types/content';
import { ArrowLink, Label, SectionHeader } from '@/components/primitives';
import { cx, formatDate, isoDate } from '@/lib/utils';
import { ArticlePreview } from './ArticlePreview';

/**
 * The end of an article.
 *
 * A colophon, the two entries either side of this one in time, and a few
 * things on the same subjects. Nothing to sign up for, nothing to share,
 * nothing to count. The archive is the reward.
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
      <Label className={cx('block', direction === 'Newer' && 'md:text-right')}>{direction}</Label>

      {post ? (
        <>
          <p
            className={cx(
              'u-display mt-5 text-xl text-ivory transition-colors duration-300 group-hover:text-white',
              direction === 'Newer' && 'md:text-right',
            )}
          >
            <Link href={post.href} className="after:absolute after:inset-0 after:content-['']">
              {post.title}
            </Link>
          </p>
          <time
            dateTime={isoDate(post.date)}
            className={cx(
              'u-label u-nums mt-4 block text-muted',
              direction === 'Newer' && 'md:text-right',
            )}
          >
            {formatDate(post.date)}
          </time>
        </>
      ) : (
        <p
          className={cx(
            'u-serif mt-5 text-xl text-muted',
            direction === 'Newer' && 'md:text-right',
          )}
        >
          {fallback}
        </p>
      )}
    </div>
  );
}

export function ArticleFooter({ post, previous, next, related = [] }: ArticleFooterProps) {
  return (
    <footer className="u-page pb-(--spacing-section)">
      {/* --- colophon ------------------------------------------------------ */}
      <div className="u-grid border-t border-line-strong pt-8">
        <p className="u-label col-span-2 text-muted md:col-span-4 lg:col-span-6">
          Written on{' '}
          <time dateTime={isoDate(post.date)} className="u-nums text-soft">
            {formatDate(post.date)}
          </time>
          {post.location ? <> in {post.location}</> : null}
        </p>
        <div className="col-span-2 md:col-span-2 lg:col-span-4 lg:col-start-9 lg:text-right">
          <ArrowLink href="/writing">The full archive</ArrowLink>
        </div>
      </div>

      {/* --- either side in time ------------------------------------------- */}
      <nav
        aria-label="Nearby entries"
        className="mt-(--spacing-section-sm) grid border-t border-line md:grid-cols-2"
      >
        <Neighbour
          post={previous}
          direction="Older"
          fallback="The beginning of the archive."
          className="border-b border-line md:border-r md:border-b-0 md:pr-(--spacing-gutter)"
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
                className={cx(
                  index === 1 && 'md:mt-10',
                  index === 2 && 'md:mt-20',
                )}
              >
                <ArticlePreview post={entry} variant="text" index={index} numbered headingLevel={3} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </footer>
  );
}
