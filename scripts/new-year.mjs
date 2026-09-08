#!/usr/bin/env node
/**
 * new:year — create a year manifest for the photo + video archive.
 *
 * Creates content/media/<YYYY>.yml with the structure and a short comment
 * header explaining every field, so the file is editable by hand years from
 * now without consulting anything.
 *
 * Usage:
 *   npm run new:year -- 2019
 *   npm run new:year -- 2019 --note "The year of the move."
 */

import { blank, detail, fail, info, usage } from './lib/log.mjs';
import { findManifestPath, manifestPath } from './lib/manifest.mjs';
import { parseFlags, today, writeNew, yamlString } from './lib/scaffold.mjs';

function printUsage() {
  usage(`new:year — create a year manifest

  npm run new:year -- 2019
  npm run new:year -- 2019 --note "The year of the move."

Options:
  --note <text>   A short note about the year, shown on the year page
  --help

Then import photographs into it:
  npm run media:import -- --year 2019 --dir ~/PhotosToUpload/2019/Everyday
  npm run media:import -- --year 2019 --album serbia --dir ~/PhotosToUpload/2019/Serbia`);
}

const { flags, positional } = parseFlags(process.argv.slice(2), ['note']);

if (flags.help) {
  printUsage();
  process.exit(0);
}

const year = (positional[0] ?? '').trim();
if (!/^\d{4}$/.test(year)) {
  printUsage();
  blank();
  fail(`A four digit year is required. Got "${year || '(nothing)'}".`);
}

const numeric = Number.parseInt(year, 10);
const thisYear = Number.parseInt(today().year, 10);
if (numeric < 1900 || numeric > thisYear + 1) {
  fail(`"${year}" does not look like a year you have photographs from.`);
}

const existing = findManifestPath(year);
if (existing) {
  fail(
    `A manifest for ${year} already exists.\n` +
      'Nothing was changed. Import into it with:\n' +
      `  npm run media:import -- --year ${year} --dir <folder>`,
  );
}

const contents = `# ${year} — photographs and video
#
# This file is the archive for ${year}. It is plain YAML on purpose: readable and
# editable with nothing but a text editor, decades from now.
#
# Generated and appended to by:  npm run media:import -- --year ${year} --dir <folder>
# Validated by:                  npm run media:check
#
# Anything you type by hand — captions, locations, covers, notes — is preserved
# when you import more photographs later.
#
# Fields on this file:
#   year    the year. Must match the filename.
#   note    optional. A few lines about the year, shown large on /photos/${year}.
#   cover   optional. An item id or publicId to open the year with.
#   albums  trips and events. Each becomes /photos/${year}/<slug>.
#   items   every photograph and video. No album = the year's everyday photographs.
#
# Fields on an album:
#   slug      the URL segment. Lowercase, hyphenated, permanent.
#   title     what it is called on screen.
#   subtitle  optional, e.g. "Summer ${year}".
#   date      optional YYYY-MM. Orders albums within the year.
#   location  optional, broad. Never coordinates.
#   cover     optional item id.
#   note      optional. Your words, shown at the top of the album.
#
# Fields on an item:
#   id           stable and permanent — the lightbox addresses photos by it.
#   type         image | video
#   album        an album slug, or omit for the year's everyday photographs.
#   publicId     the media CDN identifier.
#   width/height pixels. Required — they reserve the space so nothing jumps.
#   capturedAt   optional ISO timestamp from EXIF.
#   caption      optional. Yours to write.
#   alt          optional. What the photograph shows, for screen readers.
#   location     optional and BROAD, e.g. "Belgrade, Serbia". Typed by hand.
#                GPS is stripped at import and never published.
#   featured     optional. Promotes it to previews and "from the archive".
#   lqip         a tiny blurred placeholder, generated at import.
#   color        average colour, painted before anything loads.
#   duration     video only, in seconds.

year: ${numeric}
${typeof flags.note === 'string' ? `note: ${yamlString(flags.note)}\n` : `# note: |\n#   A few lines about ${year}, in your own words.\n`}albums: []

items: []
`;

writeNew(manifestPath(year), contents, { what: `${year} manifest` });

info('Next:');
detail(`npm run media:import -- --year ${year} --dir ~/PhotosToUpload/${year}/Everyday`);
detail(`npm run media:import -- --year ${year} --album serbia --dir ~/PhotosToUpload/${year}/Serbia`);
blank();
detail(`The year page appears at /photos/${year} as soon as it has items.`);
blank();
