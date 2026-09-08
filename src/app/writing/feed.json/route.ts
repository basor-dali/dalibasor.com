import { getAllPostsWithBodies } from '@/lib/content';
import { absoluteUrl } from '@/lib/metadata';
import { site } from '@/lib/site';
import { isoDateTime, parseDate, truncate } from '@/lib/utils';

/**
 * JSON Feed 1.1 — the same writing as /writing/rss.xml, for readers that
 * would rather parse JSON than XML.
 *
 * Like the RSS feed this carries the excerpt, not the body: the body is MDX
 * with custom components in it and does not survive being flattened.
 * https://jsonfeed.org/version/1.1
 */

export const dynamic = 'force-static';

type FeedItem = {
  id: string;
  url: string;
  title: string;
  summary?: string;
  content_text?: string;
  date_published: string;
  tags?: string[];
  image?: string;
};

export function GET(): Response {
  /* Sorted on the parsed date, for the same reason as the RSS feed: an
     unquoted YAML date arrives as a Date, and its string form sorts by
     weekday name. */
  const posts = [...getAllPostsWithBodies()].sort(
    (a, b) =>
      parseDate(b.date).getTime() - parseDate(a.date).getTime() ||
      a.slug.localeCompare(b.slug),
  );

  const items: FeedItem[] = posts.map((post) => {
    const url = absoluteUrl(post.href);
    const summary = post.excerpt?.trim() || truncate(post.plain, 320);

    return {
      id: url,
      url,
      title: post.title,
      ...(summary ? { summary, content_text: summary } : {}),
      date_published: isoDateTime(post.date),
      ...(post.tags.length > 0 ? { tags: post.tags } : {}),
    };
  });

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${site.name} — Writing`,
    home_page_url: absoluteUrl('/writing'),
    feed_url: absoluteUrl('/writing/feed.json'),
    description: site.descriptor,
    language: site.language,
    authors: [{ name: site.author.name, url: site.url }],
    items,
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
      'Cache-Control':
        'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
