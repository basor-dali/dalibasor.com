import Link from 'next/link';
import type { LadderName, SizesPreset } from '@/lib/media';
import type { MediaItem, ResolvedAlbum } from '@/types/content';
import { cx, formatMonthYear, ordinalLabel, pluralize } from '@/lib/utils';
import { EmptyFrame } from './EmptyFrame';
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
  const dateLabel =
    !album.subtitle && album.date ? formatMonthYear(album.date) : undefined;
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
          <EmptyFrame ratio={ratio} label="Cover pending" />
        )}

        {typeof index === 'number' ? (
          <span className="u-label bg-ground/70 text-ivory/90 pointer-events-none absolute top-0 left-0 px-2.5 py-2 backdrop-blur-[2px]">
            {ordinalLabel(index)}
          </span>
        ) : null}

        {isFeature ? (
          <>
            <span
              aria-hidden="true"
              className="from-ground-deep/90 via-ground-deep/30 pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t to-transparent"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 sm:p-7">
              <Heading className="u-display u-display-tight max-w-[16ch] text-3xl text-white">
                {album.title}
              </Heading>
              {album.subtitle ? (
                <p className="u-serif text-ivory/85 mt-2 text-xl">{album.subtitle}</p>
              ) : null}
              {meta.length > 0 ? (
                <p className="u-label text-ivory/70 mt-4">{meta.join('  ·  ')}</p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {isFeature ? null : (
        <div className="mt-5">
          <Heading className="u-display text-ivory max-w-[22ch] text-xl transition-colors duration-300 group-hover:text-white">
            {album.title}
          </Heading>
          {album.subtitle ? (
            <p className="u-serif text-muted mt-1.5 text-lg">{album.subtitle}</p>
          ) : null}
          {meta.length > 0 ? (
            <p className="u-label text-muted mt-3.5">{meta.join('  ·  ')}</p>
          ) : null}
          <span
            aria-hidden="true"
            className="bg-ember-deep mt-5 block h-px w-full origin-left scale-x-0 transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-x-100 motion-reduce:transform-none"
          />
        </div>
      )}
    </Link>
  );
}
