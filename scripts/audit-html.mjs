#!/usr/bin/env node
/**
 * html:check — audit the built HTML of every page.
 *
 * `media:check` guards the content; this guards the markup. It reads the pages
 * that `next build` actually wrote and checks the things that hold true with
 * no JavaScript running: heading order, landmarks, accessible names, alt text,
 * labelled controls, unique ids, ARIA references that point at something,
 * valid JSON-LD, and a distinct title and description per page.
 *
 * These are the faults that never announce themselves. A heading level skipped
 * from h2 to h4 looks identical on screen and reads as a missing section to
 * anyone using a screen reader; a duplicate id silently breaks whichever
 * `aria-labelledby` loses the race; a second <h1> is invisible until someone
 * navigates by headings. Nothing here can be caught by types, by lint, or by
 * looking at the page.
 *
 * Requires a build first, because the point is to check the real output rather
 * than a guess at what the components will produce:
 *
 *   npm run build && npm run html:check
 *   npm run html:check -- --verbose     # every occurrence, not one per kind
 *
 * Exits non-zero if anything is found.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  blank,
  bullet,
  detail,
  error as logError,
  fail,
  heading,
  info,
  pluralize,
  success,
  usage,
} from './lib/log.mjs';

const BUILD_DIR = path.join('.next', 'server', 'app');

/**
 * Next writes its own build-time 500 fallback here. It is Next's markup, not
 * this site's — the error page we control is src/app/global-error.tsx.
 */
const NOT_OURS = new Set(['_global-error.html']);

/* ==========================================================================
   Arguments
   ========================================================================== */

function parseArgs(argv) {
  const options = { verbose: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg.startsWith('-')) {
      fail(`Unknown option: ${arg}\nRun with --help to see usage.`);
    }
  }
  return options;
}

function printUsage() {
  usage(`html:check — audit the built HTML of every page

  npm run build
  npm run html:check
  npm run html:check -- --verbose

Options:
  --verbose   List every occurrence rather than one example per kind
  --help      This message`);
}

/* ==========================================================================
   Reading the build
   ========================================================================== */

function builtPages(dir = BUILD_DIR, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) builtPages(full, out);
    else if (entry.name.endsWith('.html') && !NOT_OURS.has(entry.name)) out.push(full);
  }
  return out;
}

/** `.next/server/app/writing/foo.html` -> `/writing/foo`, and index -> `/`. */
function routeOf(file) {
  const rel = path
    .relative(BUILD_DIR, file)
    .split(path.sep)
    .join('/')
    .replace(/\.html$/, '');
  return rel === 'index' ? '/' : `/${rel}`;
}

/* ==========================================================================
   Markup helpers
   ==========================================================================
   Deliberately regex rather than a parser. Adding a DOM library to check the
   output would put a dependency in the twenty-year path for the sake of a
   development tool, and these checks only need to see tags and attributes. */

/** Script, style and template contents are not markup — do not scan them. */
function markupOnly(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<template[\s\S]*?<\/template>/gi, '');
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'));
  return match ? match[1] : undefined;
}

function hasAttr(tag, name) {
  return new RegExp(`\\s${name}(=|[\\s/>])`, 'i').test(tag);
}

