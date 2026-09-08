'use client';

import { useEffect } from 'react';

/**
 * The last resort.
 *
 * `error.tsx` catches a page. This catches the root layout itself, which means
 * by the time it renders, the nav, the footer and the fonts have all failed to
 * mount. It replaces the entire document — its own <html> and <body> — and
 * without it Next serves its own default: an unstyled white page reading
 * "Application error: a client-side exception has occurred", with no lang
 * attribute, no landmark and no way back.
 *
 * That is a bad thing to have happen on any site and a jarring one here, where
 * every other page is warm near-black. So this one is written in the same
 * register as /404 and error.tsx: a rule, a label, oversized type, one way
 * forward.
 *
 * Every style is inline on purpose. This is the page for when things have not
 * loaded, so it cannot depend on a stylesheet having loaded — and the layout
 * that imports globals.css is precisely the thing that just failed. The fonts
 * fall back to the system stack for the same reason. It is the one file in the
 * repo that is allowed to repeat the palette instead of reading the tokens,
 * and the values below are copied from globals.css.
 */

const GROUND = '#0c0b0a';
const IVORY = '#ede7dd';
const SOFT = '#b3aba2';
const MUTED = '#8c857e';
const EMBER = '#d2673f';
const LINE = '#35312e';

const SANS = "Archivo, 'Helvetica Neue', Arial, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // To the console, never onto the page. A stack trace tells a stranger
    // about the filesystem and tells the person who hit the bug nothing.
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          backgroundColor: GROUND,
          color: IVORY,
          fontFamily: SANS,
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <main
          style={{
            maxWidth: '46rem',
            margin: '0 auto',
            padding: 'clamp(4rem, 12vh, 9rem) clamp(1.25rem, 5vw, 3.5rem)',
          }}
        >
          <hr style={{ border: 0, borderTop: `1px solid ${LINE}`, margin: 0 }} />

          <p
            style={{
              fontFamily: MONO,
              fontSize: '0.6875rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: EMBER,
              margin: '1.25rem 0 0',
            }}
          >
            Something broke
          </p>

          <h1
            style={{
              fontFamily: SANS,
              fontWeight: 500,
              fontSize: 'clamp(2rem, 7vw, 3.25rem)',
              lineHeight: 1.04,
              letterSpacing: '-0.02em',
              maxWidth: '14ch',
              color: '#fbf8f3',
              margin: '3rem 0 0',
            }}
          >
            The site failed to load
          </h1>

          <p
            style={{
              color: SOFT,
              fontSize: '1.0625rem',
              lineHeight: 1.7,
              maxWidth: '38rem',
              margin: '2rem 0 0',
            }}
          >
            Nothing is lost — this is the page failing to render, not anything failing to
            exist. Reloading usually settles it.
          </p>

          {error.digest ? (
            <p
              style={{
                fontFamily: MONO,
                fontSize: '0.6875rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: MUTED,
                margin: '2rem 0 0',
              }}
            >
              Reference {error.digest}
            </p>
          ) : null}

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '1.5rem 2.5rem',
              borderTop: `1px solid ${LINE}`,
              marginTop: 'clamp(3rem, 8vh, 5rem)',
              paddingTop: '2.5rem',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                fontFamily: MONO,
                fontSize: '0.6875rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: IVORY,
                background: 'transparent',
                border: `1px solid ${LINE}`,
                padding: '1rem 1.5rem',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>

            {/* A plain anchor, not next/link, and the lint rule is wrong for
                exactly this file: global-error replaces the whole document
                because the root layout threw, so the router is part of what
                has already failed. A client-side navigation would ask the
                thing that just broke to try again. This has to be a real
                request to the server. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                fontFamily: MONO,
                fontSize: '0.6875rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: MUTED,
              }}
            >
              Go to the front page
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
