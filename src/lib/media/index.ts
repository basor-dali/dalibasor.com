import type { MediaItem } from '@/types/content';
import { createCloudinaryProvider } from './cloudinary';
import { createLocalProvider } from './local';
import { createR2Provider } from './r2';
import {
  SIZES,
  WIDTH_LADDERS,
  type ImageSource,
  type ImageTransform,
  type LadderFormat,
  type LadderName,
  type MediaProvider,
  type SizesPreset,
} from './provider';

export * from './provider';

/* ==========================================================================
   Provider selection
   ========================================================================== */

let cachedImage: MediaProvider | null = null;
let cachedVideo: MediaProvider | null = null;

function hasCloudinary(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME);
}

function hasR2(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL);
}

/**
 * The provider for photographs.
 *
 * Falls back to local rather than throwing: a fresh clone with no .env.local
 * should still run `npm run dev` and render every page, just unoptimised.
 */
export function mediaProvider(): MediaProvider {
  if (cachedImage) return cachedImage;

  const configured = process.env.NEXT_PUBLIC_MEDIA_PROVIDER?.toLowerCase();

  if (configured === 'r2' && hasR2()) cachedImage = createR2Provider();
  else if (configured === 'cloudinary' && hasCloudinary())
    cachedImage = createCloudinaryProvider();
  else cachedImage = createLocalProvider();

  return cachedImage;
}

/**
 * The provider for video.
 *
 * Split from images on purpose. Photographs are pre-generated and served as
 * static files from R2; video still wants an encoding service, because doing
 * it properly means transcoding ladders and adaptive streaming. So video stays
 * on Cloudinary while images move, and both are addressed through the same
 * interface. Set NEXT_PUBLIC_VIDEO_PROVIDER to override.
 */
export function videoProvider(): MediaProvider {
  if (cachedVideo) return cachedVideo;

  const configured = (
    process.env.NEXT_PUBLIC_VIDEO_PROVIDER ||
    process.env.NEXT_PUBLIC_MEDIA_PROVIDER ||
    ''
  ).toLowerCase();

  if (configured === 'cloudinary' && hasCloudinary())
    cachedVideo = createCloudinaryProvider();
  else if (configured === 'r2' && hasR2()) cachedVideo = createR2Provider();
  else if (hasCloudinary()) cachedVideo = createCloudinaryProvider();
  else cachedVideo = mediaProvider();

  return cachedVideo;
}

/** True when the active provider can serve more than one size. */
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
  /**
   * Per-format <source> entries, best first. Empty for providers that
   * negotiate format server-side, in which case a plain <img> is correct.
   */
  sources: ImageSource[];
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
  item: Pick<
    MediaItem,
    | 'publicId'
    | 'width'
    | 'height'
    | 'alt'
    | 'caption'
    | 'lqip'
    | 'color'
    | 'variants'
    | 'formats'
  >,
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

  // A provider serving pre-generated files can only offer what was actually
  // written at import, so the manifest's own list wins over the notional
  // ladder. Asking such a provider for an unbuilt width is a 404, not a resize.
  const generated = item.variants?.length ? item.variants : null;
  if (generated) {
    const usable = generated.filter((width) => width <= ceiling);
    widths = usable.length > 0 ? usable : [Math.min(...generated)];
  }

  const displayWidth = widths[widths.length - 1]!;
  const sizesValue = resolveSizes(options.sizes);
  const transform: ImageTransform = {
    width: displayWidth,
    fit,
    availableWidths: generated ?? undefined,
  };

  const formats = (item.formats?.length ? item.formats : []) as LadderFormat[];
  const sources =
    provider.imageSources && formats.length > 0
      ? provider.imageSources(item.publicId, widths, formats)
      : [];

  return {
    src: provider.imageUrl(item.publicId, transform),
    srcSet: provider.imageSrcSet(item.publicId, widths, { fit }),
    sizes: sizesValue,
    width: displayWidth,
    height: Math.round(displayWidth * (nativeHeight / nativeWidth)),
    alt: options.alt ?? item.alt ?? item.caption ?? '',
    aspectRatio: `${nativeWidth} / ${nativeHeight}`,
    lqip: item.lqip,
    color: item.color,
    sources,
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
  const provider = videoProvider();
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
