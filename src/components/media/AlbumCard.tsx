import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { LadderName, SizesPreset } from '@/lib/media';
import type { MediaItem, ResolvedAlbum } from '@/types/content';
import { cx, formatMonthYear, ordinalLabel, pluralize } from '@/lib/utils';
import { MediaImage } from './MediaImage';

/**
 * An album, presented as a photograph with type set against it.
 *
 * Deliberately not a card: no border, no panel, no rounded corner, no shadow.
 * The cover keeps its own proportions — an album of portraits should look
 * different on the page from an album of landscapes — and only the extremes
 * are clamped so a panorama or a 9:16 phone video cannot wreck a row.
 */

/* ==========================================================================
   Shared helpers — used by the album, year and archive pages too
   ========================================================================== */

/** `34 photographs + 2 videos` */
export function albumCountLabel(photoCount: number, videoCount: number): string {
  if (photoCount === 0 && videoCount === 0) return 'Nothing filed yet';
  if (videoCount === 0) return pluralize(photoCount, 'photograph');
  if (photoCount === 0) return pluralize(videoCount, 'video');
  return `${pluralize(photoCount, 'photograph')} + ${pluralize(videoCount, 'video')}`;
}

/**
 * The photograph's own aspect ratio, clamped only at the extremes so a layout
 * slot cannot be handed a 5:1 panorama or a 1:3 crop.
 */
export function frameRatio(item: MediaItem | undefined, min = 0.66, max = 2.4): string {
  if (!item?.width || !item.height) return '3 / 2';
  const ratio = item.width / item.height;
  const clamped = Math.min(max, Math.max(min, ratio));
  return `${clamped.toFixed(4)} / 1`;
}

/**
 * The frame that stands in when there is no photograph yet. A year with an
 * empty manifest still has to hold its shape on the page — and an empty frame
 * is honest in a way a broken image never is.
 */
export function EmptyFrame({
  ratio = '3 / 2',
  label = 'No photograph yet',
  className,
}: {
  ratio?: string;
  label?: string;
  className?: string;
}) {
  const style: CSSProperties = { ['--ar' as string]: ratio };

  return (
    <div
      className={cx(
        'u-frame flex items-center justify-center border border-line bg-surface-2',
        className,
      )}
      style={style}
    >
      <span className="u-label px-4 text-center text-mute">{label}</span>
    </div>
  );
}

/* ==========================================================================
   The card
   ========================================================================== */

export type AlbumCardProps = {
  album: ResolvedAlbum;
  /** Editorial numbering — `001` set over the top-left of the photograph. */
  index?: number;
  /** `feature` sets the title over the photograph; `standard` sets it beneath. */
  variant?: 'feature' | 'standard';
  ladder?: LadderName;
  sizes?: SizesPreset | (string & {});
  priority?: boolean;
  headingLevel?: 2 | 3 | 4;
  className?: string;
};

export function AlbumCard({
  album,
  index,
  variant = 'standard',
  ladder = 'grid',
  sizes = 'half',
  priority = false,
  headingLevel = 3,
  className,
}: AlbumCardProps) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  // Only a photograph can be a cover. A video-only album gets the empty frame
  // rather than an <img> pointed at something that is not an image.
  const cover = album.coverItem?.type === 'image' ? album.coverItem : undefined;
  const isFeature = variant === 'feature';

  // A feature slot is wide, so its cover is held closer to landscape; a
  // standard slot can carry a portrait at close to its native shape.
  const ratio = isFeature ? frameRatio(cover, 1.15, 2.6) : frameRatio(cover, 0.72, 2.2);

  const count = albumCountLabel(album.photoCount, album.videoCount);
  const dateLabel = !album.subtitle && album.date ? formatMonthYear(album.date) : undefined;
  const meta = [count, album.location, dateLabel].filter(Boolean) as string[];

  return (
    <Link
      href={album.href}
      className={cx('group block', className)}
      aria-label={`${album.title} — ${count}`}
    >
      <div className="relative">
        {cover ? (
          <MediaImage
            item={cover}
            ladder={ladder}
            sizes={sizes}
            ratio={ratio}
            priority={priority}
            alt={cover.alt ?? cover.caption ?? `${album.title}, ${album.year}`}
            imgClassName="transition-transform duration-[1100ms] ease-[var(--ease-out-expo)] group-hover:scale-[1.035] motion-reduce:transform-none"
          />
        ) : (
          <EmptyFrame ratio={ratio} label={`${album.title} — no cover yet`} />
        )}

        {typeof index === 'number' ? (
          <span className="u-label pointer-events-none absolute top-0 left-0 bg-ground/70 px-2.5 py-2 text-ivory/90 backdrop-blur-[2px]">
            {ordinalLabel(index)}
          </span>
        ) : null}

        {isFeature ? (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ground-deep/90 via-ground-deep/30 to-transparent"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 sm:p-7">
              <Heading className="u-display u-display-tight max-w-[16ch] text-3xl text-white">
                {album.title}
              </Heading>
              {album.subtitle ? (
                <p className="u-serif mt-2 text-xl text-ivory/85">{album.subtitle}</p>
              ) : null}
              {meta.length > 0 ? (
                <p className="u-label mt-4 text-ivory/70">{meta.join('  ·  ')}</p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {isFeature ? null : (
        <div className="mt-5">
          <Heading className="u-display max-w-[22ch] text-xl text-ivory transition-colors duration-300 group-hover:text-white">
            {album.title}
          </Heading>
          {album.subtitle ? (
            <p className="u-serif mt-1.5 text-lg text-muted">{album.subtitle}</p>
          ) : null}
          {meta.length > 0 ? (
            <p className="u-label mt-3.5 text-mute">{meta.join('  ·  ')}</p>
          ) : null}
          <span
            aria-hidden="true"
            className="mt-5 block h-px w-full origin-left scale-x-0 bg-ember-deep transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-x-100 motion-reduce:transform-none"
          />
        </div>
      )}
    </Link>
  );
}
