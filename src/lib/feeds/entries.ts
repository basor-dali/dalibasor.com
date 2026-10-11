import 'server-only';

import { getAllNowWithBodies, getFeedNotes, getFeedPosts } from '@/lib/content';
import { mediaAlt, mediaProvider } from '@/lib/media';
import { absoluteUrl } from '@/lib/metadata';
import { site } from '@/lib/site';
import { truncate } from '@/lib/utils';
import { FEED_LIMIT, type FeedChannel, type FeedEntry } from './build';
import { feedHtml } from './html';
import { escapeXml } from './xml';

/**
 * What goes in each feed.
 *
 * Scaffolding never does. A feed item is a notification and its guid is the
 * entry's permanent URL, so a placeholder delivered now would be the version
 * every reader keeps — and the finished piece, arriving later at the same
 * guid, would be marked read and never shown. See getFeedPosts.
 */

export const WRITING_FEED: FeedChannel = {
  title: `${site.name} — Writing`,
  description: site.descriptor,
  home: '/writing',
  rss: '/writing/rss.xml',
  json: '/writing/feed.json',
};

export const NOW_FEED: FeedChannel = {
  title: `${site.name} — Now`,
  description:
    'What I am doing, one month at a time. Every entry is kept at its own address.',
  home: '/now',
  rss: '/now/rss.xml',
  json: '/now/feed.json',
};

export const NOTES_FEED: FeedChannel = {
  title: `${site.name} — Notes`,
  description: 'Short entries: a sentence, a photograph, a link.',
  home: '/notes',
  rss: '/notes/rss.xml',
  json: '/notes/feed.json',
};

export function notesEntries(): FeedEntry[] {
  return getFeedNotes()
    .slice(0, FEED_LIMIT)
    .map((note) => {
      const url = absoluteUrl(note.href);
      const item = note.photoItem;
      // The photograph and the link are frontmatter, not body, so a reader
      // would never see them unless they are written into the entry here.
      const photo =
        item && item.type === 'image'
          ? `<p><img src="${escapeXml(
              mediaProvider().imageUrl(item.publicId, {
                width: 1200,
                fit: 'fit',
                availableWidths: item.variants,
              }),
            )}" alt="${escapeXml(note.photoAlt ?? mediaAlt(item))}"></p>`
          : '';
      const link = note.link
        ? `<p><a href="${escapeXml(note.link)}">${escapeXml(note.link)}</a></p>`
        : '';
      return {
        url,
        title: note.label,
        date: note.time ? `${note.date}T${note.time}` : note.date,
        summary: truncate(note.plain, 320) || undefined,
        html: [feedHtml(note.body, url), photo, link].filter(Boolean).join('\n'),
        tags: note.tags,
      };
    });
}

export function writingEntries(): FeedEntry[] {
  return getFeedPosts()
    .slice(0, FEED_LIMIT)
    .map((post) => {
      const url = absoluteUrl(post.href);
      return {
        url,
        title: post.title,
        date: post.date,
        updated: post.updated,
        summary: post.excerpt?.trim() || truncate(post.plain, 320) || undefined,
        html: feedHtml(post.body, url),
        tags: post.tags,
      };
    });
}

export function nowEntries(): FeedEntry[] {
  return getAllNowWithBodies()
    .filter((entry) => !entry.placeholder && entry.body.trim())
    .slice(0, FEED_LIMIT)
    .map((entry) => {
      // The permanent address, never /now: that one moves on next month.
      const url = absoluteUrl(entry.href);
      return {
        url,
        title: `Now — ${entry.title}`,
        date: entry.date,
        summary: truncate(entry.plain, 320) || undefined,
        html: feedHtml(entry.body, url),
      };
    });
}
