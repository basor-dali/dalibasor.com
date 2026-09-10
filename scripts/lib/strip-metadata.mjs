/**
 * Metadata stripping — the privacy layer of the import pipeline.
 *
 * A photograph off a phone carries GPS coordinates accurate to a few metres,
 * the device's serial number, the owner's name in some IPTC fields, and often
 * the full filesystem path of whatever edited it last. None of that is going
 * on a public website. This module removes it *before* anything is uploaded,
 * so the private data never leaves the machine — rather than relying on a CDN
 * to hide it after the fact.
 *
 * =========================================================================
 * THE HARD RULE
 * =========================================================================
 * THE USER'S ORIGINAL FILE IS NEVER MODIFIED, MOVED, RENAMED OR DELETED.
 *
 * Every function here takes a Buffer that was read from disk and returns a
 * NEW Buffer. Nothing in this file opens a file for writing, and nothing in
 * this file calls unlink, rename, truncate or utimes. The originals on disk
 * are read-only input, always. If you ever add a write path to this module,
 * you have broken the promise the whole archive is built on.
 * =========================================================================
 *
 * Two strategies, picked per file:
 *
 *   1. LOSSLESS — for a JPEG whose EXIF orientation is already upright (1, or
 *      absent). The JPEG marker structure is rewritten by hand, dropping the
 *      metadata segments and copying the compressed scan data through
 *      untouched. No decode, no re-encode, not one pixel changes, and a 6MB
 *      photo stays a 6MB photo minus its metadata. This is the path almost
 *      every file takes.
 *
 *   2. RE-ENCODE — for anything else: a rotated JPEG (the orientation tag is
 *      about to be deleted, so the rotation has to be baked into the pixels
 *      first, or the photo uploads sideways), HEIC from an iPhone, PNG, TIFF.
 *      sharp decodes, applies the orientation, and writes a new file with no
 *      metadata attached. Quality is set high enough that this is invisible.
 */

import sharp from 'sharp';

/* ==========================================================================
   JPEG marker surgery
   ========================================================================== */

/*
 * A JPEG is a stream of segments. Each begins with 0xFF, then a marker byte,
 * then — for most markers — a big-endian 16-bit length that includes its own
 * two bytes. Four markers stand alone with no length at all: TEM, the eight
 * restart markers, SOI and EOI. The scan itself (everything after SOS) is
 * entropy-coded and is copied through verbatim.
 *
 * Rewriting at this level means the image data is bit-identical to the
 * original. The only thing that changed is which metadata segments survived.
 */

const MARKER = {
  SOI: 0xd8,
  EOI: 0xd9,
  SOS: 0xda,
  TEM: 0x01,
  APP0: 0xe0,
  APP1: 0xe1,
  APP2: 0xe2,
  APP13: 0xed,
  APP14: 0xee,
  COM: 0xfe,
};

/** What a dropped segment is called in the console summary. */
function segmentName(marker, payload) {
  const head = payload.subarray(0, 24).toString('latin1');
  switch (marker) {
    case MARKER.APP1:
      if (head.startsWith('Exif'))
        return 'EXIF (APP1) — capture data, GPS, device serial';
      if (head.startsWith('http://ns.adobe.com/xap'))
        return 'XMP (APP1) — editing history';
      return 'APP1';
    case MARKER.APP2:
      if (head.startsWith('MPF')) return 'MPF (APP2) — multi-picture index';
      return 'APP2';
    case MARKER.APP13:
      return 'IPTC/Photoshop (APP13) — captions, creator, credit';
    case MARKER.COM:
      return 'JPEG comment — software names and file paths';
    default:
      return `APP${marker - 0xe0}`;
  }
}

/**
 * Which segments go.
 *
 * Dropped: APP1 (EXIF and XMP — this is where GPS and serial numbers live),
 * APP2 other than ICC, APP3..APP13 (Kodak Meta, Ducky, Photoshop IRB/IPTC),
 * APP15, and JPEG comments.
 *
 * Kept, deliberately:
 *   - APP0 (JFIF). Pixel density only; some decoders expect it.
 *   - APP2 when it is an ICC colour profile. A profile describes a colour
 *     space — "Display P3", "sRGB" — and contains no personal data. Throwing
 *     it away would make a wide-gamut photograph render flat and desaturated
 *     once the CDN treats it as sRGB. Privacy costs nothing here; colour does.
 *   - APP14 (Adobe). Declares the colour transform. Dropping it turns some
 *     CMYK and YCCK JPEGs into garbage.
 */
