'use client';

import { makePage } from '@keystatic/next/ui/app';
import config from '../../../../keystatic.config';

/**
 * The Keystatic admin UI.
 *
 * Lives outside the site's chrome — SiteChrome checks the pathname and skips
 * the navigation and footer for /keystatic and /admin, so the editor gets a
 * clean shell instead of a dark editorial page wrapped around it.
 *
 * `'use client'` is load-bearing, and its absence fails in the least helpful
 * way possible: a blank white page, HTTP 200, nothing in the server log, and no
 * error in the browser.
 *
 * `@keystatic/core/ui` ships two builds behind an export condition. Without
 * this directive the page is a server component, so Node resolves the
 * `react-server` condition — and in that build `Keystatic` is a stub that
 * validates the config and returns null. It is doing exactly what it was
 * written to do. The whole editor is in the other build, which is only reached
 * from a client component.
 */
export default makePage(config);
