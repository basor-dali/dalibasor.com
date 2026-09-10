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
