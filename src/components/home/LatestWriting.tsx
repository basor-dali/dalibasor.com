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
 *
 * Most essays will never have a photograph, and a cover slot labelled
 * "Photograph pending" told every visitor that something was missing when
 * nothing was. A post without a cover gets the typographic version of its
 * composition instead — the lead takes the width the photograph would have
 * had, and the tail keeps its offset without the frame.
 *
 * Every entry is clickable as a whole, but only the title is the link: a
 * stretched pseudo-element carries the hit area. Wrapping the block in one
 * anchor made each entry's accessible name a paragraph that started with its
 * number — "001 About the Writing on This Site September 8, 2026 1 min read
 * Life" — which is the same problem the archive rows already solve this way.
 */

export function LatestWriting({ posts }: { posts: PostSummary[] }) {
  const lead = posts[0];
  const pair = posts.slice(1, 3);
  const tail = posts[3];

  return (
    <section className="u-page py-(--spacing-section-sm)" aria-labelledby="home-writing">
      <SectionHeader
        size="display"
        rule="strong"
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

/** The one link in an entry. Its ::after stretches over the whole article. */
function TitleLink({ post }: { post: PostSummary }) {
  return (
    <Link href={post.href} className="after:absolute after:inset-0 after:content-['']">
      <span className="u-link u-link-reveal group-hover:[background-size:100%_1px]">
        {post.title}
      </span>
    </Link>
  );
}

/* ==========================================================================
   Lead
   ========================================================================== */

function Lead({ post }: { post: PostSummary }) {
  if (!post.coverImage) return <TypeLead post={post} />;

  return (
    <article className="group relative mt-12 sm:mt-16">
      <div className="u-grid items-end">
        <div className="col-span-2 md:col-span-6 lg:col-span-5 lg:row-start-1">
          <div className="flex items-baseline gap-4">
            <Label className="u-nums">{ordinalLabel(0)}</Label>
            <hr className="u-rule hidden flex-1 sm:block" />
          </div>

          <h3 className="u-display mt-6 text-3xl text-white">
            <TitleLink post={post} />
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
              tags={post.tags.slice(0, 4).map((tag) => ({ label: tag, slug: slugify(tag) }))}
            />
          ) : null}
        </div>

        <div className="col-span-2 md:col-span-6 lg:col-span-7 lg:col-start-6 lg:row-start-1">
          <CoverFrame
            publicId={post.coverImage}
            item={post.coverItem}
            alt={post.coverAlt ?? post.title}
            ratio="3 / 2"
            ladder="feature"
            sizes="twoThirds"
            className="transition-opacity duration-700 group-hover:opacity-90"
          />
        </div>
      </div>
    </article>
  );
}

/* ==========================================================================
   Lead, with no photograph
   ==========================================================================
   The headline takes the room the photograph would have had. The summary and
   the facts sit in their own column to the right on wide screens, so the
   block still has two sides rather than one long left-aligned run. */

function TypeLead({ post }: { post: PostSummary }) {
  const summary = post.excerpt ?? post.subtitle;

  return (
    <article className="group relative mt-12 sm:mt-16">
      <div className="flex items-baseline gap-4">
        <Label className="u-nums">{ordinalLabel(0)}</Label>
        <hr className="u-rule hidden flex-1 sm:block" />
      </div>

      <div className="u-grid mt-6 items-end">
        <h3 className="u-display u-display-tight col-span-2 max-w-[18ch] text-4xl text-white md:col-span-6 lg:col-span-8">
          <TitleLink post={post} />
        </h3>

        <div className="col-span-2 md:col-span-6 lg:col-span-4 lg:col-start-9 lg:pb-2">
          {summary ? (
            <p className="u-serif text-soft text-xl">{truncate(summary, 200)}</p>
          ) : null}

          <MetaLine
            className={summary ? 'mt-6' : undefined}
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
              tags={post.tags.slice(0, 4).map((tag) => ({ label: tag, slug: slugify(tag) }))}
            />
          ) : null}
        </div>
      </div>
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
    <article className={cx('group relative', className)}>
      <div className="flex items-baseline gap-4">
        <Label className="u-nums">{ordinalLabel(index)}</Label>
        <TimeStamp date={post.date} className="text-muted" />
      </div>

      <h3 className="u-display text-ivory mt-5 text-2xl transition-colors duration-300 group-hover:text-white">
        <TitleLink post={post} />
      </h3>

      {post.excerpt ? (
        <p className="text-muted mt-4 text-sm">{truncate(post.excerpt, 160)}</p>
      ) : null}

      {post.tags.length > 0 ? (
        <p className="u-label text-muted mt-5">{post.tags.slice(0, 3).join('  ·  ')}</p>
      ) : null}
    </article>
  );
}

/* ==========================================================================
   Tail — portrait, offset
   ========================================================================== */

function TailEntry({ post }: { post: PostSummary }) {
  // Without a portrait to hang from, the entry keeps its place in the
  // staircase — offset to the right of the pair above — as text alone.
  if (!post.coverImage) {
    return (
      <div className="u-grid border-line mt-(--spacing-section-sm) border-t pt-10 sm:pt-14">
        <TextEntry
          post={post}
          index={3}
          className="col-span-2 md:col-span-4 md:col-start-3 lg:col-span-6 lg:col-start-5"
        />
      </div>
    );
  }

  return (
    <article className="group relative mt-(--spacing-section-sm)">
      <div className="u-grid items-center">
        <div className="col-span-2 md:col-span-2 lg:col-span-3 lg:col-start-2">
          <div className="w-[62%] md:w-full">
            <CoverFrame
              publicId={post.coverImage}
              item={post.coverItem}
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
            <TitleLink post={post} />
          </h3>

          {post.excerpt ? (
            <p className="text-muted mt-4 max-w-(--container-text) text-sm">
              {truncate(post.excerpt, 200)}
            </p>
          ) : null}

          <LinkCue className="mt-8">Read</LinkCue>
        </div>
      </div>
    </article>
  );
}
