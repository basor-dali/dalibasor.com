import { rssResponse } from '@/lib/feeds/build';
import { NOTES_FEED, notesEntries } from '@/lib/feeds/entries';

/** RSS 2.0 for the notes: each one whole, as with the writing. */

export const dynamic = 'force-static';

export function GET(): Response {
  return rssResponse(NOTES_FEED, notesEntries());
}
