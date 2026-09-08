import Link from 'next/link';
import type { PostSummary } from '@/types/content';
import {
  EmptyState,
  Label,
  MetaLine,
  SectionHeader,
  TagList,
  TimeStamp,
} from '@/components/primitives';
import { cx, formatDate, isoDate, ordinalLabel, slugify, truncate } from '@/lib/utils';
import { CoverFrame, LinkCue } from './Hero';

/**
 * Latest writing.
 *
 * Three compositions, deliberately unequal: a lead with a wide photograph, a
 * pair of text-only entries offset from each other, and a tail entry hung off
 * a tall portrait. Nothing here should read as three identical cards.
 */

export function LatestWriting({ posts }: { posts: PostSummary[] }) {
  const lead = posts[0];
  const pair = posts.slice(1, 3);
  const tail = posts[3];

  return (
    <section className="u-page py-(--spacing-section-sm)" aria-labelledby="home-writing">
      <SectionHeader
        eyebrow="Writing"
        title={<span id="home-writing">Latest</span>}
        link={{ href: '/writing', label: 'All writing' }}
      />

      {!lead ? (
        <EmptyState className="mt-12" title="Nothing published yet">
          The first essays and notes will appear here.{' '}
          <Link href="/writing" className="u-link u-link-reveal text-ivory">
            Writing
          </Link>
        </EmptyState>
      ) : (
        <>
          {/* --- 001 — the lead, text left, photograph right ---------------- */}
          <Lead post={lead} />

          {/* --- 002 / 003 — text only, offset from each other -------------- */}
          {pair.length > 0 ? (
            <div className="u-grid border-line mt-(--spacing-section-sm) border-t pt-10 sm:pt-14">
              {pair.map((post, index) => (
                <TextEntry
                  key={post.slug}
                  post={post}
                  index={index + 1}
                  className={cx(
                    'col-span-2 md:col-span-3 lg:col-span-5',
                    index === 0 ? 'lg:col-start-1' : 'lg:col-start-8',
                  )}
                />
              ))}
            </div>
          ) : null}

          {/* --- 004 — hung off a tall portrait ----------------------------- */}
          {tail ? <TailEntry post={tail} /> : null}
        </>
      )}
    </section>
  );
}

/* ==========================================================================
   Lead
   ========================================================================== */

function Lead({ post }: { post: PostSummary }) {
  return (
    <article className="mt-12 sm:mt-16">
      <Link href={post.href} className="group block">
        <div className="u-grid items-end">
          <div className="col-span-2 md:col-span-6 lg:col-span-5 lg:row-start-1">
            <div className="flex items-baseline gap-4">
              <Label className="u-nums">{ordinalLabel(0)}</Label>
              <hr className="u-rule hidden flex-1 sm:block" />
            </div>

            <h3 className="u-display mt-6 text-3xl text-white">
              <span className="u-link u-link-reveal">{post.title}</span>
            </h3>

            {post.subtitle ? (
              <p className="u-serif text-soft mt-4 text-xl">{post.subtitle}</p>
            ) : null}

            {post.excerpt ? (
              <p className="text-soft mt-6 max-w-(--container-text)">
                {truncate(post.excerpt, 220)}
              </p>
            ) : null}

            <MetaLine
              className="mt-8"
              items={[
                <time key="d" dateTime={isoDate(post.date)}>
                  {formatDate(post.date)}
                </time>,
                post.location,
                `${post.readingMinutes} min read`,
              ]}
            />

            {post.tags.length > 0 ? (
              <TagList
                className="mt-5"
                linked={false}
                tags={post.tags
                  .slice(0, 4)
                  .map((tag) => ({ label: tag, slug: slugify(tag) }))}
              />
            ) : null}
          </div>

          <div className="col-span-2 md:col-span-6 lg:col-span-7 lg:col-start-6 lg:row-start-1">
            <CoverFrame
              publicId={post.coverImage}
              alt={post.coverAlt ?? post.title}
              ratio="3 / 2"
              ladder="feature"
              sizes="twoThirds"
              className="transition-opacity duration-700 group-hover:opacity-90"
            />
          </div>
        </div>
      </Link>
    </article>
  );
}

/* ==========================================================================
   Text-dominant entry
   ========================================================================== */

function TextEntry({
  post,
  index,
  className,
}: {
  post: PostSummary;
  index: number;
  className?: string;
}) {
  return (
    <article className={className}>
      <Link href={post.href} className="group block">
        <div className="flex items-baseline gap-4">
          <Label className="u-nums">{ordinalLabel(index)}</Label>
          <TimeStamp date={post.date} className="text-muted" />
        </div>

        <h3 className="u-display text-ivory mt-5 text-2xl transition-colors duration-300 group-hover:text-white">
          <span className="u-link u-link-reveal">{post.title}</span>
        </h3>

        {post.excerpt ? (
          <p className="text-muted mt-4 text-sm">{truncate(post.excerpt, 160)}</p>
        ) : null}

        {post.tags.length > 0 ? (
          <p className="u-label text-muted mt-5">{post.tags.slice(0, 3).join('  ·  ')}</p>
        ) : null}
      </Link>
    </article>
  );
}

/* ==========================================================================
   Tail — portrait, offset
   ========================================================================== */

function TailEntry({ post }: { post: PostSummary }) {
  return (
    <article className="mt-(--spacing-section-sm)">
      <Link href={post.href} className="group block">
        <div className="u-grid items-center">
          <div className="col-span-2 md:col-span-2 lg:col-span-3 lg:col-start-2">
            <div className="w-[62%] md:w-full">
              <CoverFrame
                publicId={post.coverImage}
                alt={post.coverAlt ?? post.title}
                ratio="3 / 4"
                ladder="grid"
                sizes="(min-width: 64rem) 24vw, (min-width: 48rem) 32vw, 62vw"
                tone="surface-3"
                placeholderLabel="Portrait"
              />
            </div>
          </div>

          <div className="col-span-2 md:col-span-4 lg:col-span-6 lg:col-start-6">
            <div className="flex items-baseline gap-4">
              <Label className="u-nums">{ordinalLabel(3)}</Label>
              <TimeStamp date={post.date} className="text-muted" />
            </div>

            <h3 className="u-display text-ivory mt-5 text-2xl transition-colors duration-300 group-hover:text-white">
              <span className="u-link u-link-reveal">{post.title}</span>
            </h3>

            {post.excerpt ? (
              <p className="text-muted mt-4 max-w-(--container-text) text-sm">
                {truncate(post.excerpt, 200)}
              </p>
            ) : null}

            <LinkCue className="mt-8">Read</LinkCue>
          </div>
        </div>
      </Link>
    </article>
  );
}
