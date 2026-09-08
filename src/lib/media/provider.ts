/**
 * The media provider contract.
 *
 * Nothing in the UI knows what a Cloudinary URL looks like. Components ask for
 * "this image at these widths" and get back a `src` + `srcSet`. Swapping the
 * CDN in five years means writing one new file in this folder.
 */

export type ImageFit =
  /** Crop to fill the exact box. Used for covers and grid thumbnails. */
  | 'fill'
  /** Fit inside the box, never upscale. Used for the lightbox and photo essays. */
  | 'fit';

export type ImageTransform = {
  width: number;
  height?: number;
  fit?: ImageFit;
  /** 1–100, or 'auto' to let the CDN decide. Defaults to 'auto'. */
  quality?: number | 'auto';
  /** Gaussian blur radius — only used for placeholder generation. */
  blur?: number;
  /** Force a format instead of negotiating AVIF/WebP. Rarely needed. */
  format?: 'auto' | 'jpg' | 'png' | 'webp' | 'avif';
  /**
   * Widths that actually exist for this asset.
   *
   * Providers that transform on demand ignore this. Providers that serve
   * pre-generated files need it, because asking for a width nobody built is a
   * 404 rather than a resize.
   */
  availableWidths?: number[];
};

/** One <source> in a <picture>: a format and the srcSet for it. */
export type ImageSource = {
  type: string;
  srcSet: string;
};

/** Formats a pre-generated provider can offer, best first. */
export type LadderFormat = 'avif' | 'webp';

export type VideoTransform = {
  width?: number;
  quality?: number | 'auto';
};

export type VideoSource = {
  src: string;
  type: string;
};

export interface MediaProvider {
  readonly name: string;

  /** A single image URL at one width. */
  imageUrl(publicId: string, transform: ImageTransform): string;

  /**
   * A `srcSet` string across the given widths. The browser picks; we never
   * ship a 6000px original into a 400px slot.
   */
  imageSrcSet(publicId: string, widths: number[], transform?: Partial<ImageTransform>): string;

  /**
   * Per-format <source> entries for a <picture>, best first.
   *
   * Optional: a provider that negotiates format server-side (Cloudinary's
   * `f_auto`) has nothing to offer here and omits it, and the component falls
   * back to a plain <img> with one srcSet.
   */
  imageSources?(publicId: string, widths: number[], formats: LadderFormat[]): ImageSource[];

  /** Playable video sources, best first. Adaptive streaming when available. */
  videoSources(publicId: string, transform?: VideoTransform): VideoSource[];

  /** Poster frame for a video. */
  videoPosterUrl(publicId: string, transform: ImageTransform): string;

  /**
   * Tiny blurred placeholder URL. Only used when a manifest entry has no
   * inline `lqip` — normally the importer bakes one in and this is unused.
   */
  placeholderUrl(publicId: string): string;

  /** Link to the highest-quality deliverable version, for "open original". */
  originalUrl(publicId: string, kind: 'image' | 'video'): string;
}

/* ==========================================================================
   Responsive width ladders
   ==========================================================================
   Deliberately coarse. More breakpoints means more cache misses at the CDN
   and more variants to pay for; these cover phone → 5K without waste. */

export const WIDTH_LADDERS = {
  /** Small grid thumbnails — contact sheets, album covers in a 4-up row. */
  thumb: [240, 360, 480, 640, 800],
  /** Standard grid cells and album covers. */
  grid: [400, 600, 800, 1000, 1280, 1600],
  /** Large editorial images: hero halves, project features, photo essays. */
  feature: [640, 900, 1200, 1600, 2000, 2560],
  /** Full-bleed heroes and year openers. */
  bleed: [800, 1200, 1600, 2000, 2560, 3200],
  /** The lightbox. Capped at 3200 — beyond that nobody can see the difference. */
  lightbox: [800, 1200, 1600, 2000, 2560, 3200],
} as const;

export type LadderName = keyof typeof WIDTH_LADDERS;

/**
 * `sizes` presets. These must match the layouts in the components that use
 * them — a wrong `sizes` is the single most common way to accidentally
 * download a 2500px image into a 300px box.
 */
export const SIZES = {
  /** Full viewport width. */
  full: '100vw',
  /** Half on desktop, full on mobile. */
  half: '(min-width: 64rem) 50vw, 100vw',
  /** Two-thirds on desktop. */
  twoThirds: '(min-width: 64rem) 66vw, 100vw',
  /** One third on desktop, half on tablet, full on mobile. */
  third: '(min-width: 64rem) 33vw, (min-width: 48rem) 50vw, 100vw',
  /** Quarter on wide desktop, third on desktop, half on mobile. */
  quarter: '(min-width: 90rem) 25vw, (min-width: 64rem) 33vw, 50vw',
  /** Constrained to the reading measure. */
  measure: '(min-width: 46rem) 42rem, 100vw',
  /** Constrained to the wide container. */
  wide: '(min-width: 96rem) 90rem, 100vw',
  /** The lightbox: the photograph owns the screen. */
  lightbox: '100vw',
} as const;

export type SizesPreset = keyof typeof SIZES;
