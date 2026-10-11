import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, MetaLine, PageHeader } from '@/components/primitives';
import { getPlaces, placeCounts, type Place } from '@/lib/content';
import { breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/metadata';
import { pluralize } from '@/lib/utils';

/**
 * /places — every place written down, alphabetically.
 *
 * An index in the old sense: the place, the years it turns up in, and what is
 * filed under it. Built only from locations typed by hand; nothing here ever
 * came from GPS, which is stripped from every photograph before upload.
 */

export function generateMetadata(): Metadata {
  return pageMetadata({
    title: 'Places',
    description:
      'Every place written down on the site — on an essay, an album, a photograph or a Now entry — and everything filed under it. Typed by hand, never taken from GPS.',
    path: '/places',
    // Nothing to find until there is somewhere in it.
    noIndex: getPlaces().length === 0,
  });
}

function span(place: Place): string {
  const first = place.years[0]!;
  const last = place.years[place.years.length - 1]!;
  return first === last ? String(first) : `${first} — ${last}`;
}

export default function PlacesPage() {
  const places = getPlaces();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Places', path: '/places' },
          ]),
        )}
      />

      <PageHeader
        eyebrow="The archive"
        title="Places"
        lede="Every place written down on an essay, an album, a photograph or a Now entry, and everything filed under it. Typed by hand, never taken from GPS."
        meta={
          places.length > 0 ? (
            <MetaLine items={[pluralize(places.length, 'place')]} />
          ) : null
        }
      />

      <section className="u-page pb-(--spacing-section)" aria-label="Places">
        {places.length === 0 ? (
          <EmptyState title="No places yet">
            A place appears here once it is written down — as where an essay was written,
            or where an album or a photograph was taken.
          </EmptyState>
        ) : (
          <ul className="border-line m-0 list-none border-b p-0">
            {places.map((place) => (
              <li key={place.slug} className="border-line border-t">
                <Link
                  href={place.href}
                  className="group grid grid-cols-1 items-baseline gap-x-10 gap-y-2 py-6 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <span className="u-display text-ivory text-2xl transition-colors duration-300 group-hover:text-white">
                    {place.name}
                    <span className="sr-only">,</span>
                  </span>
                  <span className="u-label u-nums text-muted">
                    {[span(place), ...placeCounts(place)].join('  ·  ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
