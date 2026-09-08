#!/usr/bin/env node
/**
 * new:post — scaffold a writing entry.
 *
 * Creates content/writing/<year>/<slug>.mdx with valid frontmatter and a
 * placeholder body. It does not write anything in Dali's voice, on purpose.
 *
 * Usage:
 *   npm run new:post -- "Getting Strong Again"
 *   npm run new:post -- "Getting Strong Again" --tags Fitness,Life
 *   npm run new:post -- "Something About Hardware" --date 2026-10-04 --draft
 */

import { blank, detail, fail, info, usage } from './lib/log.mjs';
import {
  WRITE_MARKER,
  contentPath,
  parseFlags,
  slugify,
  today,
  writeNew,
  yamlString,
} from './lib/scaffold.mjs';

function printUsage() {
  usage(`new:post — scaffold a writing entry

  npm run new:post -- "Getting Strong Again"
  npm run new:post -- "Getting Strong Again" --tags Fitness,Life
  npm run new:post -- "Deploying Hardware" --date 2026-10-04 --draft

Options:
  --tags a,b,c    Comma separated tags (free text — no list to maintain)
  --date YYYY-MM-DD   Defaults to today
  --slug my-slug  Defaults to a slug of the title. This becomes a permanent URL
  --draft         Mark as a draft: visible in dev, hidden in production
  --featured      Promote it on the homepage and the archive
  --help`);
}

const { flags, positional } = parseFlags(process.argv.slice(2), ['tags', 'date', 'slug']);

if (flags.help) {
  printUsage();
  process.exit(0);
}

const title = positional.join(' ').trim();
if (!title) {
  printUsage();
  blank();
  fail('A title is required.  npm run new:post -- "Your Title"');
}

const date = typeof flags.date === 'string' ? flags.date : today().date;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  fail(`--date must be YYYY-MM-DD, got "${date}".`);
}

const slug = slugify(typeof flags.slug === 'string' ? flags.slug : title);
if (!slug) {
  fail(`Could not build a slug from "${title}". Pass one with --slug.`);
}

const year = date.slice(0, 4);
const tags =
  typeof flags.tags === 'string'
    ? flags.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

const frontmatter = [
  '---',
  `title: ${yamlString(title)}`,
  `date: ${yamlString(date)}`,
  tags.length > 0 ? `tags: [${tags.map(yamlString).join(', ')}]` : 'tags: []',
  flags.featured ? 'featured: true' : null,
  flags.draft ? 'draft: true' : null,
  'placeholder: true',
  '',
  '# Optional — delete what you do not use.',
  '# subtitle: A short editorial line under the title',
  '# location: Belgrade, Serbia',
  '# coverImage: dalibasor/2026/serbia/img_0042',
  '# coverAlt: What the photograph shows',
  '# excerpt: Only if you want one. Nothing requires it.',
  '---',
].filter((line) => line !== null);

const body = `
<Placeholder>
  **${WRITE_MARKER}**

  Delete this block and write. Rough is fine — the design does not need tidy prose.

  When you are done, remove \`placeholder: true\` from the frontmatter above.
</Placeholder>

{/*
  Things you can use in here, beyond ordinary markdown:

  <Figure src="dalibasor/2026/serbia/img_0042" alt="Description" caption="Belgrade, August" />
  <Figure src="..." alt="..." bleed />          full width, past the reading measure

  <Row>
    <Figure src="..." alt="..." />
    <Figure src="..." alt="..." />
  </Row>

  <Video src="dalibasor/2026/serbia/clip_01" caption="Optional" />

  <Pull>A line worth setting large.</Pull>

  <Note>A short aside in a quieter voice.</Note>

  \`src\` is a media public id from content/media/*.yml — not a URL.
*/}
`;

const file = contentPath('writing', year, `${slug}.mdx`);
writeNew(file, `${frontmatter.join('\n')}\n${body}`, { what: 'post' });

info(`URL will be  /writing/${slug}`);
detail('That slug is a permanent address — changing it later breaks every link to it.');
blank();
