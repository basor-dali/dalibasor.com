/**
 * Naming and writing a note — kept apart from the command so it can be tested.
 */

import { slugify, yamlString } from './scaffold.mjs';

/** How many of the note's first words go into its address. */
const WORDS = 5;

/**
 * `2026-10-11-first-snow-on-the-car` — the day, then the first few words.
 * A note with no words (a photograph alone) is just its day plus `photo`, or
 * `note`. The caller adds -2, -3 if the address is taken.
 */
export function noteBaseName(date, text, { photo = false } = {}) {
  const words = slugify(String(text ?? ''))
    .split('-')
    .filter(Boolean)
    .slice(0, WORDS)
    .join('-');
  return `${date}-${words || (photo ? 'photo' : 'note')}`;
}

/**
 * Typed words, made safe to be MDX. MDX reads `<` as the start of a component
 * and `{` as code, so "I <3 this" or "{sic}" typed on the command line would
 * stop the whole site building. A backslash makes each one plain text.
 */
export function escapeMdx(text) {
  return String(text ?? '').replace(/[<>{}]/g, (char) => `\\${char}`);
}

/** The file's contents: frontmatter for what was given, then the words. */
export function noteFile({
  date,
  time,
  title,
  photo,
  link,
  location,
  tags = [],
  draft,
  text,
}) {
  const lines = [
    '---',
    `date: ${yamlString(time ? `${date} ${time}` : date)}`,
    title ? `title: ${yamlString(title)}` : null,
    photo ? `photo: ${yamlString(photo)}` : null,
    link ? `link: ${yamlString(link)}` : null,
    location ? `location: ${yamlString(location)}` : null,
    tags.length > 0 ? `tags: [${tags.map(yamlString).join(', ')}]` : null,
    draft ? 'draft: true' : null,
    '---',
    '',
  ].filter((line) => line !== null);
  return `${lines.join('\n')}${text ? `${escapeMdx(String(text).trim())}\n` : ''}`;
}
