import type {
  ImageTransform,
  MediaProvider,
  VideoSource,
  VideoTransform,
} from './provider';

/**
 * Cloudinary delivery.
 *
 * URLs are built by hand rather than with the SDK: the SDK is ~90KB and this
 * is string concatenation. Nothing here needs an API key — delivery URLs are
 * public by design, and the cloud name already appears in every one of them.
 *
 * Note on privacy: Cloudinary strips EXIF from *derived* images by default,
 * and we never pass `fl_keep_iptc`. The importer additionally strips GPS and
 * device identifiers before anything is uploaded, so private metadata never
 * leaves the machine in the first place. See scripts/lib/strip-metadata.mjs.
 */

const BASE = 'https://res.cloudinary.com';

function cloudName(): string {
  const name = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!name) {
    throw new Error(
      'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME is not set. Either set it in .env.local or ' +
        'switch NEXT_PUBLIC_MEDIA_PROVIDER to "local".',
    );
  }
  return name;
}

/** Cloudinary public ids may contain slashes; each segment still needs encoding. */
function encodeId(publicId: string): string {
  return publicId
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function imageTransformString(t: ImageTransform): string {
  const parts: string[] = [];

  parts.push(`f_${t.format ?? 'auto'}`);
  parts.push(typeof t.quality === 'number' ? `q_${t.quality}` : 'q_auto');

  if (t.fit === 'fit') {
    // c_limit never upscales — a 900px original stays 900px in a 1600px slot.
    parts.push('c_limit');
  } else {
    parts.push('c_fill');
    // Content-aware cropping so a face is not sliced out of a portrait.
    parts.push('g_auto');
  }

  parts.push(`w_${Math.round(t.width)}`);
  if (t.height) parts.push(`h_${Math.round(t.height)}`);
  if (t.blur) parts.push(`e_blur:${t.blur}`);

  // Deliberately no `dpr_auto`: every image on this site is chosen by the
  // browser from a `w`-descriptor srcSet, which already accounts for device
  // pixel ratio. Adding dpr_auto on top would multiply the two and pull a
  // 3200px file into a 1600px slot on a retina screen.

  return parts.join(',');
}

export function createCloudinaryProvider(): MediaProvider {
  return {
    name: 'cloudinary',

    imageUrl(publicId, transform) {
      return `${BASE}/${cloudName()}/image/upload/${imageTransformString(transform)}/${encodeId(publicId)}`;
    },

    imageSrcSet(publicId, widths, transform = {}) {
      const cloud = cloudName();
      const id = encodeId(publicId);
      return widths
        .map((width) => {
          const t = imageTransformString({ ...transform, width });
          return `${BASE}/${cloud}/image/upload/${t}/${id} ${width}w`;
        })
        .join(', ');
    },

    videoSources(publicId, transform: VideoTransform = {}) {
      const cloud = cloudName();
      const id = encodeId(publicId);
      const quality =
        typeof transform.quality === 'number' ? `q_${transform.quality}` : 'q_auto';
      const width = transform.width ? `,w_${Math.round(transform.width)},c_limit` : '';

      const sources: VideoSource[] = [];

      // Adaptive bitrate first. `sp_auto` asks Cloudinary for a streaming
      // profile matched to the source, so a phone on cellular does not pull a
      // 1080p ladder. Safari and iOS play this natively; everywhere else falls
      // through to the progressive MP4 below.
      sources.push({
        src: `${BASE}/${cloud}/video/upload/sp_auto/${id}.m3u8`,
        type: 'application/x-mpegURL',
      });

      sources.push({
        src: `${BASE}/${cloud}/video/upload/vc_auto,${quality}${width}/${id}.mp4`,
        type: 'video/mp4',
      });

      return sources;
    },

    videoPosterUrl(publicId, transform) {
      // `so_auto` picks a representative frame rather than a black first frame.
      const t = imageTransformString({
        ...transform,
        format: transform.format ?? 'auto',
      });
      return `${BASE}/${cloudName()}/video/upload/so_auto,${t}/${encodeId(publicId)}.jpg`;
    },

    placeholderUrl(publicId) {
      return `${BASE}/${cloudName()}/image/upload/f_auto,q_10,c_limit,w_24,e_blur:400/${encodeId(publicId)}`;
    },
  };
}
