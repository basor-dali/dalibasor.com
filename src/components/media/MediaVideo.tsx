'use client';

import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { MediaItem } from '@/types/content';
import { formatDuration, responsiveVideo } from '@/lib/media';
import { cx } from '@/lib/utils';

/**
 * Video, loaded only when someone actually wants to watch it.
 *
 * Until the play button is pressed this is a poster image and nothing else —
 * no <video> element, no metadata request, no bytes. That matters on a year
 * page with six clips on it: six videos preloading metadata is six extra
 * round-trips and, on Safari, six decoders spun up for nothing.
 *
 * Sources are ordered HLS first, then MP4. Safari and iOS take the adaptive
 * stream natively; every other browser cannot play `application/x-mpegURL`
 * and falls through to the progressive MP4 on its own. No hls.js, no 40KB
 * shim for a personal archive.
 *
 * Never autoplays with sound. Never autoplays at all.
 */

export type MediaVideoProps = {
  item: MediaItem;
  className?: string;
  /** Fill the frame instead of preserving the video's own proportions. */
  cover?: boolean;
  ratio?: string;
  /** Start playing as soon as it is mounted — used by the lightbox. */
  playOnMount?: boolean;
  posterWidth?: number;
};

export function MediaVideo({
  item,
  className,
  cover = true,
  ratio,
  playOnMount = false,
  posterWidth,
}: MediaVideoProps) {
  const [active, setActive] = useState(playOnMount);
  const videoRef = useRef<HTMLVideoElement>(null);

  const video = responsiveVideo(item, { posterWidth });
  const duration = formatDuration(video.duration);
  const label = item.caption ? `Play video: ${item.caption}` : 'Play video';

  const style: CSSProperties = {
    ['--ar' as string]: ratio ?? video.aspectRatio,
    backgroundColor: video.color ?? undefined,
    backgroundImage: video.lqip ? `url(${video.lqip})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };

  if (!active) {
    return (
      <div className={cx('u-frame group', className)} style={style}>
        <img
          src={video.poster}
          alt=""
          width={video.width}
          height={video.height}
          loading="lazy"
          decoding="async"
          className="media-img"
        />
        <button
          type="button"
          onClick={() => setActive(true)}
          aria-label={label}
          className="absolute inset-0 z-10 flex items-center justify-center transition-colors duration-500 hover:bg-black/20"
        >
          <span className="border-ivory/50 bg-ground/40 group-hover:border-ivory group-hover:bg-ground/60 flex h-16 w-16 items-center justify-center border backdrop-blur-[2px] transition-all duration-500 sm:h-20 sm:w-20">
            <PlayGlyph />
          </span>
        </button>
        {duration ? (
          <span className="u-label bg-ground/70 text-ivory absolute right-3 bottom-3 z-10 px-2 py-1 backdrop-blur-[2px]">
            {duration}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cx('u-frame', className)} style={style}>
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        preload="auto"
        poster={video.poster}
        className={cover ? 'object-cover' : 'object-contain'}
        aria-label={item.caption ?? `Video from ${item.year}`}
      >
        {video.sources.map((source) => (
          <source key={source.src} src={source.src} type={source.type} />
        ))}
        <p className="u-label text-muted p-4">
          Your browser cannot play this video.{' '}
          <a
            href={video.sources[video.sources.length - 1]?.src}
            className="u-link text-ivory"
          >
            Download it instead
          </a>
          .
        </p>
      </video>
    </div>
  );
}

function PlayGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      fill="currentColor"
      className="text-ivory translate-x-[2px]"
    >
      <path d="M5 3.5 20 12 5 20.5z" />
    </svg>
  );
}
