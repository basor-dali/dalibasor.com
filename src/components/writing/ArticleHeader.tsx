import type { ReactNode } from 'react';
import type { CoverShape, Post } from '@/types/content';
import { CoverImage } from '@/components/media/MediaImage';
import { Label, TagList } from '@/components/primitives';
import { cx, formatDate, isoDate, pluralize, slugify } from '@/lib/utils';

/**
 * The opening of an article.
 *
 * A masthead rather than a card: the title at display scale on the left, a
 * small mono column of facts on the right, then the photograph. The cover's
 * declared shape decides the composition, so a portrait frame is never
 * stretched across the page and a wide one is never boxed in.
 */

type CoverPlan = {
  ratio: string;
  /** Grid placement inside the 12-column editorial grid. */
  column: string;
  /** `sizes` matched to that placement — the whole point of the media layer. */
  sizes: string;
  ladder: 'feature' | 'bleed';
};

const COVER_PLANS: Record<CoverShape, CoverPlan> = {
  /* Full page width. Cinematic band under the title. */
  wide: {
    ratio: '2 / 1',
    column: 'col-span-2 md:col-span-6 lg:col-span-12',
    sizes: '(min-width: 108rem) 101rem, 92vw',
    ladder: 'bleed',
  },
  /* Two thirds, centred — a plate on a page. */
  square: {
    ratio: '1 / 1',
    column: 'col-span-2 md:col-span-6 lg:col-span-8 lg:col-start-3',
    sizes: '(min-width: 64rem) 63vw, 92vw',
    ladder: 'feature',
  },
  /* Half width, offset right. A tall photograph should never be a banner. */
  tall: {
    ratio: '4 / 5',
    column: 'col-span-2 md:col-span-4 md:col-start-2 lg:col-span-6 lg:col-start-4',
    sizes: '(min-width: 64rem) 46vw, (min-width: 48rem) 62vw, 92vw',
    ladder: 'feature',
  },
};

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="u-label text-muted">{term}</dt>
      <dd className="u-label u-nums text-soft mt-2 ml-0">{children}</dd>
    </div>
  );
}

export function ArticleHeader({ post }: { post: Post }) {
  const plan = COVER_PLANS[post.coverShape] ?? COVER_PLANS.wide;
  const cover = post.coverImage;

  return (
    <header className="u-page pt-36 sm:pt-44">
      <div className="u-grid">
        <div className="col-span-2 md:col-span-6 lg:col-span-8">
          <Label className="text-ember mb-7 block">Writing</Label>

          <h1 className="u-display u-display-tight max-w-[16ch] text-4xl text-white">
            {post.title}
          </h1>

          {post.subtitle ? (
            <p className="u-serif text-soft mt-8 max-w-(--container-text-wide) text-xl">
              {post.subtitle}
            </p>
          ) : null}

          {post.tags.length > 0 ? (
            <TagList
              className="mt-10"
              tags={post.tags.map((tag) => ({ label: tag, slug: slugify(tag) }))}
            />
          ) : null}
        </div>

        {/* The facts, set small and mono, off to the side. */}
        <dl className="col-span-2 flex flex-wrap gap-x-10 gap-y-6 md:col-span-6 lg:col-span-3 lg:col-start-10 lg:mt-4 lg:flex-col">
          <Fact term="Published">
            <time dateTime={isoDate(post.date)}>{formatDate(post.date)}</time>
          </Fact>
          {post.location ? <Fact term="Written in">{post.location}</Fact> : null}
          <Fact term="Reading">{pluralize(post.readingMinutes, 'minute')}</Fact>
        </dl>
      </div>

      {cover ? (
        <div className="u-grid mt-(--spacing-section-sm)">
          <figure className={cx('m-0', plan.column)}>
            <CoverImage
              publicId={cover}
              alt={post.coverAlt ?? post.title}
              ratio={plan.ratio}
              ladder={plan.ladder}
              sizes={plan.sizes}
              priority
            />
          </figure>
        </div>
      ) : (
        <hr className="u-rule mt-(--spacing-section-sm)" />
      )}
    </header>
  );
}
