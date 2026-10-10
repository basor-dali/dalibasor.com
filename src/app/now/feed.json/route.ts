import { jsonFeedResponse } from '@/lib/feeds/build';
import { NOW_FEED, nowEntries } from '@/lib/feeds/entries';

/** JSON Feed 1.1 for the Now entries — the same months as /now/rss.xml. */

export const dynamic = 'force-static';

export function GET(): Response {
  return jsonFeedResponse(NOW_FEED, nowEntries());
}
