import type { Metadata } from 'next';
import { ArchivePreview } from '@/components/home/ArchivePreview';
import { FromTheArchive } from '@/components/home/FromTheArchive';
import { Hero } from '@/components/home/Hero';
import { LatestWriting } from '@/components/home/LatestWriting';
import { NowPreview } from '@/components/home/NowPreview';
import { SelectedProjects } from '@/components/home/SelectedProjects';
import { TimelineStrip } from '@/components/home/TimelineStrip';
import {
  buildSeed,
  getArchiveSpan,
  getCurrentNow,
  getFeaturedMedia,
  getFeaturedProjects,
  getRecentPosts,
  getTimeline,
  getYearSummaries,
  pickArchiveEntry,
} from '@/lib/content';
import { pageMetadata } from '@/lib/metadata';
import { site } from '@/lib/site';

/**
 * The homepage.
 *
 * Seven sections, each composed differently on purpose: a full-bleed hero, a
 * mixed run of writing, three project features that swap sides, the photo
 * archive at colossal scale, a deliberately quiet Now, one found object from
 * the archive, and the timeline that ties the whole thing to years.
 *
 * Every section is fed from here so the data layer is touched in exactly one
 * place, and every section renders something designed when its source is
 * empty — which is the state the site launches in.
 */

export const metadata: Metadata = {
  ...pageMetadata({
    title: site.name,
    description: site.description,
    path: '/',
    image: '/opengraph-image',
    type: 'website',
  }),
  // The layout appends "— Dali Basor" to every child title. The homepage is
  // the one page that should carry the whole thing itself.
  title: { absolute: `${site.name} — ${site.descriptor}` },
};

export default function HomePage() {
  const span = getArchiveSpan();
  const heroItem = getFeaturedMedia(1)[0];
  const posts = getRecentPosts(4);
  const projects = getFeaturedProjects(3);
  const years = getYearSummaries();
  const now = getCurrentNow();
  const found = pickArchiveEntry(buildSeed());
  const timeline = getTimeline();

  return (
    <>
      <Hero item={heroItem} span={span} />
      <LatestWriting posts={posts} />
      <SelectedProjects projects={projects} />
      <ArchivePreview years={years} />
      <NowPreview entry={now} />
      <FromTheArchive entry={found} />
      <TimelineStrip years={timeline} />
    </>
  );
}
