import { getFeedPosts } from '@/lib/content';
import { absoluteUrl } from '@/lib/metadata';
import { site } from '@/lib/site';
import { parseDate, truncate } from '@/lib/utils';

/**
 * RSS 2.0 for the writing.
 *
 * A feed is the one piece of a personal site that is still genuinely portable:
 * it outlives platforms, algorithms and this codebase. So it is written by
 * hand, with no dependency, and it ships the excerpt rather than the body —
 * the body is MDX with custom components in it and would not survive the trip.
 */

export const dynamic = 'force-static';

/* --- XML ------------------------------------------------------------------ */

/**
 * Keep only what XML 1.0 calls a Char.
 *
 * That is tab, newline and carriage return, then U+0020–U+D7FF,
 * U+E000–U+FFFD, and U+10000 upward. Anything else makes the feed unparseable
 * no matter how it is escaped, so it is dropped rather than encoded — and a
 * feed that will not parse fails in the reader, silently, weeks later.
 *
 * Iterating with `for...of` walks code points, so a properly paired emoji
 * arrives as one character above U+FFFF and is kept. An *unpaired* surrogate —
 * which is what a string truncated through the middle of one leaves behind —
 * arrives as a single code unit in U+D800–U+DFFF and is dropped, because that
 * is exactly the case the Char production excludes.
 */
function stripIllegalXml(value: string): string {
  let out = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || code === 13) {
      out += character;
    } else if (
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      code >= 0x10000
    ) {
      out += character;
    }
  }
  return out;
}

function escapeXml(value: string): string {
  return stripIllegalXml(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const RFC822_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const RFC822_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `Mon, 07 Sep 2026 00:00:00 GMT` — RFC 822, always UTC. */
function rfc822(value: string | Date): string {
  const d = typeof value === 'string' ? parseDate(value) : value;
  return (
    `${RFC822_DAYS[d.getUTCDay()]!}, ${pad(d.getUTCDate())} ` +
    `${RFC822_MONTHS[d.getUTCMonth()]!} ${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT`
  );
}

function tag(name: string, value: string): string {
  return `<${name}>${escapeXml(value)}</${name}>`;
}

/* --- feed ----------------------------------------------------------------- */

export function GET(): Response {
  /* getFeedPosts drops scaffolding and sorts on the parsed date rather than
     trusting the loader's order: an unquoted `date: 2024-03-02` in YAML arrives
     as a Date, whose string form starts with the weekday — and sorting *those*
     alphabetically files Friday before Monday. A feed in the wrong order is a
     feed nobody trusts. */
  const posts = getFeedPosts();

  const feedUrl = absoluteUrl('/writing/rss.xml');
  const channelUrl = absoluteUrl('/writing');

  const newest = posts[0];
  const lastBuildDate = newest ? rfc822(newest.date) : rfc822(new Date());

  const items = posts.map((post) => {
    const url = absoluteUrl(post.href);
    const description = post.excerpt?.trim() || truncate(post.plain, 320);

    return [
      '    <item>',
      `      ${tag('title', post.title)}`,
      `      ${tag('link', url)}`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `      ${tag('pubDate', rfc822(post.date))}`,
      description ? `      ${tag('description', description)}` : '',
      ...post.tags.map((t) => `      ${tag('category', t)}`),
      '    </item>',
    ]
      .filter(Boolean)
      .join('\n');
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    ${tag('title', `${site.name} — Writing`)}`,
    `    ${tag('link', channelUrl)}`,
    `    ${tag('description', site.descriptor)}`,
    `    ${tag('language', site.language)}`,
    `    ${tag('copyright', `© ${new Date().getUTCFullYear()} ${site.author.name}`)}`,
    `    ${tag('managingEditor', `${site.author.email} (${site.author.name})`)}`,
    `    ${tag('webMaster', `${site.author.email} (${site.author.name})`)}`,
    `    ${tag('lastBuildDate', lastBuildDate)}`,
    `    ${tag('generator', site.domain)}`,
    `    ${tag('docs', 'https://www.rssboard.org/rss-specification')}`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control':
        'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
