import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/metadata';
import { AI_TRAINING_CRAWLERS, ALLOW_INDEXING } from '@/lib/site';

/**
 * Indexing is opt-in.
 *
 * The site ships with placeholder prose in every entry, and a search engine
 * that caches "[DALI: WRITE THIS IN YOUR OWN WORDS]" under your own name is
 * slow and annoying to undo. So crawlers are turned away until you say
 * otherwise, by setting this in the deployment's environment:
 *
 *   NEXT_PUBLIC_ALLOW_INDEXING=true
 *
 * Do that once the writing is yours. Nothing else needs changing, and the
 * sitemap is still served either way so the switch takes effect on the next
 * crawl rather than needing a resubmission.
 */

export default function robots(): MetadataRoute.Robots {
  if (!ALLOW_INDEXING) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      sitemap: absoluteUrl('/sitemap.xml'),
    };
  }

  // Search engines in; crawlers that train AI models out. See
  // AI_TRAINING_CRAWLERS in lib/site.ts for where the line is drawn and why.
  return {
    rules: [
      ...(AI_TRAINING_CRAWLERS.length > 0
        ? [{ userAgent: [...AI_TRAINING_CRAWLERS], disallow: '/' }]
        : []),
      { userAgent: '*', allow: '/' },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
