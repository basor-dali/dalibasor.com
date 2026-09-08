import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Post } from '@/types/content';
import { getPost, getPostNeighbours, getPostSlugs, getRelatedPosts } from '@/lib/content';
import { articleJsonLd, breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/metadata';
import { MdxContent } from '@/components/mdx/MdxContent';
import { ArticleFooter } from '@/components/writing/ArticleFooter';
import { ArticleHeader } from '@/components/writing/ArticleHeader';
import { mediaProvider } from '@/lib/media';
import { isoDateTime, truncate } from '@/lib/utils';

/**
 * /writing/[slug] — one article.
 *
 * The reading experience is the point: a masthead, a photograph if there is
 * one, then the body at the reading measure and nothing else in the way. Raw
 * writing with no headings and three-line paragraphs has to look as good here
 * as a structured essay does, which is why the page adds no chrome of its own.
 */

type RouteParams = { slug: string };

export function generateStaticParams(): RouteParams[] {
  return getPostSlugs().map((slug) => ({ slug }));
}

function coverUrl(publicId: string | undefined): string | undefined {
  if (!publicId) return undefined;
  return mediaProvider().imageUrl(publicId, { width: 1200, fit: 'fill' });
}

function descriptionFor(post: Post): string | undefined {
  const raw = (post.excerpt ?? post.subtitle ?? post.plain).trim();
  return raw ? truncate(raw, 180) : undefined;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) {
    return pageMetadata({ title: 'Not found', path: `/writing/${slug}`, noIndex: true });
  }

  return pageMetadata({
    title: post.title,
    description: descriptionFor(post),
    path: post.href,
    /* The per-article card at ./opengraph-image is the better share image;
       pageMetadata points at it by default, so nothing to override here. */
    type: 'article',
    publishedTime: isoDateTime(post.date),
    tags: post.tags,
    noIndex: post.draft,
  });
}

/** Loud on purpose: unfinished writing should be embarrassing to leave up. */
function PlaceholderNotice() {
  return (
    <aside className="mb-14 border border-dashed border-ember-deep/70 bg-ember-deep/[0.06] p-6 sm:p-8">
      <p className="u-label mb-3 text-ember">Unfinished</p>
      <p className="text-sm text-soft">
        This entry is scaffolding. The structure is in place; the writing has not been done yet.
      </p>
    </aside>
  );
}

export default async function ArticlePage({ params }: { params: Promise<RouteParams> }) {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) notFound();

  const { previous, next } = getPostNeighbours(slug);
  const related = getRelatedPosts(slug, 3);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          articleJsonLd({
            title: post.title,
            description: descriptionFor(post),
            path: post.href,
            datePublished: isoDateTime(post.date),
            image: coverUrl(post.coverImage),
            tags: post.tags,
          }),
        )}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Writing', path: '/writing' },
            { name: post.title, path: post.href },
          ]),
        )}
      />

      <article>
        <ArticleHeader post={post} />

        <div className="u-page pt-(--spacing-section-sm) pb-(--spacing-section)">
          <div className="u-measure">
            {post.placeholder ? <PlaceholderNotice /> : null}
            {post.body.trim() ? (
              <div className="prose">
                <MdxContent source={post.body} />
              </div>
            ) : post.placeholder ? null : (
              <p className="u-label text-muted">This entry has no body yet.</p>
            )}
          </div>
        </div>
      </article>

      <ArticleFooter post={post} previous={previous} next={next} related={related} />
    </>
  );
}
