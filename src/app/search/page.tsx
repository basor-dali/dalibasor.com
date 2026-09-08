import type { Metadata } from 'next';
import { PageHeader } from '@/components/primitives';
import { SearchClient, type SearchCount } from '@/components/search/SearchClient';
import { getArchiveTotals, getNowEntries, getPosts, getProjects } from '@/lib/content';
import { pageMetadata } from '@/lib/metadata';

/**
 * The index of everything.
 *
 * A server component that renders the opener and the counts, and one client
 * island that does the searching. The page itself is static; nothing here
 * needs a server at runtime.
 */

export const metadata: Metadata = pageMetadata({
  title: 'Search',
  description:
    'Search everything on the site — writing, projects, photographs, Now entries and pages.',
  path: '/search',
  // This page has no card of its own; the site card is the right one.
  image: '/opengraph-image',
});

export default function SearchPage() {
  const totals = getArchiveTotals();

  const counts: SearchCount[] = [
    { label: 'Writing', value: getPosts().length },
    { label: 'Projects', value: getProjects().length },
    { label: 'Photographs', value: totals.photos + totals.videos },
    { label: 'Now entries', value: getNowEntries().length },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Index"
        title="Search the archive"
        lede="Writing, projects, photographs, Now entries and pages — all of it in one index."
      />
      <SearchClient counts={counts} />
    </>
  );
}