function shouldDropSegment(marker, payload, keepIcc) {
  if (marker === MARKER.APP0 || marker === MARKER.APP14) return false;
  if (marker === MARKER.APP2) {
    const isIcc = payload.subarray(0, 12).toString('latin1') === 'ICC_PROFILE\u0000';
    return !(isIcc && keepIcc);
  }
  if (marker === MARKER.COM) return true;
  // Every remaining APPn: APP1 and APP3 through APP15.
  return marker >= 0xe1 && marker <= 0xef;
}

/**
 * Walk entropy-coded scan data and return where the next real marker starts.
 *
 * Inside a scan, a literal 0xFF byte is stuffed as `FF 00`, and the restart
 * markers `FF D0`..`FF D7` punctuate the data without ending it. Everything
 * else introduced by 0xFF is a genuine marker and ends the scan. Runs of 0xFF
 * are legal fill and belong to whatever follows them, so the returned index
 * points at the first byte of the run.
 *
 * Returns null if the data runs out before a marker is found, which means the
 * file is truncated — the caller then declines the lossless path rather than
 * hand-rolling a repair.
 */
function endOfEntropyCodedData(buffer, from) {
  let i = from;

  while (i < buffer.length) {
    if (buffer[i] !== 0xff) {
      i += 1;
      continue;
    }

    let run = i;
    while (run < buffer.length && buffer[run] === 0xff) run += 1;
    if (run >= buffer.length) return null; // trailing fill, no marker

    const next = buffer[run];
    // Stuffed 0xFF, or a restart marker: still inside the scan.
    if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
      i = run + 1;
      continue;
    }

    return i;
  }

  return null;
}

/**
 * Rewrite a JPEG without its metadata segments. Pixels are untouched.
 *
 * Returns `null` — never throws, never guesses — if the buffer is not a JPEG
 * or if the marker structure does not parse cleanly. The caller falls back to
 * the re-encode path, which is slower but handles anything sharp can decode.
 */
