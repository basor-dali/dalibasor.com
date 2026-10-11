import Link from 'next/link';
import type { NoteSummary } from '@/types/content';
import { MdxContent } from '@/components/mdx/MdxContent';
import { MediaImage } from '@/components/media/MediaImage';
import { PlaceLink } from '@/components/places/PlaceLink';
import { MetaLine } from '@/components/primitives';
import { mediaAlt } from '@/lib/media';
import { absoluteUrl } from '@/lib/metadata';
import { site } from '@/lib/site';
import { cx, formatDate, isoDate } from '@/lib/utils';

/**
 * One note, the same in the stream and on its own page.
 *
 * Dated, then written: the day leads, because a note's day is most of what it
 * is. In the stream the day is the link to the note's own address, so any
 * one of them can be sent to someone. A note has a heading for screen-reader
 * navigation — its title when it has one, otherwise its day.
 */

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function NoteEntry({
  note,
  standalone = false,
  headingLevel = 3,
  className,
}: {
  note: NoteSummary;
  /** On its own page: the heading is the page's h1 and the day is not a link. */
  standalone?: boolean;
  headingLevel?: 1 | 2 | 3;
  className?: string;
}) {
  const Heading = `h${standalone ? 1 : headingLevel}` as 'h1' | 'h2' | 'h3';
  const day = formatDate(note.date);
  const when = (
    <time
      dateTime={note.time ? `${isoDate(note.date)}T${note.time}` : isoDate(note.date)}
    >
      {day}
      {note.time ? ` · ${note.time}` : null}
    </time>
  );

  return (
    <article
      className={cx(
        'h-entry grid gap-x-(--spacing-gutter) gap-y-4 md:grid-cols-[11rem_minmax(0,1fr)]',
        className,
      )}
    >
      <data className="u-url hidden" value={absoluteUrl(note.href)} />
      <data className="p-author hidden" value={site.author.name} />

      <div className="u-label u-nums text-muted pt-1">
        {note.title ? (
          when
        ) : (
          <Heading className={cx('u-label', standalone && 'text-ivory')}>
            {standalone ? (
              when
            ) : (
              <Link href={note.href} className="u-link u-link-reveal hover:text-ivory">
                {when}
              </Link>
            )}
          </Heading>
        )}
      </div>

      <div className="max-w-(--container-text) min-w-0">
        {note.title ? (
          <Heading
            className={cx(
              'p-name u-display text-white',
              standalone ? 'u-display-tight text-4xl' : 'text-2xl',
            )}
          >
            {standalone ? (
              note.title
            ) : (
              <Link
                href={note.href}
                className="hover:text-ivory transition-colors duration-300"
              >
                {note.title}
              </Link>
            )}
          </Heading>
        ) : null}

        {note.body.trim() ? (
          <div className={cx('prose e-content', note.title && 'mt-5')}>
            <MdxContent source={note.body} />
          </div>
        ) : null}

        {note.photoItem && note.photoItem.type === 'image' ? (
          <figure className="mt-6">
            <Link href={`/photo/${note.photoItem.id}`} className="block">
              <MediaImage
                item={note.photoItem}
                ladder="feature"
                fit="fit"
                ratio={`${note.photoItem.width} / ${note.photoItem.height}`}
                sizes="(min-width: 64rem) 40rem, 92vw"
                alt={note.photoAlt ?? mediaAlt(note.photoItem)}
              />
            </Link>
          </figure>
        ) : null}

        {note.link || note.location ? (
          <MetaLine
            className="mt-5"
            items={[
              note.link ? (
                <a
                  key="link"
                  href={note.link}
                  className="u-link u-link-reveal hover:text-ivory"
                >
                  <span aria-hidden="true">↗ </span>
                  {domainOf(note.link)}
                </a>
              ) : null,
              note.location ? <PlaceLink key="place" location={note.location} /> : null,
            ]}
          />
        ) : null}
      </div>
    </article>
  );
}
