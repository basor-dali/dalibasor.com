import type { ImageTransform, MediaProvider, VideoSource } from './provider';

/**
 * Local delivery.
 *
 * Serves files straight out of /public/media with no transformation. This is
 * the development fallback and the escape hatch: if the CDN account ever goes
 * away, dropping the originals into /public/media keeps every page rendering.
 *
 * It is deliberately dumb — no resizing, no format negotiation. Do not ship a
 * photo-heavy year to production on this provider.
 */

const ROOT = '/media';

function toPath(publicId: string): string {
  const clean = publicId.replace(/^\/+/, '');
  return `${ROOT}/${clean.split('/').map(encodeURIComponent).join('/')}`;
}

/** Local files keep their extension in the public id; add one if missing. */
function withExtension(publicId: string, fallback: string): string {
  return /\.[a-z0-9]{2,5}$/i.test(publicId) ? toPath(publicId) : `${toPath(publicId)}.${fallback}`;
}

export function createLocalProvider(): MediaProvider {
  return {
    name: 'local',

    imageUrl(publicId, _transform: ImageTransform) {
      return withExtension(publicId, 'jpg');
    },

    imageSrcSet(publicId) {
      // No derivatives exist, so a srcSet would be a lie. Returning an empty
      // string makes the <img> fall back to `src` alone.
      void publicId;
      return '';
    },

    videoSources(publicId): VideoSource[] {
      return [{ src: withExtension(publicId, 'mp4'), type: 'video/mp4' }];
    },

    videoPosterUrl(publicId) {
      return withExtension(`${publicId}-poster`, 'jpg');
    },

    placeholderUrl(publicId) {
      return withExtension(publicId, 'jpg');
    },

    originalUrl(publicId, kind) {
      return withExtension(publicId, kind === 'video' ? 'mp4' : 'jpg');
    },
  };
}
