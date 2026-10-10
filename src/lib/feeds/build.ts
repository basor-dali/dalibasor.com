import 'server-only';

import { absoluteUrl } from '@/lib/metadata';
import { site } from '@/lib/site';
import { isoDateTime } from '@/lib/utils';
import { cdata, escapeXml, rfc822, tag } from './xml';

/**
 * One feed, written two ways — RSS 2.0 and JSON Feed 1.1 — from the same
 * entries, so the two can never disagree about what is in them.
 */

/**
 * How many entries a feed carries. Readers only need the recent ones — the
 * archive is on the site — and with whole bodies in the feed, every entry
 * since 2026 would make a file that only grows. JSON Feed's own guidance is
 * to stay well under a few hundred kilobytes.
 */
export const FEED_LIMIT = 40;

export type FeedEntry = {
  /** Absolute URL, which is also the guid. */
  url: string;
  title: string;
  /** When it was published. */
  date: string;
  /** When it was last meaningfully changed, if ever. */
  updated?: string;
  /** A short plain-text summary. */
  summary?: string;
  /** The whole body as HTML. */
  html: string;
  tags?: string[];
};

export type FeedChannel = {
  title: string;
  description: string;
  /** Root-relative page this feed belongs to, e.g. `/writing`. */
  home: string;
  /** Root-relative addresses of the two formats. */
  rss: string;
  json: string;
};

export function rssResponse(channel: FeedChannel, entries: FeedEntry[]): Response {
  const newest = entries[0];
  const lastBuildDate = newest
    ? rfc822(newest.updated ?? newest.date)
    : rfc822(new Date());

  const items = entries.map((entry) =>
    [
      '    <item>',
      `      ${tag('title', entry.title)}`,
      `      ${tag('link', entry.url)}`,
      `      <guid isPermaLink="true">${escapeXml(entry.url)}</guid>`,
      `      ${tag('pubDate', rfc822(entry.date))}`,
      entry.summary ? `      ${tag('description', entry.summary)}` : '',
      // A post can be a title and nothing else. An empty content:encoded is
      // worse than none — some readers show it as a blank item body.
      entry.html.trim()
        ? `      <content:encoded>${cdata(entry.html)}</content:encoded>`
        : '',
      ...(entry.tags ?? []).map((value) => `      ${tag('category', value)}`),
      '    </item>',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    '  <channel>',
    `    ${tag('title', channel.title)}`,
    `    ${tag('link', absoluteUrl(channel.home))}`,
    `    ${tag('description', channel.description)}`,
    `    ${tag('language', site.language)}`,
    `    ${tag('copyright', `© ${new Date().getUTCFullYear()} ${site.author.name}`)}`,
    `    ${tag('managingEditor', `${site.author.email} (${site.author.name})`)}`,
    `    ${tag('webMaster', `${site.author.email} (${site.author.name})`)}`,
    `    ${tag('lastBuildDate', lastBuildDate)}`,
    `    ${tag('generator', site.domain)}`,
    `    ${tag('docs', 'https://www.rssboard.org/rss-specification')}`,
    `    <atom:link href="${escapeXml(absoluteUrl(channel.rss))}" rel="self" type="application/rss+xml" />`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control':
        'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}

export function jsonFeedResponse(channel: FeedChannel, entries: FeedEntry[]): Response {
  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: channel.title,
    home_page_url: absoluteUrl(channel.home),
    feed_url: absoluteUrl(channel.json),
    description: channel.description,
    language: site.language,
    authors: [{ name: site.author.name, url: absoluteUrl('/about') }],
    items: entries.map((entry) => ({
      id: entry.url,
      url: entry.url,
      title: entry.title,
      // JSON Feed requires one of content_html or content_text on every item,
      // and a post with no body still needs something there.
      ...(entry.html.trim()
        ? { content_html: entry.html }
        : { content_text: entry.summary ?? entry.title }),
      ...(entry.summary ? { summary: entry.summary } : {}),
      date_published: isoDateTime(entry.date),
      ...(entry.updated ? { date_modified: isoDateTime(entry.updated) } : {}),
      ...(entry.tags && entry.tags.length > 0 ? { tags: entry.tags } : {}),
    })),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control':
        'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