export function stripJpegSegments(buffer, { keepIcc = true } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer[0] !== 0xff || buffer[1] !== MARKER.SOI) return null;

  const chunks = [buffer.subarray(0, 2)];
  const removed = [];
  let offset = 2;
  let sawEndOfImage = false;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) return null; // Out of step with the stream.

    // Any number of 0xFF fill bytes may precede a marker. Keep them: they are
    // part of the stream, and copying them keeps byte offsets honest.
    let markerAt = offset;
    while (markerAt < buffer.length && buffer[markerAt] === 0xff) markerAt += 1;
    if (markerAt >= buffer.length) return null;

    const marker = buffer[markerAt];

    // Standalone markers, no length field.
    if (
      marker === MARKER.TEM ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      marker === MARKER.SOI
    ) {
      chunks.push(buffer.subarray(offset, markerAt + 1));
      offset = markerAt + 1;
      continue;
    }

    /* End of image. Everything past here is dropped.
       --------------------------------------------------------------------
       This used to copy the remainder of the buffer through, on the reasoning
       that a trailer appended by a camera was not ours to judge. That is the
       right instinct for the original on disk and the wrong one for the copy
       being published, because the most common trailer in the world is a
       Motion Photo: Samsung and Pixel phones append a complete MP4 after EOI,
       and that MP4 has its own metadata container, which can carry the
       location this module exists to remove. A file can therefore lose its
       EXIF, report every segment stripped, and still ship coordinates.

       The original keeps its trailer, untouched, forever. The delivery copy
       is the image and nothing else. */
    if (marker === MARKER.EOI) {
      chunks.push(buffer.subarray(offset, markerAt + 1));
      const trailing = buffer.length - (markerAt + 1);
      if (trailing > 0) {
        removed.push({
          marker: MARKER.EOI,
          name: 'trailer after end-of-image — appended video, extra frames, device data',
          bytes: trailing,
        });
      }
      offset = buffer.length;
      sawEndOfImage = true;
      break;
    }

    /* Start of a scan. The header is a normal segment; what follows it is
       entropy-coded data with no segment structure, so it is copied verbatim
       up to the next real marker.

       Walking it rather than stopping here is what lets the loop reach EOI —
       and it is also what makes progressive JPEGs parse, since those carry
       several scans with tables between them. */
    if (marker === MARKER.SOS) {
      if (markerAt + 3 > buffer.length) return null;
      const headerLength = buffer.readUInt16BE(markerAt + 1);
      if (headerLength < 2) return null;
      const scanStart = markerAt + 1 + headerLength;
      if (scanStart > buffer.length) return null;

      const scanEnd = endOfEntropyCodedData(buffer, scanStart);
      if (scanEnd === null) return null;

      chunks.push(buffer.subarray(offset, scanEnd));
      offset = scanEnd;
      continue;
    }

    if (markerAt + 3 > buffer.length) return null;
    const length = buffer.readUInt16BE(markerAt + 1);
    if (length < 2) return null;

    const segmentEnd = markerAt + 1 + length;
    if (segmentEnd > buffer.length) return null;

    const payload = buffer.subarray(markerAt + 3, segmentEnd);

    if (shouldDropSegment(marker, payload, keepIcc)) {
      removed.push({
        marker,
        name: segmentName(marker, payload),
        bytes: segmentEnd - offset,
      });
    } else {
      chunks.push(buffer.subarray(offset, segmentEnd));
    }

    offset = segmentEnd;
  }

  // No EOI means the file is truncated or is not the JPEG it claims to be.
  // Decline it rather than publishing a hand-rolled rewrite of a broken file;
  // the re-encode path will either fix it or fail loudly.
  if (!sawEndOfImage) return null;

  return { buffer: Buffer.concat(chunks), removed };
}

/* ==========================================================================
   Re-encode path
   ========================================================================== */

const JPEG_EXTS = new Set(['.jpg', '.jpeg']);
const HEIF_EXTS = new Set(['.heic', '.heif']);

/**
 * Output format for a file that has to be re-encoded. Formats that survive a
 * round trip losslessly keep their own; everything else becomes a JPEG, which
 * is what the CDN will deliver from anyway.
 */
function outputFormatFor(ext) {
  if (ext === '.png') return 'png';
  if (ext === '.webp') return 'webp';
  if (ext === '.avif') return 'avif';
  return 'jpeg'; // jpg, heic, heif, tif, tiff, and anything unexpected
}

const EXTENSION_FOR_FORMAT = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
  avif: '.avif',
};

function applyFormat(pipeline, format) {
  switch (format) {
    case 'png':
      // Lossless. A scan or a screenshot stays exactly what it was.
      return pipeline.png({ compressionLevel: 9, palette: false });
    case 'webp':
      return pipeline.webp({ quality: 92, effort: 4 });
    case 'avif':
      return pipeline.avif({ quality: 80, effort: 4 });
    case 'jpeg':
    default:
      // 4:4:4 keeps chroma at full resolution — the difference shows on red
      // fabric, neon and fine text, which is exactly where an archive would
      // notice it in twenty years.
      return pipeline.jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: '4:4:4' });
  }
}

/**
 * Decode, bake in the EXIF orientation, and re-encode with no metadata.
 *
 * sharp attaches nothing unless asked, so the output carries no EXIF, no XMP
 * and no IPTC. The ICC profile is carried across when this build of sharp
 * supports doing so on its own (`keepIccProfile`), because a colour profile is
 * not personal data and losing it costs real image quality.
 */
export async function reencodeWithoutMetadata(buffer, ext) {
  const format = outputFormatFor(ext);

  let pipeline = sharp(buffer, {
    // Real archives contain slightly damaged files from 2009. Decode them
    // anyway; validation upstream has already confirmed sharp can read the
    // dimensions.
    failOn: 'none',
    // A drum-scanned negative can exceed sharp's default 268MP ceiling.
    limitInputPixels: false,
  }).rotate(); // No argument: applies the EXIF orientation, then drops the tag.

  if (typeof pipeline.keepIccProfile === 'function') {
    pipeline = pipeline.keepIccProfile();
  }

  const out = await applyFormat(pipeline, format).toBuffer();
  return { buffer: out, format, extension: EXTENSION_FOR_FORMAT[format] ?? '.jpg' };
}

