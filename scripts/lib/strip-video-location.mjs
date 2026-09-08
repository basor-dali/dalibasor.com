/**
 * Location metadata removal for video — the other half of the privacy layer.
 *
 * =========================================================================
 * THE HARD RULE, AGAIN
 * =========================================================================
 * THE USER'S ORIGINAL FILE IS NEVER MODIFIED, MOVED, RENAMED OR DELETED.
 * Everything here reads the source and writes somewhere else. The only file
 * this module ever opens for writing is a destination it was handed.
 * =========================================================================
 *
 * A clip off a phone records where it was taken. In an MP4 or MOV that lives
 * in the atom tree, usually as `moov/udta/©xyz` — an ISO 6709 string like
 * `+52.3702+004.8952/` — and sometimes as a 3GPP `loci` box, or an XMP packet
 * carrying exif:GPSLatitude.
 *
 * This used to be uploaded untouched, on the reasoning that there is no
 * dependency-free way to rewrite an atom tree and that the CDN strips metadata
 * from delivered renditions anyway. The second half is true and the conclusion
 * did not follow: the *master* keeps whatever the camera wrote, and a master
 * stays fetchable at a URL built from its public id — which this repository
 * publishes, in content/media/*.yml. So the coordinates were one public repo
 * and one constructed URL away, which is not "stripped by default" in any
 * sense worth the words.
 *
 * ---------------------------------------------------------------------------
 * Why this is safe to do by hand
 * ---------------------------------------------------------------------------
 * Deleting bytes from an MP4 is genuinely dangerous. `moov` carries a table of
 * absolute file offsets into `mdat` (`stco`, or `co64` on large files), so
 * removing one atom shifts every chunk and silently corrupts playback unless
 * every offset is patched to match.
 *
 * So nothing is deleted. A location atom is overwritten in place with a `free`
 * atom of *exactly the same size*: the type becomes `free` and the payload
 * becomes zeros. `free` is the ISO-BMFF box meaning "ignore me", every player
 * skips it, and since not one byte moves, every offset in the file stays
 * correct. The video and audio streams come through bit-identical — the same
 * philosophy as the JPEG segment surgery next door, applied to a different
 * container.
 *
 * ---------------------------------------------------------------------------
 * Two entry points
 * ---------------------------------------------------------------------------
 *   stripVideoLocation(buffer)              in memory, for small inputs
 *   stripVideoLocationToFile(src, dest)     streamed, for real video
 *
 * The streamed one exists because a video is not a photograph: reading a 2GB
 * clip into a Buffer to clear forty bytes near the front of it is not a trade
 * worth making. It seeks the atom headers, works out which byte ranges to
 * blank, and then copies the file through a stream while patching those ranges
 * as they pass. Memory stays flat whatever the file weighs.
 */

import fs from 'node:fs';

/** Atoms that carry a position, by type. */
const LOCATION_ATOMS = new Map([
  ['©xyz', 'Apple/Android location (©xyz) — ISO 6709 coordinates'],
  ['©gps', 'GPS atom (©gps)'],
  ['loci', '3GPP location box (loci) — coordinates and place name'],
  ['gpsd', 'GPS data atom'],
]);

/**
 * Atoms that contain other atoms, and are therefore worth descending into.
 *
 * Deliberately a list rather than a guess. That matters most for `mdat`: it is
 * the video itself, it is not a container, and its bytes will happily look like
 * atom headers by coincidence.
 */
const CONTAINER_ATOMS = new Set([
  'moov',
  'trak',
  'udta',
  'meta',
  'ilst',
  'mdia',
  'minf',
  'edts',
  'moof',
  'traf',
]);

/** The UUID that marks an XMP packet, which can carry exif:GPSLatitude. */
const XMP_UUID = Buffer.from('be7acfcb97a942e89c71999491e3afac', 'hex');

const HEADER_BYTES = 8;
const MAX_DEPTH = 12;

/* ==========================================================================
   Readers — the traversal does not care where the bytes come from
   ========================================================================== */

