import 'server-only';

import { normalizePath, outboundLinks } from '@/lib/links';
import { site } from '@/lib/site';
import { once } from './fs';
import { findMediaByRef } from './media';
import { getAllNotesWithBodies } from './notes';
import { getAllNowWithBodies } from './now';
import { getAllProjectsWithBodies } from './projects';
import { getAllPostsWithBodies } from './writing';

/**
 * Who mentions what.
 *
 * Time and place already connect the archive: everything has a year, and
 * much of it a place. What they cannot show is that one piece of writing is
 * about another — that a note from 2031 answers an essay from 2026. A link
 * written in either is that connection, so every page that is linked to says
 * where from: an essay, a project, a note, a month, an album or a photograph.
 *
 * Read from what was written, nothing declared: a markdown link, an href, a
 * link to this site written out in full, or a photograph placed with
 * <Figure> or <Video>. Placeholders and drafts mention nothing.
 */

export type Mention = {
  href: string;
  title: string;
  kind: 'essay' | 'project' | 'note' | 'now';
  date: string;
};

type Source = Mention & { body: string };

const mentions = once((): Map<string, Mention[]> => {
  const sources: Source[] = [
    ...getAllPostsWithBodies()
      .filter((post) => !post.placeholder)
      .map((post) => ({
        href: post.href,
        title: post.title,
        kind: 'essay' as const,
        date: post.date,
        body: post.body,
      })),
    ...getAllProjectsWithBodies()
      .filter((project) => !project.placeholder)
      .map((project) => ({
        href: project.href,
        title: project.title,
        kind: 'project' as const,
        date: project.endDate ?? project.startDate,
        body: project.body,
      })),
    ...getAllNotesWithBodies().map((note) => ({
      href: note.href,
      title: note.label,
      kind: 'note' as const,
      date: note.date,
      body: note.body,
    })),
    ...getAllNowWithBodies()
      .filter((entry) => !entry.placeholder)
      .map((entry) => ({
        href: entry.href,
        title: `Now, ${entry.title}`,
        kind: 'now' as const,
        date: entry.date,
        body: entry.body,
      })),
  ];

  const map = new Map<string, Mention[]>();
  for (const { body, ...source } of sources) {
    const { paths, media } = outboundLinks(body, site.url);
    const targets = new Set(paths);
    for (const ref of media) {
      const item = findMediaByRef(ref);
      if (item) targets.add(`/photo/${item.id}`);
    }
    targets.delete(source.href);
    for (const target of targets) {
      const list = map.get(target);
      if (list) list.push(source);
      else map.set(target, [source]);
    }
  }

  for (const list of map.values()) {
    list.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  }
  return map;
});

/** Everything that links to this page, newest first. */
export function getMentions(href: string): Mention[] {
  const path = normalizePath(href);
  return path ? (mentions().get(path) ?? []) : [];
}
