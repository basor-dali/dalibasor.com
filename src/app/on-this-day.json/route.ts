import { getOnThisDayEntries } from '@/lib/content';

/**
 * Everything with a real day attached, for "on this day" on the homepage.
 *
 * Written once at build time. The homepage fetches it after it has loaded and
 * picks out today in the reader's own timezone — the build cannot know which
 * day that is.
 */

export const dynamic = 'force-static';

export function GET(): Response {
  const entries = getOnThisDayEntries();

  return new Response(JSON.stringify({ version: 1, count: entries.length, entries }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Same as the search index: long-lived at the CDN and purged on deploy,
      // revalidated by the browser every hour.
      'Cache-Control':
        'public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400',
    },
  });
}
