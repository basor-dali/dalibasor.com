import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MentionedIn } from '@/components/archive/MentionedIn';
import { NoteEntry } from '@/components/notes/NoteEntry';
import { ArrowLink, Label } from '@/components/primitives';
import { getNote, getNoteNeighbours, getNoteSlugs } from '@/lib/content';
import { shareImageUrl } from '@/lib/media';
import { breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/metadata';
import { replyHref } from '@/lib/site';
import { formatDate, isoDateTime, truncate } from '@/lib/utils';
import type { NoteSummary } from '@/types/content';

/**
 * /notes/[slug] — one note, at its permanent address.
 *
 * The same note as in the stream, given the page to itself so it can be sent
 * to someone, answered, and found again. Its neighbours are the notes either
 * side in time.
 */

type Params = { slug: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getNoteSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const note = getNote(slug);
  if (!note)
    return pageMetadata({ title: 'Not found', path: `/notes/${slug}`, noIndex: true });

  return pageMetadata({
    title: note.title ?? `${note.label} — ${formatDate(note.date)}`,
    description: truncate(note.plain, 180) || `A note from ${formatDate(note.date)}.`,
    path: note.href,
    image: (note.photoItem && shareImageUrl(note.photoItem)) ?? '/opengraph-image',
    type: 'article',
    publishedTime: isoDateTime(note.date),
    tags: note.tags,
    noIndex: note.draft || note.noindex,
  });
}

function Neighbour({
  note,
  direction,
}: {
  note?: NoteSummary;
  direction: 'Older' | 'Newer';
}) {
  if (!note) return <div className="hidden py-8 md:block" />;
  return (
    <div
      className={direction === 'Newer' ? 'relative py-8 md:text-right' : 'relative py-8'}
    >
      <Label className="block">{direction}</Label>
      <p className="u-serif text-ivory mt-2 text-lg">
        <Link
          href={note.href}
          className="after:absolute after:inset-0 after:content-[''] hover:text-white"
        >
          {note.label}
        </Link>
      </p>
      <p className="u-label u-nums text-muted mt-2">{formatDate(note.date)}</p>
    </div>
  );
}

export default async function NotePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const note = getNote(slug);
  if (!note) notFound();

  const { previous, next } = getNoteNeighbours(slug);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Notes', path: '/notes' },
            { name: note.label, path: note.href },
          ]),
        )}
      />

      <div className="u-page pt-32 sm:pt-40">
        <Link
          href="/notes"
          className="u-label text-muted hover:text-ivory transition-colors duration-300"
        >
          <span aria-hidden="true">&larr;</span> Notes
        </Link>
        <NoteEntry note={note} standalone className="mt-10" />
      </div>

      <footer className="u-page mt-14 pb-(--spacing-section) sm:mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-4 md:pl-[calc(11rem+var(--spacing-gutter))]">
          <ArrowLink
            href={replyHref(
              `Re: ${note.title ?? `your note of ${formatDate(note.date)}`}`,
            )}
          >
            Reply by email
          </ArrowLink>
          <ArrowLink href={`/years/${note.year}`}>Everything from {note.year}</ArrowLink>
        </div>

        {previous || next ? (
          <nav
            aria-label="Notes either side"
            className="border-line mt-12 grid border-t md:grid-cols-2"
          >
            <Neighbour note={previous} direction="Older" />
            <Neighbour note={next} direction="Newer" />
          </nav>
        ) : null}
      </footer>

      <MentionedIn href={note.href} className="u-page pb-(--spacing-section)" />
    </>
  );
}
