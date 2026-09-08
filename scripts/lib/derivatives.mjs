/**
 * Derivative generation.
 *
 * Cloudinary's whole value is transforming an image on demand. This archive is
 * immutable — a photograph from 2019 will never need re-cropping — so every
 * size is generated once, here, at import, and delivered as a static file.
 * That is cheaper, faster (no transform-on-first-request penalty) and leaves
 * the archive as plain objects in a bucket rather than a proprietary URL
 * format.
 *
 * Measured on photographic data, per image, across the whole ladder:
 *
 *   avif  ~1.5 MB   3.7s     ← 30% smaller than webp, and faster than mozjpeg
 *   webp  ~2.2 MB   2.9s
 *   jpeg  ~2.1 MB   3.8s     ← only one width is generated, as a fallback
 *
 * So AVIF and WebP both get the full ladder and JPEG gets a single width,
 * purely so <img src> resolves on anything that somehow supports neither.
 */

import sharp from 'sharp';

/**
 * The widths every image is generated at, subject to never upscaling.
 *
 * Six rungs is enough for a browser to pick well from a `sizes` hint while
 * keeping the object count per photograph reasonable. These are recorded per
 * item in the manifest, so changing this list later does not orphan or break
 * anything already imported.
 */
export const LADDER = [320, 640, 1024, 1600, 2048, 2560];

/** The width of the single JPEG written as the universal <img src>. */
export const FALLBACK_WIDTH = 1024;

/** Formats that get the full ladder, best first. */
export const LADDER_FORMATS = ['avif', 'webp'];

export const EXTENSION = {
  avif: 'avif',
  webp: 'webp',
  jpeg: 'jpg',
};

export const CONTENT_TYPE = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
};

/**
 * Quality settings.
 *
 * Tuned for photographs viewed full-screen, not for thumbnails: this is an
 * archive, and the derivative is what anyone will actually ever look at. AVIF
 * at 55 is roughly visually transparent for photographic content; effort 3
 * keeps a large import to minutes rather than hours.
 */
const ENCODERS = {
  avif: (pipeline) => pipeline.avif({ quality: 55, effort: 3, chromaSubsampling: '4:2:0' }),
  webp: (pipeline) => pipeline.webp({ quality: 78, effort: 4, smartSubsample: true }),
  jpeg: (pipeline) => pipeline.jpeg({ quality: 82, mozjpeg: true, progressive: true }),
};

/**
 * The widths actually generated for a source of `nativeWidth`.
 *
 * Never upscales. If the source is smaller than the first rung it still gets
 * exactly one derivative at its own size, so every image has something to
 * serve rather than falling through to the original.
 */
export function widthsFor(nativeWidth) {
  const usable = LADDER.filter((width) => width <= nativeWidth);
  if (usable.length === 0) return [nativeWidth];
  // Offer the native width too when it sits well above the top rung reached,
  // so a 3000px source is not capped at 2560 for no reason.
  const largest = usable[usable.length - 1];
  if (nativeWidth > largest * 1.15 && nativeWidth < LADDER[LADDER.length - 1]) {
    return [...usable, nativeWidth];
  }
  return usable;
}

/**
 * Object key for one derivative.
 *
 * `<base>/<width>.<ext>` — a folder per photograph, so deleting one asset is a
 * single prefix delete and the layout is legible in a bucket browser.
 */
export function derivativeKey(base, width, format) {
  return `${base}/${width}.${EXTENSION[format]}`;
}

export function originalKey(base, extension) {
  return `${base}/original${extension.startsWith('.') ? extension : `.${extension}`}`;
}

/**
 * Extensions to try when looking for a stored original, best first.
 *
 * The importer re-encodes anything it cannot strip losslessly — a HEIC goes up
 * as `original.jpg` — so the source filename is NOT a reliable guide to what
 * was written. That mismatch is why `media:backup --verify` once reported every
 * HEIC photograph in the archive as lost.
 *
 * `originalExt` records what the importer actually wrote and is the answer for
 * anything imported since. The rest of the list exists for entries written
 * before that field, and for anything hand-edited: probing two or three URLs is
 * cheaper than being wrong about whether a photograph still exists.
 */
export function originalExtensionCandidates(item = {}) {
  const seen = new Set();
  const out = [];
  const add = (ext) => {
    if (!ext) return;
    const normalised = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    if (seen.has(normalised)) return;
    seen.add(normalised);
    out.push(normalised);
  };

  add(item.originalExt);
  // Everything the strip step can emit.
  add('.jpg');
  add('.png');
  add('.webp');
  add('.avif');
  // And the source extension, for a file that went up untouched.
  const name = item.originalFilename;
  if (name) {
    const match = /\.[^.]+$/.exec(name);
    if (match) add(match[0]);
  }
  return out;
}

/**
 * Generate every derivative for one prepared image buffer.
 *
 * Takes the buffer that has already had its metadata stripped, so nothing
 * private can survive into a derivative. Returns descriptors ready to upload;
 * this function performs no I/O of its own.
 */
export async function generateDerivatives(buffer, { nativeWidth, formats = LADDER_FORMATS }) {
  const widths = widthsFor(nativeWidth);
  const outputs = [];

  // Decode once, reuse for every resize. Re-decoding the source for each of
  // fourteen outputs is the difference between seconds and minutes.
  const source = sharp(buffer, { failOn: 'none', limitInputPixels: false });

  for (const format of formats) {
    for (const width of widths) {
      const encoded = await ENCODERS[format](
        source.clone().resize(width, null, { withoutEnlargement: true, fit: 'inside' }),
      ).toBuffer();

      outputs.push({
        width,
        format,
        contentType: CONTENT_TYPE[format],
        extension: EXTENSION[format],
        buffer: encoded,
      });
    }
  }

  // One JPEG so <img src> resolves even without AVIF or WebP support.
  const fallbackWidth = Math.min(FALLBACK_WIDTH, nativeWidth);
  const fallback = await ENCODERS.jpeg(
    source.clone().resize(fallbackWidth, null, { withoutEnlargement: true, fit: 'inside' }),
  ).toBuffer();

  outputs.push({
    width: fallbackWidth,
    format: 'jpeg',
    contentType: CONTENT_TYPE.jpeg,
    extension: EXTENSION.jpeg,
    buffer: fallback,
    isFallback: true,
  });

  return {
    widths,
    formats,
    fallbackWidth,
    outputs,
    totalBytes: outputs.reduce((sum, output) => sum + output.buffer.length, 0),
  };
}
