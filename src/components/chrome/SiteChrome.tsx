'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Navigation } from './Navigation';

/**
 * Decides whether a route gets the site's chrome.
 *
 * The admin tools — Keystatic and the media importer — are full-screen
 * applications. Wrapping them in the site's fixed navigation, footer and dark
 * editorial styling would leave them unusable, and they are not part of the
 * public site in any case.
 *
 * This is a client component purely so it can read the pathname; the pages it
 * wraps stay server components, because `children` is already-rendered output
 * passed through untouched.
 *
 * The footer arrives the same way, as a slot, and that is load-bearing. It
 * used to be imported here, which made it a client component — and it prints
 * the current year. A static page is built in one year and read in the next:
 * every January the browser's year disagreed with the HTML's, React threw
 * hydration error #418 and re-rendered the whole page from scratch, on every
 * page, until the next deploy. Rendered on the server, the year is simply
 * part of the built HTML.
 */

const ADMIN_PREFIXES = ['/keystatic', '/admin'];

export function SiteChrome({
  children,
  footer,
}: {
  children: ReactNode;
  /** Server-rendered. See the note above before importing a footer here. */
  footer: ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = ADMIN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isAdmin) {
    return <div data-admin="true">{children}</div>;
  }

  return (
    <>
      <a
        href="#main"
        className="u-label focus:border-line-strong focus:bg-ground focus:text-ivory sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:border focus:px-4 focus:py-3"
      >
        Skip to content
      </a>
      <Navigation />
      <main id="main">{children}</main>
      {footer}
    </>
  );
}