/* ==========================================================================
   The one function the importer calls
   ========================================================================== */

/**
 * Produce an upload-ready buffer for one image.
 *
 * @param {object}  input
 * @param {Buffer}  input.buffer       Bytes read from the original. Never written back.
 * @param {string}  input.extension    Lowercased file extension, with the dot.
 * @param {number=} input.orientation  EXIF orientation, 1–8, or undefined.
 * @returns {Promise<{
 *   buffer: Buffer,
 *   method: 'lossless' | 're-encode',
 *   extension: string,
 *   removed: {name: string, bytes: number}[],
 *   reason: string,
 * }>}
 */
/**
 * Read a prepared buffer back and report anything identifying that survived.
 *
 * This is the check that makes the rest of the file trustworthy. Everything
 * above is an argument that metadata is removed — a hand-written JPEG marker
 * walk, and a belief that sharp attaches nothing it was not asked to. Both are
 * true today. Neither is guaranteed by anything: a sharp upgrade could start
 * preserving EXIF by default, a new input format could route somewhere
 * unexpected, and an edit to the marker logic could quietly stop dropping a
 * segment. Every one of those fails silently, and the failure is a photograph
 * published with the coordinates of somebody's house on it.
 *
 * So the output is inspected rather than assumed, by a decoder that had no part
 * in producing it. Cheap — sharp reads the header, not the pixels — and it runs
 * on every file, on both paths.
 *
 * ICC is deliberately not treated as a finding: a colour profile is not
 * personal data, and it is kept on purpose. It is reported so the caller can
 * say what it kept.
 */
/**
 * Signatures long enough that finding one by chance is not a real risk.
 *
 * Every one is at least six bytes, which puts a coincidental match in
 * compressed image data somewhere around one in 10^14. Four-byte markers are
 * deliberately absent from this list — `tEXt` would turn up by accident in
 * roughly one large photograph in five thousand, and a privacy check that cries
 * wolf gets switched off.
 */
const METADATA_SIGNATURES = [
  // 'Exif' followed by two NUL bytes  the APP1 identifier, and the same six
  // bytes a PNG eXIf chunk and a WebP EXIF chunk both carry.
  ['EXIF', Buffer.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00])],
  ['XMP', Buffer.from('<x:xmpmeta', 'latin1')],
  ['XMP', Buffer.from('http://ns.adobe.com/xap', 'latin1')],
  ['IPTC/Photoshop', Buffer.from('Photoshop 3.0', 'latin1')],
];

const PNG_SIGNATURE = Buffer.from('\x89PNG\r\n\x1a\n', 'latin1');

/** PNG chunks that carry text or EXIF, and can therefore carry a person. */
const PNG_METADATA_CHUNKS = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf']);

/**
 * Walk a PNG's chunk list and name any that hold metadata.
 *
 * Exact rather than a byte scan: PNG is a flat list of length-prefixed chunks,
 * so this reads structure instead of guessing, and cannot produce a false
 * positive from compressed pixel data. Returns null if the file is not a PNG.
 */
function pngMetadataChunks(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;

  const found = [];
  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    if (PNG_METADATA_CHUNKS.has(type)) found.push(`PNG ${type} chunk (${length} bytes)`);
    if (type === 'IEND') break;

    // length + type + data + crc, and a length that overruns means the file is
    // not worth walking further.
    const next = offset + 12 + length;
    if (next <= offset || next > buffer.length) break;
    offset = next;
  }

  return found;
}

