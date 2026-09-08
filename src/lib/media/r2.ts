import type {
  ImageSource,
  ImageTransform,
  MediaProvider,
  VideoSource,
} from './provider';

/**
 * R2 delivery.
 *
 * There is no transformation service here and that is the point: every width
 * and format was generated once, at import, and this provider does nothing but
 * work out the URL of a file that already exists. No signing, no API, no
 * account — just static objects behind a CDN.
 *
 * Layout, one folder per photograph:
 *
 *   dalibasor/2026/serbia/img-0042/320.avif
 *   dalibasor/2026/serbia/img-0042/320.webp
 *   ...
 *   dalibasor/2026/serbia/img-0042/1024.jpg      the <img src> fallback
 *   dalibasor/2026/serbia/img-0042/original.jpg
 *
 * Which widths exist is recorded per item in the manifest rather than inferred,
 * so changing the ladder later cannot silently break anything already imported.
 */

const FALLBACK_EXTENSION = 'jpg';

/**
 * The width of the single JPEG the importer writes per photograph.
 *
 * Must match FALLBACK_WIDTH in scripts/lib/derivatives.mjs. Only one JPEG is
 * generated — it exists solely so <img src> resolves on a browser that supports
 * neither AVIF nor WebP — so every other width is AVIF/WebP only, and pointing
 * the fallback at any other width is a 404.
 */
const FALLBACK_WIDTH = 1024;

/** The JPEG that actually exists: 1024, or the whole image if it is smaller. */
function fallbackWidthFor(available: number[]): number {
  if (available.length === 0) return FALLBACK_WIDTH;
  return Math.min(FALLBACK_WIDTH, Math.max(...available));
}

function base(): string {
  const url = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_R2_PUBLIC_BASE_URL is not set. Point it at the bucket’s public URL ' +
        'or custom domain, or switch NEXT_PUBLIC_MEDIA_PROVIDER to "local".',
    );
  }
  return url.replace(/\/+$/, '');
}

function encodeKey(key: string): string {
  return key
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function createR2Provider(): MediaProvider {
  return {
    name: 'r2',

    /**
     * The <img src>, which is the JPEG fallback and nothing else.
     *
     * Deliberately ignores the requested width: only one JPEG exists per
     * photograph, and asking for any other size resolves to a file that was
     * never written.
     */
    imageUrl(publicId, transform: ImageTransform) {
      const width = fallbackWidthFor(transform.availableWidths ?? []);
      return `${base()}/${encodeKey(publicId)}/${width}.${FALLBACK_EXTENSION}`;
    },

    /**
     * Empty on purpose.
     *
     * The responsive candidates live on the <source> elements, one per format.
     * A JPEG srcSet across the full ladder would be a list of 404s, so the
     * <img> is left with only its single real `src`.
     */
    imageSrcSet() {
      return '';
    },

    /**
     * One <source> per format, best first. This is what makes the <picture>
     * element do the format negotiation that Cloudinary's `f_auto` would
     * otherwise do on the server — except here it costs nothing and cannot
     * mis-detect a browser.
     */
    imageSources(publicId, widths, formats): ImageSource[] {
      const root = `${base()}/${encodeKey(publicId)}`;
      return formats.map((format) => ({
        type: format === 'avif' ? 'image/avif' : 'image/webp',
        srcSet: widths.map((width) => `${root}/${width}.${format} ${width}w`).join(', '),
      }));
    },

    videoSources(publicId): VideoSource[] {
      // Video still lives on Cloudinary; see videoProvider() in ./index.ts.
      // If a video ever does land in R2 it is a plain progressive MP4.
      return [{ src: `${base()}/${encodeKey(publicId)}/original.mp4`, type: 'video/mp4' }];
    },

    videoPosterUrl(publicId, transform) {
      const width = fallbackWidthFor(transform.availableWidths ?? []);
      return `${base()}/${encodeKey(publicId)}/${width}.${FALLBACK_EXTENSION}`;
    },

    placeholderUrl(publicId) {
      // The smallest file that actually exists. There is no 320px JPEG — the
      // single fallback JPEG is 1024 — so this asks for WebP, which every
      // browser that can run this code supports.
      return `${base()}/${encodeKey(publicId)}/320.webp`;
    },

    originalUrl(publicId, kind) {
      const extension = kind === 'video' ? 'mp4' : 'jpg';
      return `${base()}/${encodeKey(publicId)}/original.${extension}`;
    },
  };
}
