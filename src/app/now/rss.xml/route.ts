import { rssResponse } from '@/lib/feeds/build';
import { NOW_FEED, nowEntries } from '@/lib/feeds/entries';

/**
 * RSS 2.0 for the Now entries.
 *
 * /now changes once a month and keeps every month at its own address, which
 * makes it the one page on the site worth being told about — and until this
 * existed there was no way to be. Each item is a month, at its permanent
 * address, in full.
 */

export const dynamic = 'force-static';

export function GET(): Response {
  return rssResponse(NOW_FEED, nowEntries());
}
