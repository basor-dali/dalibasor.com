import 'server-only';

import { getAllNowWithBodies, getFeedPosts } from '@/lib/content';
import { absoluteUrl } from '@/lib/metadata';
import { site } from '@/lib/site';
import { truncate } from '@/lib/utils';
import { FEED_LIMIT, type FeedChannel, type FeedEntry } from './build';
import { feedHtml } from './html';

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
  description: 'What I am doing, one month at a time. Every entry is kept at its own address.',
  home: '/now',
  rss: '/now/rss.xml',
  json: '/now/feed.json',
};

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
