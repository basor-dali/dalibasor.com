/**
 * Shared helpers for the `new:*` scaffolding scripts.
 *
 * These scripts create correctly-shaped files with valid frontmatter and an
 * obvious placeholder body. They never write prose — that is the whole point
 * of this site.
 */

import fs from 'node:fs';
import path from 'node:path';
import { contentPath, ensureDir, displayPath, slugify } from './manifest.mjs';
import { fail, success, detail, blank, info } from './log.mjs';

/** The marker every scaffolded body carries. Grep for it to find unfinished work. */
export const WRITE_MARKER = '[DALI: WRITE THIS IN YOUR OWN WORDS]';

/**
 * Today, in the local timezone.
 *
 * Deliberately local rather than UTC: if you sit down at 9pm on the 7th to
 * write, the file should say the 7th, not tomorrow.
 */
export function today() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return { year, month, day, date: `${year}-${month}-${day}`, period: `${year}-${month}` };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** `2026-09` → `September 2026`. */
export function periodTitle(period) {
  const [year, month] = period.split('-');
  const index = Number.parseInt(month, 10) - 1;
  return MONTHS[index] ? `${MONTHS[index]} ${year}` : period;
}

/**
 * Pull `--flag value` and `--flag=value` out of argv, returning the flags plus
 * whatever was left over as positional arguments.
 */
export function parseFlags(argv, knownFlags = []) {
  const flags = {};
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      flags.help = true;
      continue;
    }

    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
        continue;
      }
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (knownFlags.includes(name) && next !== undefined && !next.startsWith('--')) {
        flags[name] = next;
        i += 1;
      } else {
        flags[name] = true;
      }
      continue;
    }

    positional.push(arg);
  }

  return { flags, positional };
}

/** YAML-quote a string only when it needs it, so frontmatter stays readable. */
export function yamlString(value) {
  const text = String(value);
  if (text === '') return "''";
  // Anything that could be read as another YAML type, or that starts a
  // structure, gets quoted. Everything else stays bare.
  if (
    /^[\s]|[\s]$/.test(text) ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(text) ||
    /:\s|\s#/.test(text) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(text) ||
    /^[\d.+-]/.test(text)
  ) {
    return `'${text.replace(/'/g, "''")}'`;
  }
  return text;
}

/**
 * Write a file, refusing to clobber an existing one.
 *
 * Never overwriting is not politeness, it is the rule: these scripts run at
 * the start of a writing session and the alternative is losing an essay.
 */
export function writeNew(absolutePath, contents, { what = 'file' } = {}) {
  if (fs.existsSync(absolutePath)) {
    fail(
      `${displayPath(absolutePath)} already exists.\n` +
        `Nothing was changed. Open it, or pick a different name.`,
    );
  }

  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, contents, 'utf8');

  blank();
  success(`Created ${what}`);
  detail(displayPath(absolutePath));
  blank();
  return absolutePath;
}

export { contentPath, slugify, displayPath, info };
