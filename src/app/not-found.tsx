import type { Metadata } from 'next';
import Link from 'next/link';
import { ordinalLabel } from '@/lib/utils';

/**
 * 404.
 *
 * An archive is mostly addresses, and addresses change. This page says so
 * plainly, sets the number at the size the number deserves, and then gets out
 * of the way with four honest places to go.
 */

export const metadata: Metadata = {
  title: 'Not found',
  robots: { index: false, follow: false },
};

const DESTINATIONS = [
  { href: '/', label: 'Home', note: 'The front page' },
  { href: '/writing', label: 'Writing', note: 'Essays and notes' },
  { href: '/projects', label: 'Projects', note: 'Built, finished, abandoned' },
  { href: '/photos', label: 'Photos + Video', note: 'The archive, year by year' },
];

export default function NotFound() {
  return (
    <div className="u-page pt-36 pb-(--spacing-section) sm:pt-44">
      <hr className="u-rule" />
      <p className="u-label text-ember mt-5">Error 404</p>

      <div className="u-grid mt-12 items-end sm:mt-16">
        <div className="col-span-2 min-w-0 md:col-span-6 lg:col-span-7">
          <p
            aria-hidden="true"
            className="u-display u-display-tight u-nums text-colossal text-mute max-w-full"
          >
            404
          </p>
        </div>

        <div className="col-span-2 md:col-span-6 lg:col-span-5 lg:pb-6">
          <h1 className="u-display u-display-tight max-w-[16ch] text-2xl text-white">
            This page is not in the archive
          </h1>
          <p className="u-serif text-soft mt-6 max-w-(--container-text) text-xl">
            Either it never existed, or it did and the address moved. Both happen.
            Everything that is here is behind one of these.
          </p>
        </div>
      </div>

      <nav aria-label="Where to go instead" className="mt-(--spacing-section-sm)">
        <ul className="m-0 grid list-none gap-x-(--spacing-gutter) gap-y-0 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {DESTINATIONS.map((destination, index) => (
            <li key={destination.href} className="border-line border-t">
              <Link href={destination.href} className="group/dest block py-6">
                <span className="u-label u-nums text-muted group-hover/dest:text-ember block transition-colors duration-300">
                  {ordinalLabel(index)}
                </span>
                <span className="u-display text-ivory mt-4 block text-xl transition-colors duration-300 group-hover/dest:text-white">
                  {destination.label}
                </span>
                <span className="u-label text-muted mt-2.5 block">
                  {destination.note}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
