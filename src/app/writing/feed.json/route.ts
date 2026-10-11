import { jsonFeedResponse } from '@/lib/feeds/build';
import { WRITING_FEED, writingEntries } from '@/lib/feeds/entries';

/**
 * JSON Feed 1.1 — the same writing as /writing/rss.xml, for readers that
 * would rather parse JSON than XML. Whole pieces in `content_html`, a short
 * `summary` beside them. https://jsonfeed.org/version/1.1
 */

export const dynamic = 'force-static';

export function GET(): Response {
  return jsonFeedResponse(WRITING_FEED, writingEntries());
}
