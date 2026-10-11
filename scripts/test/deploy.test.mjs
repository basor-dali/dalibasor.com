/**
 * Things that only fail once it is too late.
 *
 * `npm run build` is a good proxy for the deployed build, but it is not the
 * same build. Some route configuration is read by the host rather than by
 * Next, so it compiles perfectly here and then rejects the whole deployment
 * after a push — which is the worst moment to find out, because the site that
 * is already live stays on the previous version and the failure looks like a
 * platform problem rather than a line of code.
 *
 * This happened: `maxDuration = 600` on the media upload route. Vercel's hobby
 * plan permits at most 300, so every deploy failed with "Builder returned
 * invalid maxDuration value". Locally, nothing had ever complained.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AI_TRAINING_CRAWLERS } from '../../src/lib/site.ts';

// fileURLToPath, not .pathname: on Windows the latter yields '/C:/Users/...',
// which fs then resolves to 'C:\C:\Users\...' and cannot open.
const APP_DIR = fileURLToPath(new URL('../../src/app', import.meta.url));

/** Every route file under src/app, as { file, source }. */
function routeFiles(dir = APP_DIR, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push({
        file: path.relative(APP_DIR, full),
        source: fs.readFileSync(full, 'utf8'),
      });
    }
  }
  return out;
}

/**
 * The hobby plan's ceiling. Raising this is a deliberate act that should follow
 * an actual plan change, not a hopeful guess about how long an upload takes.
 */
const MAX_DURATION_CEILING = 300;

describe('the lockfile the host installs from', () => {
  /* docs/DEPLOY.md warns that `vercel` once rewrote package-lock.json and
     dropped the `libc` constraints from sharp's Linux packages — after which
     the build fails on Vercel and works on Windows. npm itself does the same:
     an ordinary `npm install` on this machine stripped all 38 of them while
     adding a dependency during the 2026 audit. Nothing failed locally; the
     next deploy would have. */
  it('keeps the libc constraint on every Linux build of sharp', () => {
    const lock = JSON.parse(
      fs.readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'),
    );
    const linux = Object.entries(lock.packages).filter(([key]) =>
      /node_modules\/@img\/sharp-(libvips-)?linux/.test(key),
    );

    assert.ok(linux.length > 0, 'expected sharp Linux builds in the lockfile');
    const missing = linux
      .filter(([, entry]) => !Array.isArray(entry.libc))
      .map(([key]) => key);
    assert.deepEqual(
      missing,
      [],
      `libc constraints are gone from package-lock.json for:\n  ${missing.join('\n  ')}\n` +
        'Restore the lockfile from git and re-apply only the change you meant to make.',
    );
  });
});

describe('route configuration the host validates, not Next', () => {
  it('never asks for a longer function duration than the plan allows', () => {
    for (const { file, source } of routeFiles()) {
      const match = source.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
      if (!match) continue;

      const value = Number(match[1]);
      assert.ok(
        value >= 1 && value <= MAX_DURATION_CEILING,
        `${file} sets maxDuration = ${value}. Vercel's hobby plan accepts 1 to ` +
          `${MAX_DURATION_CEILING}, and anything outside that fails the deployment ` +
          'rather than the build, so nothing here would have told you.',
      );
    }
  });

  /* The admin routes only ever run on the dev server — adminAvailable() is
     false in production and every request 404s. Deployment directives on them
     are therefore inert at best, and at worst they are what breaks the deploy,
     which is exactly what maxDuration did. */
  it('puts no deployment directives on routes that only exist in development', () => {
    const devOnly = routeFiles().filter(
      ({ file, source }) =>
        file.replace(/\\/g, '/').includes('api/admin/') &&
        source.includes('adminAvailable'),
    );

    assert.ok(devOnly.length > 0, 'expected to find the dev-only admin API routes');

    for (const { file, source } of devOnly) {
      assert.ok(
        !/export\s+const\s+maxDuration/.test(source),
        `${file} sets maxDuration, but it returns 404 in production — the setting ` +
          'cannot help an upload and can fail a deploy.',
      );
    }
  });
});

describe('who robots.txt turns away once indexing is on', () => {
  /* The list is drawn by purpose, and several companies run one crawler of
     each kind: GPTBot trains while OAI-SearchBot searches, ClaudeBot trains
     while Claude-User fetches a page someone asked about. A search crawler on
     the list takes the site out of that search engine without a sound —
     "Applebot" where "Applebot-Extended" was meant drops it from Apple's. */
  it('never lists a search crawler, or an assistant a person is using', () => {
    const mustStayAllowed = [
      'Googlebot',
      'Bingbot',
      'Applebot',
      'DuckDuckBot',
      'OAI-SearchBot',
      'ChatGPT-User',
      'Claude-SearchBot',
      'Claude-User',
      'PerplexityBot',
      'Perplexity-User',
      'MistralAI-User',
      'Meta-ExternalFetcher',
    ];
    const listed = AI_TRAINING_CRAWLERS.map((name) => name.toLowerCase());
    assert.deepEqual(
      mustStayAllowed.filter((name) => listed.includes(name.toLowerCase())),
      [],
      'a crawler that sends readers back is on the AI training list',
    );
  });

  it('keeps the switches that stop training without leaving search', () => {
    // An empty list is the documented way to allow training, not a slip.
    if (AI_TRAINING_CRAWLERS.length === 0) return;
    for (const token of [
      'Google-Extended',
      'Applebot-Extended',
      'GPTBot',
      'ClaudeBot',
      'CCBot',
    ]) {
      assert.ok(
        AI_TRAINING_CRAWLERS.includes(token),
        `${token} is missing; if that is deliberate, take it out of this test too`,
      );
    }
  });
});
