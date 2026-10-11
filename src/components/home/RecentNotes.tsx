import { NoteEntry } from '@/components/notes/NoteEntry';
import { SectionHeader } from '@/components/primitives';
import type { NoteSummary } from '@/types/content';

/**
 * The latest notes, under the latest writing.
 *
 * The homepage's one section that changes every few days rather than every
 * few months, which is what makes a returning visitor see something new.
 * With no notes it is not there at all: the essays above already say the
 * site is young, and a second empty section would only say it again.
 */
export function RecentNotes({ notes }: { notes: NoteSummary[] }) {
  if (notes.length === 0) return null;

  return (
    <section className="u-page py-(--spacing-section-sm)" aria-labelledby="home-notes">
      <SectionHeader
        rule="strong"
        eyebrow="Notes"
        title={<span id="home-notes">Lately</span>}
        link={{ href: '/notes', label: 'All notes' }}
      />
      <ol className="m-0 mt-12 list-none p-0">
        {notes.map((note) => (
          <li
            key={note.slug}
            className="border-line border-t py-10 first:border-t-0 first:pt-0"
          >
            <NoteEntry note={note} headingLevel={3} />
          </li>
        ))}
      </ol>
    </section>
  );
}
