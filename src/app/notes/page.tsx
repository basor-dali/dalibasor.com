import type { Metadata } from 'next';
import Link from 'next/link';
import { NoteEntry } from '@/components/notes/NoteEntry';
import { ArrowLink, EmptyState, MetaLine, PageHeader } from '@/components/primitives';
import { getNotes } from '@/lib/content';
import { breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/metadata';
import { pluralize } from '@/lib/utils';

/**
 * /notes — the small things, newest first.
 *
 * A stream, read top to bottom, grouped by year. It shows the most recent
 * notes in full; the rest are on their year pages, where they sit beside
 * everything else from that year — so the page stays one page however many
 * years of notes there are.
 */

export function generateMetadata(): Metadata {
  return pageMetadata({
    title: 'Notes',
    description: 'Short entries, newest first: a sentence, a photograph, a link.',
    path: '/notes',
    image: '/opengraph-image',
    // An empty page is honest, but not worth a search engine's time.
    noIndex: getNotes().length === 0,
  });
}

/** Shown in full here; older notes live on their year pages. */
const ON_PAGE = 60;

export default function NotesPage() {
  const notes = getNotes();
  const shown = notes.slice(0, ON_PAGE);
  const shownYears = [...new Set(shown.map((note) => note.year))];
  // Years with any note not shown here — including the one the cut falls in.
  const olderYears = [...new Set(notes.slice(ON_PAGE).map((note) => note.year))];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Writing', path: '/writing' },
            { name: 'Notes', path: '/notes' },
          ]),
        )}
      />

      <PageHeader
        eyebrow="Writing"
        title="Notes"
        lede="Short entries, newest first. The longer pieces are in Writing."
        meta={
          <MetaLine
            items={[
              notes.length > 0 && pluralize(notes.length, 'note'),
              <Link
                key="writing"
                href="/writing"
                className="u-link u-link-reveal hover:text-ivory"
              >
                Essays
              </Link>,
              <Link
                key="feed"
                href="/feeds"
                className="u-link u-link-reveal hover:text-ivory"
              >
                Follow
              </Link>,
            ]}
          />
        }
      />

      <div className="u-page pb-(--spacing-section)">
        {notes.length === 0 ? (
          <EmptyState title="No notes yet">
            Short entries will appear here, newest first: a sentence, a photograph, a
            link.
          </EmptyState>
        ) : (
          shownYears.map((year) => (
            <section key={year} aria-labelledby={`notes-${year}`} className="mt-4">
              <hr className="u-rule-strong" />
              <h2 id={`notes-${year}`} className="u-display mt-8 text-2xl text-white">
                <Link
                  href={`/years/${year}`}
                  className="hover:text-ivory transition-colors duration-300"
                >
                  {year}
                </Link>
              </h2>
              <ol className="m-0 mt-8 mb-(--spacing-section-sm) list-none p-0">
                {shown
                  .filter((note) => note.year === year)
                  .map((note) => (
                    <li
                      key={note.slug}
                      className="border-line border-t py-10 first:border-t-0 first:pt-0"
                    >
                      <NoteEntry note={note} headingLevel={3} />
                    </li>
                  ))}
              </ol>
            </section>
          ))
        )}

        {olderYears.length > 0 ? (
          <nav aria-label="Older notes" className="border-line mt-6 border-t pt-8">
            <p className="u-label text-muted">Older notes are on their year pages</p>
            <ul className="mt-5 flex list-none flex-wrap gap-x-6 gap-y-3 p-0">
              {olderYears.map((year) => (
                <li key={year}>
                  <ArrowLink href={`/years/${year}#year-notes`}>{year}</ArrowLink>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
    </>
  );
}