function bufferReader(buffer) {
  return {
    size: buffer.length,
    read: (offset, length) => buffer.subarray(offset, offset + length),
  };
}

function fileReader(fd, size) {
  return {
    size,
    read(offset, length) {
      const out = Buffer.alloc(length);
      const got = fs.readSync(fd, out, 0, length, offset);
      return got === length ? out : out.subarray(0, got);
    },
  };
}

/* ==========================================================================
   Atom tree
   ========================================================================== */

/** An atom type is four printable characters, or one of Apple's ©-prefixed. */
function looksLikeAtomType(type) {
  return /^[\x20-\x7e©]{4}$/.test(type);
}

/**
 * Read one box header.
 *
 * `size === 1` means the real size is a 64-bit value after the type;
 * `size === 0` means the box runs to the end of its parent.
 */
function readHeader(reader, offset, end) {
  if (offset + HEADER_BYTES > end) return null;

  const head = reader.read(offset, Math.min(16, end - offset));
  if (head.length < HEADER_BYTES) return null;

  const declared = head.readUInt32BE(0);
  const type = head.toString('latin1', 4, 8);
  let size = declared;
  let headerSize = HEADER_BYTES;

  if (declared === 1) {
    if (head.length < 16 || offset + 16 > end) return null;
    const large = head.readBigUInt64BE(8);
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(large);
    headerSize = 16;
  } else if (declared === 0) {
    size = end - offset;
  }

  if (size < headerSize || offset + size > end) return null;
  return { type, size, headerSize };
}

/**
 * `meta` is a FullBox in ISO-BMFF (four bytes of version and flags before its
 * children) and a plain container in QuickTime. Files in the wild are both.
 * Rather than trusting either, look at which reading yields a child that is
 * actually a box.
 *
 * Size alone cannot separate them, which cost me a test: in a FullBox those
 * four bytes are usually zero, and a declared size of zero legitimately means
 * "runs to the end of the parent". So the plain reading appears to succeed,
 * with four bytes of the real child's size read as its type. Requiring the type
 * to be printable is what tells them apart.
 */
function metaChildOffset(reader, payloadStart, boxEnd) {
  const asPlain = readHeader(reader, payloadStart, boxEnd);
  if (asPlain && looksLikeAtomType(asPlain.type)) return payloadStart;

  const asFullBox = readHeader(reader, payloadStart + 4, boxEnd);
  if (asFullBox && looksLikeAtomType(asFullBox.type)) return payloadStart + 4;

  return null;
}

/**
 * Walk the tree and collect every atom that has to be blanked.
 *
 * Returns false — never throws, never guesses — if the structure does not
 * parse. The caller must read that as "cannot promise this file is clean".
 */
function collect(reader, start, end, found, depth = 0) {
  if (depth > MAX_DEPTH) return false;

  let offset = start;

  while (offset < end) {
    const header = readHeader(reader, offset, end);
    if (!header) return false;

    const payloadStart = offset + header.headerSize;
    const boxEnd = offset + header.size;

    const isXmp =
      header.type === 'uuid' &&
      payloadStart + 16 <= boxEnd &&
      reader.read(payloadStart, 16).equals(XMP_UUID);

    if (LOCATION_ATOMS.has(header.type) || isXmp) {
      found.push({
        offset,
        size: header.size,
        headerSize: header.headerSize,
        name: isXmp
          ? 'XMP packet (uuid) — may carry GPS'
          : LOCATION_ATOMS.get(header.type),
      });
    } else if (CONTAINER_ATOMS.has(header.type)) {
      const childStart =
        header.type === 'meta'
          ? metaChildOffset(reader, payloadStart, boxEnd)
          : payloadStart;

      // A container whose inside cannot be read is a container that cannot be
      // cleared. Say so rather than reporting success.
      if (childStart === null) return false;
      if (!collect(reader, childStart, boxEnd, found, depth + 1)) return false;
    }

    offset = boxEnd;
  }

  return true;
}

