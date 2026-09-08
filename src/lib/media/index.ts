import type { MediaItem } from '@/types/content';
import { createCloudinaryProvider } from './cloudinary';
import { createLocalProvider } from './local';
import {
  SIZES,
  WIDTH_LADDERS,
  type ImageTransform,
  type LadderName,
  type MediaProvider,
  type SizesPreset,
} from './provider';

export * from './provider';

/* ==========================================================================
   Provider selection
   ========================================================================== */

let cached: MediaProvider | null = null;

export function mediaProvider(): MediaProvider {
  if (cached) return cached;

  const configured = process.env.NEXT_PUBLIC_MEDIA_PROVIDER?.toLowerCase();
  const hasCloudName = Boolean(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME);

  // Fall back to local rather than throwing at build time: a fresh clone with
  // no .env.local should still run `npm run dev` and render every page.
  const useCloudinary = configured === 'cloudinary' && hasCloudName;

  cached = useCloudinary ? createCloudinaryProvider() : createLocalProvider();
  return cached;
}

/** True when the active provider can generate resized derivatives. */
export function providerCanResize(): boolean {
  return mediaProvider().name !== 'local';
}

/* ==========================================================================
   The single call every image component makes
   ========================================================================== */

export type ResponsiveImage = {
  src: string;
  srcSet: string;
  sizes: string;
  width: number;
  height: number;
  alt: string;
  /** `--ar` custom property value, e.g. `3 / 2`. */
  aspectRatio: string;
  /** Inline base64 placeholder, if the manifest has one. */
  lqip?: string;
  /** Flat colour to paint before anything loads. */
  color?: string;
};

export type ResponsiveImageOptions = {
  ladder?: LadderName;
  sizes?: SizesPreset | (string & {});
  fit?: ImageTransform['fit'];
  /** Override the alt text derived from the item. */
  alt?: string;
  /** Cap the widths requested — useful for small fixed slots. */
  maxWidth?: number;
};

/**
 * Accepts either a named preset (`'third'`) or a raw `sizes` string. Anything
 * unrecognised is passed through verbatim so one-off layouts stay possible.
 */
function resolveSizes(value: ResponsiveImageOptions['sizes']): string {
  if (!value) return SIZES.full;
  if (Object.prototype.hasOwnProperty.call(SIZES, value)) {
    return SIZES[value as SizesPreset];
  }
  return value;
}

/**
 * Turn a manifest entry into everything an <img> needs.
 *
 * The width ladder is trimmed to the source's own width so we never ask the
 * CDN to upscale, and never generate variants nobody can use.
 */
export function responsiveImage(
  item: Pick<MediaItem, 'publicId' | 'width' | 'height' | 'alt' | 'caption' | 'lqip' | 'color'>,
  options: ResponsiveImageOptions = {},
): ResponsiveImage {
  const provider = mediaProvider();
  const ladderName = options.ladder ?? 'grid';
  const fit = options.fit ?? 'fill';

  const nativeWidth = item.width || 2000;
  const nativeHeight = item.height || Math.round(nativeWidth * (2 / 3));
  const ceiling = Math.min(options.maxWidth ?? Infinity, nativeWidth);

  const ladder: number[] = [...WIDTH_LADDERS[ladderName]];
  let widths = ladder.filter((w) => w <= ceiling);
  if (widths.length === 0) widths = [Math.min(ladder[0]!, Math.round(ceiling))];
  // Always offer the native width if it sits between ladder rungs, so the
  // largest sensible variant is reachable without upscaling.
  const largest = widths[widths.length - 1]!;
  if (ceiling < ladder[ladder.length - 1]! && ceiling > largest * 1.15) {
    widths = [...widths, Math.round(ceiling)];
  }

  const displayWidth = widths[widths.length - 1]!;

  const sizesValue = resolveSizes(options.sizes);

  return {
    src: provider.imageUrl(item.publicId, { width: displayWidth, fit }),
    srcSet: provider.imageSrcSet(item.publicId, widths, { fit }),
    sizes: sizesValue,
    width: displayWidth,
    height: Math.round(displayWidth * (nativeHeight / nativeWidth)),
    alt: options.alt ?? item.alt ?? item.caption ?? '',
    aspectRatio: `${nativeWidth} / ${nativeHeight}`,
    lqip: item.lqip,
    color: item.color,
  };
}

/* ==========================================================================
   Video
   ========================================================================== */

export type ResponsiveVideo = {
  sources: { src: string; type: string }[];
  poster: string;
  width: number;
  height: number;
  aspectRatio: string;
  lqip?: string;
  color?: string;
  duration?: number;
};

export function responsiveVideo(
  item: Pick<
    MediaItem,
    'publicId' | 'width' | 'height' | 'poster' | 'lqip' | 'color' | 'duration'
  >,
  options: { posterWidth?: number } = {},
): ResponsiveVideo {
  const provider = mediaProvider();
  const nativeWidth = item.width || 1920;
  const nativeHeight = item.height || 1080;
  const posterWidth = Math.min(options.posterWidth ?? 1200, nativeWidth);

  const poster = item.poster
    ? provider.imageUrl(item.poster, { width: posterWidth, fit: 'fill' })
    : provider.videoPosterUrl(item.publicId, { width: posterWidth, fit: 'fill' });

  return {
    sources: provider.videoSources(item.publicId, { width: Math.min(1920, nativeWidth) }),
    poster,
    width: nativeWidth,
    height: nativeHeight,
    aspectRatio: `${nativeWidth} / ${nativeHeight}`,
    lqip: item.lqip,
    color: item.color,
    duration: item.duration,
  };
}

/* ==========================================================================
   Small helpers used across media UI
   ========================================================================== */

export function formatDuration(seconds?: number): string | undefined {
  if (!seconds || !Number.isFinite(seconds)) return undefined;
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Alt text that degrades gracefully rather than being empty on every photo. */
export function mediaAlt(item: MediaItem): string {
  if (item.alt) return item.alt;
  if (item.caption) return item.caption;
  const where = item.location ? ` in ${item.location}` : '';
  const kind = item.type === 'video' ? 'Video' : 'Photograph';
  return `${kind} from ${item.year}${where}`;
}
