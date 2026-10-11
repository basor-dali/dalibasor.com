import 'server-only';

import {
  getAllMediaItems,
  getAllNowWithBodies,
  getAllPostsWithBodies,
  getAllProjectsWithBodies,
  getArchiveYears,
  getFeaturedMedia,
  getPage,
  getYear,
} from '@/lib/content';
import { providerCanResize } from '@/lib/media';
import { ALLOW_INDEXING } from '@/lib/site';
import { pluralize } from '@/lib/utils';

/**
 * What is left before the site is finished.
 *
 * The site is built; what it lacks is writing, and the biggest risk to a
 * personal site is that it never stops being scaffolding. Nothing showed what
 * was still unwritten except a search for "[DALI:" across the repository.
 * This gathers it in one list on the local /admin page — never deployed —
 * worst gaps first, each with the file to open.
 */

export type ChecklistItem = {
  /** What is missing, in a phrase. */
  label: string;
  /** The files, or the one place to fix it. */
  where: string[];
  /** Anything worth knowing that is not a place. */
  note?: string;
  /** Done items stay listed, struck through, so progress is visible. */
  done: boolean;
};

export type ChecklistGroup = { title: string; items: ChecklistItem[] };

export function launchChecklist(): ChecklistGroup[] {
  const posts = getAllPostsWithBodies();
  const projects = getAllProjectsWithBodies();
  const now = getAllNowWithBodies();
  const about = getPage('about');
  const media = getAllMediaItems();

  const unwrittenPosts = posts.filter((post) => post.placeholder);
  const unwrittenProjects = projects.filter((project) => project.placeholder);
  const unwrittenNow = now.filter((entry) => entry.placeholder);
  const writtenPosts = posts.filter((post) => !post.placeholder && !post.draft);

  const timelinePlaceholders = (() => {
    const raw = about?.data.timeline;
    if (!Array.isArray(raw)) return 0;
    return raw.filter((entry) => JSON.stringify(entry).includes('[')).length;
  })();

  const withoutAlt = media.filter((item) => !item.alt?.trim());
  const emptyYears = getArchiveYears().filter(
    (year) => (getYear(year)?.totalCount ?? 0) === 0,
  );
  // A placeholder project is already listed whole; this catches the one line
  // left behind after the rest of it has been written.
  const projectsWithoutWords = projects.filter(
    (project) =>
      !project.placeholder &&
      (!project.description || project.description.includes('[DALI')),
  );

  return [
    {
      title: 'Writing that is still scaffolding',
      items: [
        {
          label: `About page${timelinePlaceholders ? ` — ${pluralize(timelinePlaceholders, 'timeline row')} still in brackets` : ''}`,
          where: ['content/pages/about.mdx'],
          done: Boolean(about && !about.placeholder && timelinePlaceholders === 0),
        },
        ...unwrittenPosts.map((post) => ({
          label: `Essay: ${post.title}`,
          where: [post.sourcePath],
          done: false,
        })),
        ...unwrittenProjects.map((project) => ({
          label: `Project: ${project.title}`,
          where: [project.sourcePath],
          done: false,
        })),
        ...unwrittenNow.map((entry) => ({
          label: `Now: ${entry.title}`,
          where: [entry.sourcePath],
          done: false,
        })),
        {
          label: 'At least one essay written and published',
          where: ['npm run new:post -- "Title"'],
          done: writtenPosts.length > 0,
        },
      ],
    },
    {
      title: 'Projects',
      items: projectsWithoutWords.map((project) => ({
        label: `${project.title} has no description yet`,
        where: [project.sourcePath],
        done: false,
      })),
    },
    {
      title: 'Photographs',
      items: [
        {
          label: 'Photographs served from a CDN, not from /public',
          where: ['.env.local — see docs/MEDIA.md'],
          done: providerCanResize(),
        },
        {
          label: 'A photograph marked featured, for the homepage opener',
          where: ['content/media/<year>.yml — featured: true'],
          done: getFeaturedMedia(1).length > 0,
        },
        {
          label: 'A portrait on the About page',
          where: ['content/pages/about.mdx — coverImage'],
          done: Boolean(about?.coverImage),
        },
        {
          label:
            withoutAlt.length === 0
              ? 'Every photograph has alt text'
              : `${withoutAlt.length} ${withoutAlt.length === 1 ? 'photograph has' : 'photographs have'} no alt text`,
          where: [...new Set(withoutAlt.map((item) => `content/media/${item.year}.yml`))],
          done: withoutAlt.length === 0,
        },
        ...emptyYears.map((year) => ({
          label: `${year} is declared but has nothing in it`,
          where: [`content/media/${year}.yml`],
          done: false,
        })),
      ],
    },
    {
      title: 'Going public',
      items: [
        {
          label: 'Search engines allowed — NEXT_PUBLIC_ALLOW_INDEXING=true',
          where: ['docs/DEPLOY.md — step 4'],
          note: 'Set on the host. This page reads this machine’s settings, so it cannot see whether the live site has it.',
          done: ALLOW_INDEXING,
        },
      ],
    },
  ].filter((group) => group.items.length > 0);
}
