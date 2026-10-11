import { rssResponse } from '@/lib/feeds/build';
import { WRITING_FEED, writingEntries } from '@/lib/feeds/entries';

/**
 * RSS 2.0 for the writing.
 *
 * A feed is the one piece of a personal site that is still genuinely portable:
 * it outlives platforms, algorithms and this codebase. So it is written by
 * hand, with no feed library. Each item carries a short summary in
 * <description> and the whole piece in <content:encoded> — the MDX components
 * translated to plain HTML by src/lib/feeds/html.ts.
 */

export const dynamic = 'force-static';

export function GET(): Response {
  return rssResponse(WRITING_FEED, writingEntries());
}