function scan(reader) {
  if (reader.size < HEADER_BYTES) return null;

  // Every MP4/MOV opens with a box header. `ftyp` is near-universal; older
  // QuickTime files may lead with `moov`, `mdat`, `wide` or `skip`.
  const first = readHeader(reader, 0, reader.size);
  if (!first || !looksLikeAtomType(first.type)) return null;

  const found = [];
  return collect(reader, 0, reader.size, found) ? found : null;
}

/**
 * The byte edits that turn one location atom into a `free` atom: rewrite the
 * type, zero the payload, leave the size field exactly as it was.
 */
function editsFor(atom) {
  return [
    { start: atom.offset + 4, end: atom.offset + 8, fill: Buffer.from('free', 'latin1') },
    { start: atom.offset + atom.headerSize, end: atom.offset + atom.size, fill: null },
  ].filter((edit) => edit.end > edit.start);
}

/* ==========================================================================
   In memory
   ========================================================================== */

/**
 * Neutralise every location atom in an MP4/MOV held in memory.
 *
 * Returns a NEW buffer of the same length plus what was cleared, or `null` if
 * the file does not parse as an atom tree.
 */
export function stripVideoLocation(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;

  const atoms = scan(bufferReader(buffer));
  if (atoms === null) return null;

  const copy = Buffer.from(buffer);
  for (const atom of atoms) {
    for (const edit of editsFor(atom)) {
      if (edit.fill) edit.fill.copy(copy, edit.start);
      else copy.fill(0, edit.start, edit.end);
    }
  }

  return {
    buffer: copy,
    removed: atoms.map((atom) => ({ name: atom.name, bytes: atom.size })),
  };
}

/** What a buffer would lose, without producing the cleaned copy. */
export function containsLocationAtom(buffer) {
  const atoms = Buffer.isBuffer(buffer) ? scan(bufferReader(buffer)) : null;
  return atoms === null ? null : atoms.length > 0;
}

/* ==========================================================================
   Streamed, for files of any size
   ========================================================================== */

/**
 * Copy `sourcePath` to `destinationPath` with every location atom blanked.
 *
 * Memory stays flat: the tree is walked with positional reads, and the copy
 * runs a chunk at a time, patching the handful of byte ranges that need it as
 * they go past. Returns `null` without writing anything if the container does
 * not parse.
 */
export async function stripVideoLocationToFile(sourcePath, destinationPath) {
  const fd = fs.openSync(sourcePath, 'r');
  let atoms;
  try {
    const { size } = fs.fstatSync(fd);
    atoms = scan(fileReader(fd, size));
  } finally {
    fs.closeSync(fd);
  }

  if (atoms === null) return null;

  const edits = atoms.flatMap(editsFor).sort((a, b) => a.start - b.start);

  await new Promise((resolve, reject) => {
    const source = fs.createReadStream(sourcePath);
    const destination = fs.createWriteStream(destinationPath);
    let position = 0;

    source.on('error', reject);
    destination.on('error', reject);
    destination.on('finish', resolve);

    source.on('data', (chunk) => {
      const chunkStart = position;
      const chunkEnd = position + chunk.length;
      position = chunkEnd;

      for (const edit of edits) {
        if (edit.end <= chunkStart || edit.start >= chunkEnd) continue;
        const from = Math.max(edit.start, chunkStart) - chunkStart;
        const to = Math.min(edit.end, chunkEnd) - chunkStart;

        if (edit.fill) {
          // The `free` marker is four bytes and can straddle a chunk boundary,
          // so copy only the slice of it that belongs to this chunk.
          const markerFrom = chunkStart + from - edit.start;
          edit.fill.copy(chunk, from, markerFrom, markerFrom + (to - from));
        } else {
          chunk.fill(0, from, to);
        }
      }

      destination.write(chunk);
    });

    source.on('end', () => destination.end());
  });

  return {
    removed: atoms.map((atom) => ({ name: atom.name, bytes: atom.size })),
    bytes: fs.statSync(destinationPath).size,
  };
}
