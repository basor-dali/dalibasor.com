import { jsonFeedResponse } from '@/lib/feeds/build';
import { NOTES_FEED, notesEntries } from '@/lib/feeds/entries';

/** JSON Feed 1.1 — the same notes as /notes/rss.xml. */

export const dynamic = 'force-static';

export function GET(): Response {
  return jsonFeedResponse(NOTES_FEED, notesEntries());
}
