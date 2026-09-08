#!/usr/bin/env node
/**
 * new:now — scaffold this month's Now entry.
 *
 * Now entries are append-only. Updating /now means adding a new file; the
 * previous entry keeps its own permanent URL and joins the archive. In twenty
 * years this folder is a month-by-month record of a life, which only works
 * because nothing is ever overwritten.
 *
 * Usage:
 *   npm run new:now
 *   npm run new:now -- 2027-01
 *   npm run new:now -- --location "Belgrade, Serbia"
 */

import fs from 'node:fs';
import { blank, detail, fail, info, usage } from './lib/log.mjs';
import {
  WRITE_MARKER,
  contentPath,
  parseFlags,
  periodTitle,
  today,
  writeNew,
  yamlString,
} from './lib/scaffold.mjs';

function printUsage() {
  usage(`new:now — scaffold a Now snapshot

  npm run new:now                      this month
  npm run new:now -- 2027-01           a specific month
  npm run new:now -- --location "Belgrade, Serbia"

Options:
  --location <where>   Defaults to Wichita, Kansas
  --help

The current /now always shows the newest entry. Older ones stay reachable at
/now/YYYY-MM forever — that is the point of the page.`);
}

const { flags, positional } = parseFlags(process.argv.slice(2), ['location']);

if (flags.help) {
  printUsage();
  process.exit(0);
}

const period = (positional[0] ?? today().period).trim();
if (!/^\d{4}-\d{2}$/.test(period)) {
  fail(`Period must be YYYY-MM, got "${period}".`);
}

const month = Number.parseInt(period.slice(5), 10);
if (month < 1 || month > 12) {
  fail(`"${period}" is not a real month.`);
}

const location = typeof flags.location === 'string' ? flags.location : 'Wichita, Kansas';

const frontmatter = [
  '---',
  `period: ${period}`,
  `title: ${yamlString(periodTitle(period))}`,
  `location: ${yamlString(location)}`,
  `date: ${today().date}`,
  'placeholder: true',
  '---',
];

// The headings Dali asked for. Every one is empty on purpose.
const SECTIONS = ['Working', 'Building', 'Training', 'Reading', 'Traveling', 'Thinking About'];

const body = `
<Placeholder>
  **${WRITE_MARKER}**

  Fill in the sections below — or delete the ones that are not true this month.
  Remove \`placeholder: true\` from the frontmatter when you are done.
</Placeholder>

${SECTIONS.map((section) => `## ${section}\n\n${WRITE_MARKER}\n`).join('\n')}`;

const file = contentPath('now', `${period}.mdx`);
writeNew(file, `${frontmatter.join('\n')}\n${body}`, { what: 'Now entry' });

info(`This becomes the live /now once you fill it in.`);
detail(`It also keeps a permanent home at /now/${period}.`);

// Say what it replaces, so it is obvious the old one was preserved rather than lost.
try {
  const existing = fs
    .readdirSync(contentPath('now'))
    .filter((name) => /^\d{4}-\d{2}\.mdx?$/.test(name))
    .map((name) => name.replace(/\.mdx?$/, ''))
    .filter((name) => name !== period)
    .sort()
    .reverse();

  if (existing.length > 0) {
    detail(`Previous entry ${existing[0]} stays at /now/${existing[0]} — nothing was overwritten.`);
  }
} catch {
  // A missing directory here is not worth reporting; the file was still written.
}

blank();
