#!/usr/bin/env node
/**
 * new:project — scaffold a project.
 *
 * Creates content/projects/<slug>.mdx. Fields are left empty rather than
 * guessed: this script does not know what you built, and inventing a
 * description would be worse than leaving a blank.
 *
 * Usage:
 *   npm run new:project -- "ReMow"
 *   npm run new:project -- "Crypto Trading Bot" --status paused --start 2023-06
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

const STATUSES = ['building', 'experiment', 'finished', 'paused', 'abandoned'];

function printUsage() {
  usage(`new:project — scaffold a project

  npm run new:project -- "ReMow"
  npm run new:project -- "Crypto Trading Bot" --status paused --start 2023-06

Options:
  --status <s>    ${STATUSES.join(' | ')}   (default: building)
  --start <date>  YYYY, YYYY-MM or YYYY-MM-DD   (default: this month)
  --end <date>    Only for something that has stopped
  --slug <slug>   Defaults to a slug of the title. A permanent URL
  --featured      Show it on the homepage
  --draft         Hide it in production
  --help

"abandoned" is a real status, not a failure. The archive is meant to show the
things that did not work.`);
}

const { flags, positional } = parseFlags(process.argv.slice(2), [
  'status',
  'start',
  'end',
  'slug',
]);

if (flags.help) {
  printUsage();
  process.exit(0);
}

const title = positional.join(' ').trim();
if (!title) {
  printUsage();
  blank();
  fail('A title is required.  npm run new:project -- "Your Project"');
}

const status = typeof flags.status === 'string' ? flags.status.toLowerCase() : 'building';
if (!STATUSES.includes(status)) {
  fail(`--status must be one of: ${STATUSES.join(', ')}. Got "${status}".`);
}

const start =
  typeof flags.start === 'string' ? flags.start : `${today().year}-${today().month}`;
if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(start)) {
  fail(`--start must be YYYY, YYYY-MM or YYYY-MM-DD, got "${start}".`);
}

if (typeof flags.end === 'string' && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(flags.end)) {
  fail(`--end must be YYYY, YYYY-MM or YYYY-MM-DD, got "${flags.end}".`);
}

const slug = slugify(typeof flags.slug === 'string' ? flags.slug : title);
if (!slug) {
  fail(`Could not build a slug from "${title}". Pass one with --slug.`);
}

const frontmatter = [
  '---',
  `title: ${yamlString(title)}`,
  `status: ${status}`,
  `startDate: ${start}`,
  typeof flags.end === 'string' ? `endDate: ${flags.end}` : null,
  'technologies: []',
  'collaborators: []',
  'links: []',
  'gallery: []',
  'relatedWriting: []',
  flags.featured ? 'featured: true' : null,
  flags.draft ? 'draft: true' : null,
  'placeholder: true',
  '',
  '# Optional — delete what you do not use.',
  '# description: One or two lines, shown in listings',
  '# coverImage: dalibasor/projects/' + slug + '/cover',
  '# coverAlt: What the photograph shows',
  '# order: 10        higher sorts first, overriding status ordering',
  '#',
  '# links:',
  '#   - { label: Repo, href: https://github.com/... }',
  '#',
  '# gallery:',
  `#   - { publicId: dalibasor/projects/${slug}/bench-01, width: 4032, height: 3024, alt: "Bench test" }`,
  `#   - { publicId: dalibasor/projects/${slug}/clip-01, type: video, width: 1920, height: 1080 }`,
  '#',
  '# relatedWriting: [some-post-slug]',
  '---',
].filter((line) => line !== null);

const body = `
<Placeholder>
  **${WRITE_MARKER}**

  Worth covering, if you feel like it:

  - what it actually is
  - why you started it
  - where it is right now
  - what broke, and what you would do differently

  Remove \`placeholder: true\` from the frontmatter when you have written something.
</Placeholder>
`;

const file = contentPath('projects', `${slug}.mdx`);
writeNew(file, `${frontmatter.join('\n')}\n${body}`, { what: 'project' });

info(`URL will be  /projects/${slug}`);
detail(`Status "${status}". Change it in the frontmatter as the project moves.`);
blank();
