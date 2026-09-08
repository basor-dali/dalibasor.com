#!/usr/bin/env node
/**
 * new:album — add an album to a year manifest.
 *
 * Useful when you want the album to exist before the photographs do — to write
 * the note first, or to reserve the URL. `media:import --album <slug>` creates
 * one automatically too, so this is only for doing it ahead of time.
 *
 * Usage:
 *   npm run new:album -- 2026 serbia
 *   npm run new:album -- 2026 serbia --title "Serbia" --subtitle "Summer 2026" --date 2026-07
 */

import { blank, detail, fail, info, success, usage } from './lib/log.mjs';
import {
  addAlbum,
  displayPath,
  findManifestPath,
  loadManifestDoc,
  saveManifestDoc,
  slugify,
  titleCase,
} from './lib/manifest.mjs';
import { parseFlags } from './lib/scaffold.mjs';

function printUsage() {
  usage(`new:album — add an album to a year

  npm run new:album -- 2026 serbia
  npm run new:album -- 2026 serbia --title "Serbia" --subtitle "Summer 2026" --date 2026-07

Options:
  --title <text>      Defaults to a title-cased version of the slug
  --subtitle <text>   e.g. "Summer 2026"
  --date YYYY-MM      Orders albums within the year
  --location <text>   Broad only, e.g. "Belgrade, Serbia"
  --help

Then put photographs in it:
  npm run media:import -- --year 2026 --album serbia --dir ~/PhotosToUpload/2026/Serbia`);
}

const { flags, positional } = parseFlags(process.argv.slice(2), [
  'title',
  'subtitle',
  'date',
  'location',
]);

if (flags.help) {
  printUsage();
  process.exit(0);
}

const [rawYear, rawSlug] = positional;

if (!rawYear || !/^\d{4}$/.test(rawYear)) {
  printUsage();
  blank();
  fail(`A four digit year is required. Got "${rawYear || '(nothing)'}".`);
}

if (!rawSlug) {
  printUsage();
  blank();
  fail('An album slug is required.  npm run new:album -- 2026 serbia');
}

const slug = slugify(rawSlug);
if (!slug) {
  fail(`"${rawSlug}" does not reduce to a usable slug.`);
}
if (slug !== rawSlug) {
  info(`Using slug "${slug}".`);
}

if (typeof flags.date === 'string' && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(flags.date)) {
  fail(`--date must be YYYY, YYYY-MM or YYYY-MM-DD, got "${flags.date}".`);
}

const existedBefore = Boolean(findManifestPath(rawYear));
const { doc, file } = loadManifestDoc(rawYear);

// addAlbum is a no-op returning false when the slug already exists, so it is
// both the check and the write.
const added = addAlbum(doc, {
  slug,
  title: typeof flags.title === 'string' ? flags.title : titleCase(slug),
  subtitle: typeof flags.subtitle === 'string' ? flags.subtitle : undefined,
  date: typeof flags.date === 'string' ? flags.date : undefined,
  location: typeof flags.location === 'string' ? flags.location : undefined,
});

if (!added) {
  fail(
    `${rawYear} already has an album "${slug}".\n` +
      `Nothing was changed. Edit it directly in ${displayPath(file)}.`,
  );
}

saveManifestDoc(doc, file);

blank();
success(`Added album "${slug}" to ${rawYear}`);
detail(displayPath(file));
if (!existedBefore) {
  detail(`Created the ${rawYear} manifest along the way.`);
}
blank();

info(`URL will be  /photos/${rawYear}/${slug}`);
detail(`npm run media:import -- --year ${rawYear} --album ${slug} --dir <folder>`);
blank();
