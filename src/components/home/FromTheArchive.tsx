import Link from 'next/link';
import type { ArchiveEntry } from '@/types/content';
import { MetaLine, StatusDot } from '@/components/primitives';
import { MediaImage } from '@/components/media/MediaImage';
import { STATUS_LABELS } from '@/lib/content';
import { formatDate, formatMonthYear, isoDate, pluralize, truncate } from '@/lib/utils';
import { CoverFrame, LinkCue, PlaceholderFrame } from './Hero';

/**
 * From the archive.
 *
 * One thing, picked deterministically from everything the site knows about and
 * weighted towards older material. It is not a recommendation — it is whatever
 * the archive coughed up today, presented as a found object in its own band.
 *
 * The pick gets more interesting every year the site exists.
 */

const KIND_LABEL: Record<ArchiveEntry['kind'], string> = {
  post: 'Writing',
  project: 'Project',
  album: 'Album',
  photo: 'Photograph',
  now: 'Now',
};

/** Half of the eight-column body slot on desktop. */
const SPLIT_SIZES = '(min-width: 64rem) 31vw, (min-width: 40rem) 46vw, 100vw';

export function FromTheArchive({ entry }: { entry?: ArchiveEntry }) {
  return (
    <section
      className="border-y border-line bg-ground-deep py-(--spacing-section)"
      aria-labelledby="home-found"
    >
      <div className="u-page">
        <div className="u-grid items-start">
          {/* --- the time stamp, which is the whole point ------------------- */}
          <div className="col-span-2 md:col-span-2 lg:col-span-3">
            <h2 id="home-found" className="u-label text-ember">
              From the archive
            </h2>

            {entry ? (
              <p className="mt-8">
                <span className="u-label block text-muted">From</span>
                <span className="u-display u-display-tight u-nums mt-1 block text-4xl text-ivory">
                  {entry.year}
                </span>
                <span className="u-label mt-3 block text-muted">{KIND_LABEL[entry.kind]}</span>
              </p>
            ) : null}
          </div>

          {/* --- whatever came back ----------------------------------------- */}
          <div className="col-span-2 mt-6 md:col-span-4 lg:col-span-8 lg:col-start-5 lg:mt-0">
            {entry ? (
              <Body entry={entry} />
            ) : (
              <p className="u-serif max-w-(--container-text-wide) text-xl text-muted">
                Nothing old enough to resurface yet. Once there is some history here, this is
                where a photograph, a project or an entry from years back will turn up.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
   One renderer per kind
   ========================================================================== */

function Body({ entry }: { entry: ArchiveEntry }) {
  switch (entry.kind) {
    case 'post': {
      const post = entry.post;
      return (
        <Link href={post.href} className="group block">
          <h3 className="u-display text-3xl text-white">
            <span className="u-link u-link-reveal">{post.title}</span>
          </h3>

          {post.excerpt ? (
            <p className="mt-5 max-w-(--container-text) text-soft">
              {truncate(post.excerpt, 220)}
            </p>
          ) : null}

          <MetaLine
            className="mt-6"
            items={[
              <time key="d" dateTime={isoDate(post.date)}>
                {formatDate(post.date)}
              </time>,
              post.location,
              `${post.readingMinutes} min read`,
            ]}
          />

          <LinkCue className="mt-7">Read</LinkCue>
        </Link>
      );
    }

    case 'project': {
      const project = entry.project;
      return (
        <Link href={project.href} className="group block">
          <div className="grid items-center gap-7 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <CoverFrame
              publicId={project.coverImage}
              alt={project.coverAlt ?? project.title}
              ratio="4 / 3"
              ladder="grid"
              sizes={SPLIT_SIZES}
              tone="surface-3"
              placeholderLabel="Photograph"
            />
            <div>
              <p className="u-label flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
                <span className="inline-flex items-center gap-2">
                  <StatusDot status={project.status} />
                  {STATUS_LABELS[project.status]}
                </span>
                <span aria-hidden="true" className="text-line-strong">
                  ·
                </span>
                <span className="u-nums">{project.period}</span>
              </p>

              <h3 className="u-display mt-4 text-2xl text-white">
                <span className="u-link u-link-reveal">{project.title}</span>
              </h3>

              {project.description ? (
                <p className="mt-4 text-sm text-muted">{truncate(project.description, 160)}</p>
              ) : null}

              <LinkCue className="mt-6">Open</LinkCue>
            </div>
          </div>
        </Link>
      );
    }

    case 'album': {
      const album = entry.album;
      const cover = album.coverItem;
      return (
        <Link href={album.href} className="group block">
          <div className="grid items-center gap-7 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {cover && cover.type === 'image' ? (
              <MediaImage
                item={cover}
                ladder="grid"
                sizes={SPLIT_SIZES}
                ratio="4 / 3"
                className="transition-opacity duration-700 group-hover:opacity-90"
              />
            ) : (
              <PlaceholderFrame ratio="4 / 3" label="Photograph" tone="surface-3" />
            )}

            <div>
              {album.subtitle ? <p className="u-label text-muted">{album.subtitle}</p> : null}

              <h3 className="u-display mt-3 text-2xl text-white">
                <span className="u-link u-link-reveal">{album.title}</span>
              </h3>

              <MetaLine
                className="mt-5"
                items={[
                  album.location,
                  album.photoCount > 0 ? pluralize(album.photoCount, 'photograph') : undefined,
                  album.videoCount > 0 ? pluralize(album.videoCount, 'video') : undefined,
                ]}
              />

              <LinkCue className="mt-6">Open the album</LinkCue>
            </div>
          </div>
        </Link>
      );
    }

    case 'photo': {
      const item = entry.item;
      return (
        <Link href={`/photos/${item.year}`} className="group block">
          <div className="grid items-end gap-7 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <MediaImage
              item={item}
              ladder="feature"
              sizes={SPLIT_SIZES}
              fit="fit"
              className="bg-surface transition-opacity duration-700 group-hover:opacity-90"
            />

            <div>
              {item.caption ? <p className="u-serif text-xl text-ivory">{item.caption}</p> : null}

              <MetaLine
                className="mt-5"
                items={[
                  item.location,
                  item.capturedAt ? formatDate(item.capturedAt) : String(item.year),
                ]}
              />

              <LinkCue className="mt-6">See {item.year}</LinkCue>
            </div>
          </div>
        </Link>
      );
    }

    case 'now': {
      const now = entry.now;
      return (
        <Link href={now.href} className="group block">
          <h3 className="u-display u-nums text-3xl text-white">
            <span className="u-link u-link-reveal">{now.title}</span>
          </h3>

          <MetaLine className="mt-6" items={[now.location, formatMonthYear(now.date)]} />

          <LinkCue className="mt-7">Read that month</LinkCue>
        </Link>
      );
    }
  }
}
