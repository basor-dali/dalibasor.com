/** Tiny class-name joiner. Not worth a dependency. */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/**
 * Letters that NFKD will not decompose into "base letter + combining mark".
 * Đ/đ matters here: `Đorđe` would otherwise slugify to `or-e`, which is how a
 * personal archive full of Balkan place and people names quietly breaks.
 */
const TRANSLITERATE: Record<string, string> = {
  đ: 'd',
  ð: 'd',
  ø: 'o',
  ł: 'l',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  þ: 'th',
  ħ: 'h',
  ı: 'i',
};

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    // Strip combining diacritics (U+0300–U+036F): č → c, š → s, ž → z, é → e.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[đðøłßæœþħı]/g, (char) => TRANSLITERATE[char] ?? char)
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/* ==========================================================================
   Dates
   ==========================================================================
   Everything is formatted in UTC. A date written as `2026-09-07` must render
   as September 7 in every timezone, forever — this archive outlives any
   particular machine's locale settings. */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** A wall-clock timestamp with no offset: `2026-06-14T19:31:02`, `2026-06-14 19:31`. */
const NAIVE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * Parses `2026`, `2026-09`, `2026-09-07` or a full ISO string, always as UTC.
 *
 * The naive-timestamp branch is the one that matters. EXIF records the wall
 * clock on the camera with no offset, and that is what the importer writes into
 * `capturedAt`. JavaScript reads such a string in the *host's* timezone, and
 * every formatter here then reads it back with getUTC* — so on a UTC-5 machine a
 * photograph taken at 19:31 on June 14 renders as June 15, and rebuilding the
 * same repo on a UTC runner silently changes the date with no content change.
 *
 * "7pm on the 14th" is the only fact EXIF gives us; it is not an instant, and
 * pinning it to UTC is what keeps it reading as the 14th everywhere, forever.
 * Strings that DO carry an offset denote a real instant and are left alone.
 */
export function parseDate(value: string): Date {
  const trimmed = value.trim();

  // Every branch funnels through one validity check at the end. The shapes
  // below are matched by pattern, and a pattern match is not proof of a real
  // date — `2026-13-45` looks exactly like `YYYY-MM-DD` and is not a day. Left
  // unchecked it produced an Invalid Date that walked straight past the
  // fallback and rendered as "NaN" in a caption.
  const candidate =
    /^\d{4}$/.test(trimmed)
      ? `${trimmed}-01-01T00:00:00Z`
      : /^\d{4}-\d{2}$/.test(trimmed)
        ? `${trimmed}-01T00:00:00Z`
        : /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
          ? `${trimmed}T00:00:00Z`
          : NAIVE_TIMESTAMP.test(trimmed)
            ? `${trimmed.replace(' ', 'T')}Z`
            : trimmed;

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? new Date('1970-01-01T00:00:00Z') : parsed;
}

export function yearOf(value: string): number {
  return parseDate(value).getUTCFullYear();
}

/** `September 7, 2026` */
export function formatDate(value: string): string {
  const d = parseDate(value);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** `September 7` — the year is usually already on screen in an archive. */
export function formatDayMonth(value: string): string {
  const d = parseDate(value);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** `September 2026` */
export function formatMonthYear(value: string): string {
  const d = parseDate(value);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** `SEP 2026` — for mono labels. */
export function formatShortMonthYear(value: string): string {
  const d = parseDate(value);
  return `${MONTHS[d.getUTCMonth()]!.slice(0, 3).toUpperCase()} ${d.getUTCFullYear()}`;
}

/** `2026-09-07` — the machine-readable form for <time datetime>. */
export function isoDate(value: string): string {
  return parseDate(value).toISOString().slice(0, 10);
}

/** Full ISO — used in feeds and structured data. */
export function isoDateTime(value: string): string {
  return parseDate(value).toISOString();
}

/**
 * A period key like `2026-09` rendered as `September 2026`, tolerating the
 * shorter `2026` form for very old entries.
 */
export function formatPeriod(period: string): string {
  if (/^\d{4}$/.test(period)) return period;
  return formatMonthYear(period);
}

/* ==========================================================================
   Text
   ========================================================================== */

/** Strips MDX/markdown syntax down to something searchable and countable. */
export function toPlainText(mdx: string): string {
  return mdx
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/^\s*[-+*]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 220 wpm — a little faster than the usual 200, personal writing reads quick. */
export function readingMinutes(plain: string): number {
  const words = plain ? plain.split(/\s+/).length : 0;
  return Math.max(1, Math.round(words / 220));
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
}

/* ==========================================================================
   Numbers
   ========================================================================== */

/** `007` — the editorial numbering used on projects and essays. */
export function ordinalLabel(index: number, pad = 3): string {
  return String(index + 1).padStart(pad, '0');
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/* ==========================================================================
   Deterministic pseudo-randomness
   ==========================================================================
   "From the archive" must pick the same item for every visitor on a given day,
   or a statically generated page and a hydrated one disagree. Seeding from the
   build date gives a stable pick that still changes over time. */

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickSeeded<T>(items: readonly T[], seed: string): T | undefined {
  if (items.length === 0) return undefined;
  return items[hashString(seed) % items.length];
}
