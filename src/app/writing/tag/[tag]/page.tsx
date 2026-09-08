import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPostsByTag, getTagLabel, getTags } from '@/lib/content';
import { breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/metadata';
import { ArrowLink, Label, MetaLine, PageHeader } from '@/components/primitives';
import { WritingArchive } from '@/components/writing/WritingArchive';
import { pluralize } from '@/lib/utils';

/**
 * /writing/tag/[tag] — the archive, scoped to one subject.
 *
 * Same index, same rules, fewer entries. The tag filter is dropped here
 * because the page itself is the filter; year and search remain.
 */

type RouteParams = { tag: string };

export function generateStaticParams(): RouteParams[] {
  return getTags().map((entry) => ({ tag: entry.slug }));
}

function spanLabel(years: number[]): string | undefined {
  if (years.length === 0) return undefined;
  const newest = years[0]!;
  const oldest = years[years.length - 1]!;
  return newest === oldest ? `${newest}` : `${oldest}–${newest}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { tag } = await params;
  const label = getTagLabel(tag);

  if (!label) {
    return pageMetadata({
      title: 'Not found',
      path: `/writing/tag/${tag}`,
      noIndex: true,
    });
  }

  const count = getPostsByTag(tag).length;

  return pageMetadata({
    title: `${label} — Writing`,
    description: `${pluralize(count, 'entry', 'entries')} filed under ${label}.`,
    path: `/writing/tag/${tag}`,
    image: '/opengraph-image',
  });
}

export default async function WritingTagPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { tag } = await params;
  const label = getTagLabel(tag);

  if (!label) notFound();

  const posts = getPostsByTag(tag);
  const years = [...new Set(posts.map((post) => post.year))].sort((a, b) => b - a);
  const otherTags = getTags().filter((entry) => entry.slug !== tag);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Writing', path: '/writing' },
            { name: label, path: `/writing/tag/${tag}` },
          ]),
        )}
      />

      <PageHeader
        eyebrow="Subject"
        title={label}
        meta={
          <MetaLine
            items={[pluralize(posts.length, 'entry', 'entries'), spanLabel(years)]}
          />
        }
      >
        <div className="mt-10">
          <ArrowLink href="/writing">Back to the full archive</ArrowLink>
        </div>
      </PageHeader>

      <section className="u-page pb-(--spacing-section)">
        {/* The archive renders year headings at h3; without this the outline

            jumps straight from the page h1. */}

        <h2 className="sr-only">Entries by year</h2>

        <WritingArchive
          posts={posts}
          emptyTitle="Nothing filed here yet"
          emptyBody={`No entries carry the subject ${label}.`}
        />
      </section>

      {otherTags.length > 0 ? (
        <section className="u-page pb-(--spacing-section)">
          <hr className="u-rule mb-8" />
          <Label as="h2" className="mb-8 block">
            Other subjects
          </Label>
          <ul className="m-0 flex list-none flex-wrap gap-x-8 gap-y-4 p-0">
            {otherTags.map((entry) => (
              <li key={entry.slug}>
                <Link
                  href={`/writing/tag/${entry.slug}`}
                  className="u-label text-muted hover:text-ivory transition-colors duration-300"
                >
                  {entry.tag}
                  <span className="u-nums ml-2 opacity-70">{entry.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