/** Roughly what a screen reader would announce for a run of markup. */
function visibleText(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ==========================================================================
   Checks
   ========================================================================== */

class Report {
  constructor() {
    this.findings = [];
  }

  add(route, rule, message) {
    this.findings.push({ route, rule, message });
  }
}

function checkPage(file, report) {
  const route = routeOf(file);
  const raw = fs.readFileSync(file, 'utf8');
  const doc = markupOnly(raw);
  const add = (rule, message) => report.add(route, rule, message);

  /* --- the document itself --------------------------------------------- */
  if (!/<html[^>]*\slang="/i.test(raw)) {
    add('lang', '<html> has no lang attribute — screen readers guess the language.');
  }

  const title = (raw.match(/<title>([^<]*)<\/title>/i) ?? [, ''])[1].trim();
  if (!title) add('title', 'no <title>.');

  if (!/<meta name="description"/i.test(raw)) {
    add('description', 'no meta description.');
  }

  /* --- landmarks -------------------------------------------------------- */
  const mains = (doc.match(/<main[\s>]/gi) ?? []).length;
  if (mains === 0) add('landmark', 'no <main> — "skip to content" has nowhere to go.');
  if (mains > 1) add('landmark', `${mains} <main> elements; there must be exactly one.`);

  /* --- heading outline -------------------------------------------------- */
  const headings = [...doc.matchAll(/<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => ({
      level: Number(m[1]),
      text: visibleText(m[3]),
      hidden: /aria-hidden="true"/i.test(m[2]),
    }))
    // An aria-hidden heading is decoration — the colossal year numerals are
    // the reason this exists — and is not part of the announced outline.
    .filter((h) => !h.hidden);

  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length === 0) add('heading', 'no <h1>.');
  if (h1s.length > 1) {
    add('heading', `${h1s.length} <h1> elements: ${h1s.map((h) => h.text).join(' | ')}`);
  }

  let previous = 0;
  for (const h of headings) {
    if (previous > 0 && h.level > previous + 1) {
      add('heading-skip', `h${previous} jumps to h${h.level} at "${h.text.slice(0, 48)}".`);
    }
    if (!h.text) add('heading-empty', `an empty <h${h.level}>.`);
    previous = h.level;
  }

  /* --- images ----------------------------------------------------------- */
  for (const match of doc.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = (attr(tag, 'src') ?? '').slice(0, 70);
    // alt="" is correct and deliberate for decoration; a missing alt is not.
    if (!hasAttr(tag, 'alt')) add('img-alt', `<img> with no alt attribute: ${src}`);
  }

  /* --- anything clickable needs a name ---------------------------------- */
  for (const match of doc.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const [, tag, inner] = match;
    const href = attr(tag, 'href');
    const name = attr(tag, 'aria-label') || visibleText(inner) || attr(tag, 'title');

    if (!name) add('link-name', `<a href="${(href ?? '').slice(0, 50)}"> announces nothing.`);
    if (!hasAttr(tag, 'href')) add('link-href', 'an <a> with no href is not a link.');
    if (attr(tag, 'target') === '_blank' && !/noreferrer|noopener/.test(attr(tag, 'rel') ?? '')) {
      add('link-target', `target="_blank" without rel="noreferrer": ${href}`);
    }
  }

  for (const match of doc.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const [, tag, inner] = match;
    if (!(attr(tag, 'aria-label') || visibleText(inner))) {
      add('button-name', 'a <button> announces nothing.');
    }
    if (!hasAttr(tag, 'type')) {
      add('button-type', 'a <button> with no type — inside a form that submits it.');
    }
  }

  /* --- form controls ---------------------------------------------------- */
  for (const match of doc.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const [, element, tag] = match;
    if ((attr(tag, 'type') ?? '').toLowerCase() === 'hidden') continue;

    const id = attr(tag, 'id');
    const labelled =
      attr(tag, 'aria-label') ||
      attr(tag, 'aria-labelledby') ||
      (id && new RegExp(`<label[^>]*\\sfor="${id}"`, 'i').test(doc));

    if (!labelled) {
      add('control-label', `<${element}${id ? ` id="${id}"` : ''}> has no label.`);
    }
  }

  /* --- ids and the things that point at them ---------------------------- */
  const ids = [...doc.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  for (const id of new Set(ids.filter((v, i) => ids.indexOf(v) !== i))) {
    const count = ids.filter((x) => x === id).length;
    add('duplicate-id', `id="${id}" appears ${count} times; references resolve to one.`);
  }

  for (const match of doc.matchAll(/\saria-(labelledby|describedby|controls)="([^"]+)"/g)) {
    for (const ref of match[2].split(/\s+/)) {
      if (!ids.includes(ref)) {
        add('aria-dangling', `aria-${match[1]}="${ref}" points at no element on the page.`);
      }
    }
  }

  /* --- structured data -------------------------------------------------- */
  const jsonLd = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of raw.matchAll(jsonLd)) {
    try {
      const data = JSON.parse(match[1]);
      if (!data['@context'] || !data['@type']) {
        add('json-ld', 'a JSON-LD block with no @context or @type.');
      }
    } catch (err) {
      add('json-ld', `unparseable JSON-LD — ${err.message}`);
    }
  }

  return title;
}

/* ==========================================================================
   Main
   ========================================================================== */

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(BUILD_DIR)) {
    fail(
      'No build to check.\n' +
        'This reads the HTML that next build writes, so build first:\n' +
        '  npm run build && npm run html:check',
    );
  }

  const files = builtPages();
  if (files.length === 0) {
    info('The build contains no static HTML pages.');
    return;
  }

  heading(`Checking ${pluralize(files.length, 'page')}`);
  blank();

  const report = new Report();
  const titles = new Map();

  for (const file of files) {
    const route = routeOf(file);
    const title = checkPage(file, report);

    // Across pages rather than within one: two pages sharing a title are two
    // indistinguishable browser tabs and two identical search results.
    if (title) {
      const seen = titles.get(title);
      if (seen) report.add(route, 'title-duplicate', `same <title> as ${seen}: "${title}"`);
      else titles.set(title, route);
    }
  }

  if (report.findings.length === 0) {
    success(`${pluralize(files.length, 'page')} checked — nothing to report.`);
    return;
  }

  const byRule = new Map();
  for (const finding of report.findings) {
    if (!byRule.has(finding.rule)) byRule.set(finding.rule, []);
    byRule.get(finding.rule).push(finding);
  }

  logError(pluralize(report.findings.length, 'finding'));
  blank();

  for (const [rule, list] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
    detail(`${rule} — ${pluralize(list.length, 'page')}`);
    const shown = options.verbose ? list : dedupeByMessage(list);
    for (const finding of shown) {
      bullet(`${finding.route}\n    ${finding.message}`);
    }
    if (!options.verbose && shown.length < list.length) {
      detail(`  … and ${list.length - shown.length} more; run with --verbose`);
    }
    blank();
  }

  fail(`${pluralize(report.findings.length, 'finding')} in the built HTML.`);
}

/** One example per distinct message, so a repeated fault reads as one thing. */
function dedupeByMessage(list) {
  const seen = new Set();
  const out = [];
  for (const finding of list) {
    if (seen.has(finding.message)) continue;
    seen.add(finding.message);
    out.push(finding);
  }
  return out;
}

main();