export async function findRemainingMetadata(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { failOn: 'none', limitInputPixels: false }).metadata();
  } catch (err) {
    // Producing something the decoder cannot read is itself a failure worth
    // stopping for, rather than uploading and finding out later.
    throw new Error(`the stripped image could not be read back (${err.message})`);
  }

  const found = [];
  if (meta.exif?.length) found.push(`EXIF (${meta.exif.length} bytes)`);
  if (meta.xmp?.length) found.push(`XMP (${meta.xmp.length} bytes)`);
  if (meta.iptc?.length) found.push(`IPTC (${meta.iptc.length} bytes)`);

  /* Then the same question asked a way that does not depend on sharp.
     ----------------------------------------------------------------------
     sharp reports EXIF, XMP and IPTC, and nothing else — it is blind to a PNG
     tEXt chunk, which is where Photoshop writes a source path and some tools
     write a username. Measured, not assumed: a PNG carrying a tEXt chunk with
     a full Windows path reads back from sharp as having no metadata at all.

     The re-encode path does drop those chunks, so this is not a live leak. It
     is the difference between a check that happens to pass and a check that
     would notice if it stopped. */
  for (const [label, signature] of METADATA_SIGNATURES) {
    if (buffer.includes(signature)) found.push(`${label} signature in the file body`);
  }

  const pngChunks = pngMetadataChunks(buffer);
  if (pngChunks) found.push(...pngChunks);

  return { found, iccBytes: meta.icc?.length ?? 0 };
}

export async function prepareImageForUpload({ buffer, extension, orientation }) {
  const ext = String(extension || '').toLowerCase();
  const upright = orientation === undefined || orientation === null || orientation === 1;

  if (JPEG_EXTS.has(ext) && upright) {
    const stripped = stripJpegSegments(buffer);
    if (stripped) {
      return verified({
        buffer: stripped.buffer,
        method: 'lossless',
        extension: ext,
        removed: stripped.removed,
        reason: 'upright JPEG — metadata segments removed, pixels untouched',
      });
    }
    // Fall through: the marker structure did not parse, so re-encode instead
    // of shipping a file we could not fully account for.
  }

  const { buffer: out, extension: outExt } = await reencodeWithoutMetadata(buffer, ext);

  let reason;
  if (HEIF_EXTS.has(ext)) reason = 'HEIC converted to JPEG, metadata dropped';
  else if (!upright)
    reason = `rotation ${orientation} baked into the pixels, metadata dropped`;
  else reason = `${ext.replace('.', '') || 'image'} re-encoded, metadata dropped`;

  return verified({
    buffer: out,
    method: 're-encode',
    extension: outExt,
    // sharp writes nothing it was not asked to write, so the removal list is
    // "all of it" rather than an enumeration of segments.
    removed: [{ name: 'all embedded metadata (EXIF, XMP, IPTC)', bytes: 0 }],
    reason,
  });
}

/**
 * The gate every prepared image passes through.
 *
 * Refusing here means one photograph fails its import with a legible reason.
 * Not refusing means it is published. Given those two, this throws.
 */
async function verified(result) {
  const { found, iccBytes } = await findRemainingMetadata(result.buffer);

  if (found.length > 0) {
    throw new Error(
      `metadata survived stripping: ${found.join(', ')}. This is a bug in the ` +
        'stripper, not in your file — please report it rather than working around it.',
    );
  }

  return { ...result, iccBytes };
}

/**
 * Video location metadata is cleared before upload — see
 * ./strip-video-location.mjs, which does for an MP4 atom tree what the JPEG
 * surgery above does for segments.
 *
 * This note used to say that video went up as it came off the camera, because
 * there was no dependency-free way to rewrite an atom tree and the CDN strips
 * metadata from delivered renditions anyway. The second half was true and the
 * conclusion did not follow: the stored master keeps what the camera wrote, and
 * it stays fetchable at a URL built from its public id — which this repository
 * publishes. There is also a dependency-free way, as it turns out.
 *
 * What still goes up untouched is everything else in the container: the device
 * model, the encoder, timestamps. Those are not coordinates, and unlike a
 * photograph's EXIF they cannot be removed without either re-encoding or
 * shifting offsets that would need patching. If that ever matters, the answer
 * is ffmpeg, and it should be an explicit flag rather than a silent dependency.
 */
export const VIDEO_METADATA_NOTE =
  'Video keeps its technical metadata — device model, encoder, timestamps. ' +
  'Location atoms are cleared before upload; everything else goes up as the camera wrote it.';
