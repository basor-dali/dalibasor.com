'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Navigation } from './Navigation';
import { Footer } from './Footer';

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
 */

const ADMIN_PREFIXES = ['/keystatic', '/admin'];

export function SiteChrome({
  children,
  span,
}: {
  children: ReactNode;
  span: { from: number; to: number };
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
      <Footer span={span} />
    </>
  );
}
