#!/usr/bin/env node
/**
 * note — write a note, in one line.
 *
 * The smallest way to put something on the site: the words you type are the
 * note, dated now, at content/notes/<year>/<date>-<first-words>.mdx. Nothing
 * else to set up — no media bucket, no editor, no frontmatter to remember.
 * Commit and push, and it is on the site, on its year, and in the feed.
 *
 * Usage:
 *   npm run note -- "First snow. The car is a white loaf."
 *   npm run note -- "Back in Belgrade." --place "Belgrade, Serbia"
 *   npm run note -- --photo 2026-everyday-0007 "The view from the bridge."
 */

import fs from 'node:fs';
import path from 'node:path';
import { blank, fail, info, usage } from './lib/log.mjs';
import { noteBaseName, noteFile } from './lib/notes.mjs';
import { contentPath, parseFlags, today, writeNew } from './lib/scaffold.mjs';

function printUsage() {
  usage(`note — write a note, in one line

  npm run note -- "First snow. The car is a white loaf."
  npm run note -- "Back in Belgrade." --place "Belgrade, Serbia"
  npm run note -- --photo 2026-everyday-0007 "The view from the bridge."

Options:
  --place "City, Country"  Files it under that place
  --photo <id>             A photograph already in the archive (its id)
  --link <url>             A page the note is about
  --title "…"              Optional; most notes have none
  --tags a,b               Free text
  --date YYYY-MM-DD        Defaults to today, with the time
  --draft                  Visible in dev, hidden in production
  --help`);
}

const { flags, positional } = parseFlags(process.argv.slice(2), [
  'place',
  'photo',
  'link',
  'title',
  'tags',
  'date',
]);

if (flags.help) {
  printUsage();
  process.exit(0);
}

const text = positional.join(' ').trim();
const str = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;
const photo = str(flags.photo);

if (!text && !photo) {
  printUsage();
  blank();
  fail('Write something, or give a --photo.  npm run note -- "What happened"');
}

const now = new Date();
const given = str(flags.date);
if (given && !/^\d{4}-\d{2}-\d{2}$/.test(given)) {
  fail(`--date must be YYYY-MM-DD, got "${given}".`);
}
const date = given ?? today().date;
// The time only when the note is written now; a backdated note has no honest time.
const time = given
  ? undefined
  : `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

const link = str(flags.link);
if (link && !/^https?:\/\//i.test(link))
  fail(`--link must start with http:// or https://, got "${link}".`);

const dir = contentPath('notes', date.slice(0, 4));
const base = noteBaseName(date, text, { photo: Boolean(photo) });
let name = base;
for (let n = 2; fs.existsSync(path.join(dir, `${name}.mdx`)); n += 1)
  name = `${base}-${n}`;

writeNew(
  path.join(dir, `${name}.mdx`),
  noteFile({
    date,
    time,
    title: str(flags.title),
    photo,
    link,
    location: str(flags.place),
    tags: (str(flags.tags) ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    draft: flags.draft === true,
    text,
  }),
  { what: 'note' },
);

info(`It will live at /notes/${name}. Commit and push to publish it.`);
