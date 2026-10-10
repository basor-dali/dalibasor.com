import { parseDate } from '@/lib/utils';

/**
 * The XML that RSS needs, written by hand with no dependency.
 *
 * Moved here from the writing feed when a second feed (Now) arrived, so both
 * escape, date and wrap content by the same rules.
 */

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
export function stripIllegalXml(value: string): string {
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

export function escapeXml(value: string): string {
  return stripIllegalXml(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Markup inside a CDATA section, for <content:encoded>.
 *
 * The one sequence CDATA cannot contain is its own terminator, so a literal
 * "]]>" in the HTML is split across two sections rather than ending the first.
 */
export function cdata(value: string): string {
  return `<![CDATA[${stripIllegalXml(value).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
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
export function rfc822(value: string | Date): string {
  const d = typeof value === 'string' ? parseDate(value) : value;
  return (
    `${RFC822_DAYS[d.getUTCDay()]!}, ${pad(d.getUTCDate())} ` +
    `${RFC822_MONTHS[d.getUTCMonth()]!} ${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT`
  );
}

export function tag(name: string, value: string): string {
  return `<${name}>${escapeXml(value)}</${name}>`;
}
