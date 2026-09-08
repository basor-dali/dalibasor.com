'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * The route error boundary.
 *
 * Same identity as everything else — a rule, a label, oversized type, one way
 * forward. Visitors get a sentence and a button; the actual error goes to the
 * console for whoever is debugging, and never onto the page. A stack trace on a
 * personal site tells a stranger about your filesystem and tells the person who
 * hit the bug nothing at all.
 */

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="u-page pt-36 pb-(--spacing-section) sm:pt-44">
      <hr className="u-rule" />
      <p className="u-label text-ember mt-5">Something broke</p>

      <div className="u-grid mt-14 items-end sm:mt-20">
        <div className="col-span-2 min-w-0 md:col-span-6 lg:col-span-7">
          <h1 className="u-display u-display-tight max-w-[13ch] text-4xl text-white">
            This page failed to render
          </h1>
        </div>

        <div className="col-span-2 md:col-span-6 lg:col-span-5 lg:pb-4">
          <p className="u-serif text-soft max-w-(--container-text) text-xl">
            Nothing is lost. This is a rendering fault, not a missing page — try it again,
            and the rest of the site is unaffected either way.
          </p>

          {error.digest ? (
            <p className="u-label text-muted mt-8">
              Reference <span className="u-nums text-muted">{error.digest}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="border-line mt-(--spacing-section-sm) flex flex-wrap items-center gap-x-10 gap-y-5 border-t pt-10">
        <button
          type="button"
          onClick={reset}
          className="u-label border-line-strong text-ivory hover:border-ember border px-6 py-4 transition-colors duration-300 hover:text-white"
        >
          Try again
        </button>

        <Link
          href="/"
          className="u-label u-link u-link-reveal text-muted hover:text-ivory"
        >
          Go to the front page
        </Link>
      </div>
    </div>
  );
}
