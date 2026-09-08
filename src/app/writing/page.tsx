import type { Metadata } from 'next';
import Link from 'next/link';
import { getFeaturedPosts, getPosts, getTags, getWritingYears } from '@/lib/content';
import { breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/metadata';
import {
  EmptyState,
  Label,
  MetaLine,
  PageHeader,
  SectionHeader,
} from '@/components/primitives';
import { ArticlePreview } from '@/components/writing/ArticlePreview';
import { WritingArchive } from '@/components/writing/WritingArchive';
import { pluralize } from '@/lib/utils';

/**
 * /writing — the complete chronological index.
 *
 * The page is a Server Component; only the filter bar and the list it controls
 * hydrate, and they receive `PostSummary[]` with no bodies attached. At five
 * hundred entries this is still one HTML document and one small script.
 */

export const metadata: Metadata = pageMetadata({
  title: 'Writing',
  description: 'The complete writing archive — every entry, newest first.',
  path: '/writing',
  /* No per-section OG route exists, so use the site card rather than a 404. */
  image: '/opengraph-image',
});

function spanLabel(years: number[]): string | undefined {
  if (years.length === 0) return undefined;
  const newest = years[0]!;
  const oldest = years[years.length - 1]!;
  return newest === oldest ? `${newest}` : `${oldest}–${newest}`;
}

export default function WritingIndexPage() {
  const posts = getPosts();
  const tags = getTags();
  const years = getWritingYears();
  const span = spanLabel(years);

  const featured = getFeaturedPosts(3);
  const lead = posts.length >= 2 ? featured[0] : undefined;
  const second = posts.length >= 8 ? featured[1] : undefined;
  const third = posts.length >= 8 ? featured[2] : undefined;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Writing', path: '/writing' },
          ]),
        )}
      />

      <PageHeader
        eyebrow="The archive"
        title="Writing"
        meta={
          <MetaLine
            items={[
              posts.length > 0 && pluralize(posts.length, 'entry', 'entries'),
              span,
              tags.length > 0 && pluralize(tags.length, 'subject'),
            ]}
          />
        }
      />

      {posts.length === 0 ? (
        <div className="u-page pb-(--spacing-section)">
          <EmptyState title="Nothing published yet">
            The first entries are still being written. Everything that lands here stays
            here.
          </EmptyState>
        </div>
      ) : (
        <>
          {/* --- the opener ---------------------------------------------- */}
          {lead ? (
            <section className="u-page pb-(--spacing-section)">
              <ArticlePreview
                post={lead}
                variant="lead"
                eyebrow={lead.featured ? 'Featured' : 'Latest'}
                headingLevel={2}
                priority
              />
            </section>
          ) : null}

          {/* --- two more, deliberately off the grid ---------------------- */}
          {second && third ? (
            <section className="u-page pb-(--spacing-section)">
              <hr className="u-rule mb-(--spacing-section-sm)" />
              <Label as="h2" className="mb-12 block">
                Also in the archive
              </Label>
              <div className="u-grid">
                <div className="col-span-2 md:col-span-3 lg:col-span-4">
                  <ArticlePreview post={second} variant="portrait" eyebrow="Selected" />
                </div>
                <div className="col-span-2 md:col-span-3 lg:col-span-5 lg:col-start-7 lg:mt-36">
                  <ArticlePreview post={third} variant="text" index={1} numbered />
                </div>
              </div>
            </section>
          ) : null}

          {/* --- the index ------------------------------------------------ */}
          <section id="index" className="u-page pb-(--spacing-section)">
            <SectionHeader
              eyebrow="Index"
              title="Everything, by year"
              description="Newest first. Filter by year or subject, or search the titles."
            />
            <WritingArchive className="mt-14" posts={posts} tags={tags} />
          </section>

          {/* --- subjects ------------------------------------------------- */}
          {tags.length > 0 ? (
            <section className="u-page pb-(--spacing-section)">
              <hr className="u-rule mb-8" />
              <Label as="h2" className="mb-8 block">
                Subjects
              </Label>
              <ul className="m-0 flex list-none flex-wrap gap-x-8 gap-y-4 p-0">
                {tags.map((tag) => (
                  <li key={tag.slug}>
                    <Link
                      href={`/writing/tag/${tag.slug}`}
                      className="u-label text-muted hover:text-ivory transition-colors duration-300"
                    >
                      {tag.tag}
                      <span className="u-nums ml-2 opacity-70">{tag.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
