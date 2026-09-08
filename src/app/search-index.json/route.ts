import { buildSearchIndex } from '@/lib/search/build-index';

/**
 * The search index, served as a static file.
 *
 * Written once at build time and never computed again. The search page pulls
 * it on first interaction, so a visitor who never searches never pays for it.
 */

export const dynamic = 'force-static';

export function GET(): Response {
  const docs = buildSearchIndex();

  const payload = {
    /** Bumped only if the document shape changes in a way clients must notice. */
    version: 1,
    generatedAt: new Date().toISOString(),
    count: docs.length,
    docs,
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      /* The path is stable across deploys, so `immutable` would strand a
         visitor on a year-old index. The CDN copy is long-lived and purged on
         deploy; the browser revalidates every hour, which costs a 304. */
      'Cache-Control':
        'public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400',
    },
  });
}
