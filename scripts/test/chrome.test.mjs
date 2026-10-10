/**
 * The site chrome, pinned.
 *
 * Two failures that only show up after deploy, in a browser, at a particular
 * time — which is to say never in development:
 *
 * 1. The footer prints the current year. While it was a client component the
 *    browser recomputed that year during hydration, and a page built in one
 *    year and read in the next disagreed with its own HTML: React error #418
 *    and a full client re-render on every page, every January, until someone
 *    redeployed. Reproduced by loading the static build with the browser clock
 *    set to 2027.
 *
 * 2. `scroll-behavior: smooth` on <html> animates every route change unless
 *    <html> also carries data-scroll-behavior="smooth" — Next 16 only
 *    suspends smooth scrolling during navigation when that attribute asks it
 *    to. Measured: 44 frames of scrolling after clicking a footer link.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import fs from 'node:fs';

const read = (relative) =>
  fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

const isClient = (source) => /^\s*['"]use client['"]/.test(source);

describe('site chrome', () => {
  it('renders the footer on the server, not inside the client chrome', () => {
    assert.ok(!isClient(read('src/components/chrome/Footer.tsx')), 'Footer must stay a server component');
    const chrome = read('src/components/chrome/SiteChrome.tsx');
    assert.ok(isClient(chrome), 'SiteChrome is expected to be the client boundary');
    assert.ok(
      !/from '\.\/Footer'/.test(chrome),
      'SiteChrome imports Footer, which makes it a client component again — pass it in as the `footer` slot',
    );
    assert.match(read('src/app/layout.tsx'), /footer=\{<Footer /);
  });

  it('keeps route changes from animating the scroll', () => {
    const css = read('src/app/globals.css');
    if (!/scroll-behavior:\s*smooth/.test(css)) return;
    assert.match(read('src/app/layout.tsx'), /data-scroll-behavior="smooth"/);
  });
});
