/**
 * Tests for the parts that fail silently.
 *
 * Node's built-in runner, no dependencies:  npm test
 *
 * These are deliberately not "coverage". They pin the handful of invariants
 * that would break an archive quietly rather than loudly — a slug that changes
 * shape, a date that shifts by a timezone, a manifest round-trip that drops a
 * caption, a metadata stripper that stops stripping. Every one of these is a
 * thing you would not notice for years.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

import { slugify, titleCase, formatItemId, padNumber } from '../lib/manifest.mjs';
import { widthsFor, derivativeKey, originalKey, LADDER } from '../lib/derivatives.mjs';
import { baseKeyFor, keyLeaf } from '../lib/r2.mjs';
import {
  stripJpegSegments,
  prepareImageForUpload,
  findRemainingMetadata,
} from '../lib/strip-metadata.mjs';
import {
  stripVideoLocation,
  stripVideoLocationToFile,
} from '../lib/strip-video-location.mjs';

/* ==========================================================================
   Slugs are permanent URLs
   ========================================================================== */

describe('slugify', () => {
  it('strips diacritics that decompose', () => {
    assert.equal(slugify('Čačak'), 'cacak');
    assert.equal(slugify('Užice'), 'uzice');
    assert.equal(slugify('Šabac'), 'sabac');
  });

  it('transliterates letters NFKD will not decompose', () => {
    // Đ is a distinct letter, not D plus a mark. Without an explicit mapping
    // this becomes "or-e", which is how a Balkan archive quietly loses names.
    assert.equal(slugify('Đorđe'), 'dorde');
    assert.equal(slugify('Đakovica 2019'), 'dakovica-2019');
  });

  it('drops apostrophes rather than turning them into separators', () => {
    assert.equal(slugify("Angel's Wedding"), 'angels-wedding');
    assert.equal(slugify('Angel\u2019s Wedding'), 'angels-wedding');
  });

  it('never produces leading, trailing or doubled hyphens', () => {
    for (const input of ['  spaced  ', '--dashes--', 'a  b', '!!!', 'a---b']) {
      const out = slugify(input);
      assert.ok(!out.startsWith('-'), `${input} -> ${out}`);
      assert.ok(!out.endsWith('-'), `${input} -> ${out}`);
      assert.ok(!out.includes('--'), `${input} -> ${out}`);
    }
  });

  it('is idempotent — slugifying a slug changes nothing', () => {
    for (const input of ['Đorđe', 'Herceg Novi', "Angel's Wedding", 'Novi Sad 2019']) {
      assert.equal(slugify(slugify(input)), slugify(input), input);
    }
  });

  it('is URL-safe for anything it returns', () => {
    for (const input of ['Đorđe', 'Čačak', 'a/b\\c', 'x?y=z&w', '<script>']) {
      assert.match(slugify(input), /^[a-z0-9-]*$/, input);
    }
  });
});

describe('titleCase', () => {
  it('turns a slug back into a starting-point title', () => {
    assert.equal(titleCase('novi-sad'), 'Novi Sad');
    assert.equal(titleCase('angels-wedding'), 'Angels Wedding');
  });
});

/* ==========================================================================
   Ids address photographs in the lightbox — they must never collide or shift
   ========================================================================== */

describe('item ids', () => {
  it('pads to a stable width so ids sort lexicographically', () => {
    assert.equal(padNumber(7), '0007');
    assert.equal(padNumber(1234), '1234');
  });

  it('separates everyday from album items', () => {
    assert.equal(formatItemId(2019, undefined, 1), '2019-everyday-0001');
    assert.equal(formatItemId(2019, 'novi-sad', 1), '2019-novi-sad-0001');
  });

  it('keeps ids sortable in capture order', () => {
    const ids = [1, 2, 10, 20, 100].map((n) => formatItemId(2019, 'x', n));
    assert.deepEqual([...ids].sort(), ids);
  });
});

/* ==========================================================================
   The derivative ladder decides which files exist
   ========================================================================== */

describe('widthsFor', () => {
  it('never upscales', () => {
    for (const native of [100, 500, 1000, 2000, 4032]) {
      for (const width of widthsFor(native)) {
        assert.ok(width <= native, `${native} produced ${width}`);
      }
    }
  });

  it('always returns at least one width', () => {
    for (const native of [1, 50, 319, 320, 5000]) {
      assert.ok(widthsFor(native).length > 0, String(native));
    }
  });

  it('returns the source itself when it is smaller than the first rung', () => {
    assert.deepEqual(widthsFor(240), [240]);
  });

  it('is ascending and free of duplicates', () => {
    for (const native of [400, 1500, 2400, 4032]) {
      const widths = widthsFor(native);
      assert.deepEqual(
        widths,
        [...widths].sort((a, b) => a - b),
        String(native),
      );
      assert.equal(new Set(widths).size, widths.length, String(native));
    }
  });

  it('caps at the top of the ladder for very large sources', () => {
    assert.equal(Math.max(...widthsFor(9000)), LADDER[LADDER.length - 1]);
  });
});

describe('object keys', () => {
  it('puts every size of one photograph under one prefix', () => {
    const base = baseKeyFor('dalibasor', 2019, 'novi-sad', keyLeaf('IMG_0042.JPG'));
    assert.equal(base, 'dalibasor/2019/novi-sad/img-0042');
    assert.equal(derivativeKey(base, 1024, 'avif'), `${base}/1024.avif`);
    assert.equal(derivativeKey(base, 1024, 'jpeg'), `${base}/1024.jpg`);
    assert.equal(originalKey(base, '.jpg'), `${base}/original.jpg`);
  });

  it('files album-less photographs under everyday', () => {
    assert.equal(baseKeyFor('p', 2019, undefined, 'x'), 'p/2019/everyday/x');
    assert.equal(baseKeyFor('p', 2019, '', 'x'), 'p/2019/everyday/x');
  });

  it('produces URL-safe keys from awkward filenames', () => {
    for (const name of ['IMG 0042.JPG', 'Đorđe.jpeg', 'a/b.png', '  .jpg']) {
      assert.match(keyLeaf(name, 'abcdef1234'), /^[a-z0-9-]+$/, name);
    }
  });

  it('keeps Balkan letters rather than deleting them', () => {
    // Its own slug rule used to strip anything non-ASCII, so Đorđe.jpg became
    // "or-e". The key is a permanent address; it should carry the name.
    assert.match(keyLeaf('Đorđe.jpg', 'aaaaaaaa'), /^dorde-/);
    assert.match(keyLeaf('Užice.png', 'bbbbbbbb'), /^uzice-/);
  });

  it('never lets two different photographs share a key', () => {
    // Every one of these reduces to nothing, and all five used to become the
    // literal key "image" — so an import of a folder like this silently
    // overwrote each photograph with the next and left the manifest pointing
    // five entries at one file.
    const names = ['Ελλάδα.jpg', '日本.jpg', 'Ужице.png', '___.jpg', '!!!.jpg'];
    const keys = names.map((n, i) => keyLeaf(n, `hash${i}0000000`));
    assert.equal(new Set(keys).size, names.length, `collision among: ${keys.join(', ')}`);
    for (const key of keys) assert.match(key, /^photo-/);
  });

  it('is deterministic: the same file always lands on the same key', () => {
    assert.equal(keyLeaf('IMG_1.jpg', 'deadbeef99'), keyLeaf('IMG_1.jpg', 'deadbeef99'));
    // …and the same NAME with different content does not.
    assert.notEqual(keyLeaf('IMG_1.jpg', 'aaaaaaaa'), keyLeaf('IMG_1.jpg', 'bbbbbbbb'));
  });
});

/* ==========================================================================
   Privacy — the one thing that must never regress
   ========================================================================== */

function jpegWithMetadata(base) {
  const app = (marker, payload) => {
    const len = payload.length + 2;
    return Buffer.concat([
      Buffer.from([0xff, marker]),
      Buffer.from([len >> 8, len & 0xff]),
      payload,
    ]);
  };
  const exif = Buffer.concat([
    Buffer.from('Exif\u0000\u0000', 'latin1'),
    Buffer.from('II*\u0000', 'latin1'),
    Buffer.from('GPSLatitude 44.7866 GPSLongitude 20.4489 SerialNumber ABC123', 'latin1'),
  ]);
  const iptc = Buffer.from(
    'Photoshop 3.0\u0000SECRETPATH C:/Users/Someone/private',
    'latin1',
  );
  return Buffer.concat([
    base.subarray(0, 2),
    app(0xe1, exif),
    app(0xed, iptc),
    base.subarray(2),
  ]);
}

describe('metadata stripping', () => {
  it('removes GPS, serials and IPTC without touching a single pixel', async () => {
    const base = await sharp({
      create: {
        width: 240,
        height: 160,
        channels: 3,
        background: { r: 180, g: 90, b: 40 },
      },
    })
      .jpeg({ quality: 88 })
      .toBuffer();

    const dirty = jpegWithMetadata(base);
    assert.ok(dirty.includes(Buffer.from('GPSLatitude')), 'fixture should contain GPS');

    const { buffer: clean } = stripJpegSegments(dirty);

    assert.ok(!clean.includes(Buffer.from('GPSLatitude')), 'GPS survived');
    assert.ok(!clean.includes(Buffer.from('ABC123')), 'serial survived');
    assert.ok(!clean.includes(Buffer.from('SECRETPATH')), 'IPTC path survived');

    // Truly lossless: the entropy-coded scan is byte-identical, not re-encoded.
    assert.ok(clean.equals(base), 'scan data was re-encoded rather than preserved');

    const before = await sharp(base).raw().toBuffer();
    const after = await sharp(clean).raw().toBuffer();
    assert.ok(before.equals(after), 'pixels changed');
  });

  it('chooses the lossless path for an upright JPEG', async () => {
    const base = await sharp({
      create: {
        width: 120,
        height: 80,
        channels: 3,
        background: { r: 20, g: 90, b: 60 },
      },
    })
      .jpeg()
      .toBuffer();

    const prepared = await prepareImageForUpload({
      buffer: jpegWithMetadata(base),
      extension: '.jpg',
      orientation: 1,
    });

    assert.equal(prepared.method, 'lossless');
    assert.ok(!prepared.buffer.includes(Buffer.from('GPSLatitude')));
  });

  it('re-encodes rather than giving up when the file must be rotated', async () => {
    const base = await sharp({
      create: {
        width: 120,
        height: 80,
        channels: 3,
        background: { r: 90, g: 20, b: 60 },
      },
    })
      .jpeg()
      .toBuffer();

    const prepared = await prepareImageForUpload({
      buffer: base,
      extension: '.jpg',
      orientation: 6,
    });

    assert.notEqual(prepared.method, 'lossless');
    assert.ok(prepared.buffer.length > 0);
    assert.ok(!prepared.buffer.includes(Buffer.from('Exif')));
  });

  it('returns null rather than guessing when handed something that is not a JPEG', () => {
    assert.equal(stripJpegSegments(Buffer.from('not a jpeg at all')), null);
    assert.equal(stripJpegSegments(Buffer.alloc(0)), null);
  });

  /* The most common trailer in the world is a Motion Photo: Samsung and Pixel
     phones append a complete MP4 after the JPEG's end-of-image marker, and that
     MP4 carries its own metadata container — location included. The stripper
     used to copy everything from the first scan onward, so such a file could
     lose its EXIF, report every segment stripped, and still publish
     coordinates. */
  it('drops anything appended after the end-of-image marker', async () => {
    const base = await sharp({
      create: {
        width: 160,
        height: 120,
        channels: 3,
        background: { r: 40, g: 70, b: 110 },
      },
    })
      .jpeg({ quality: 84 })
      .toBuffer();

    const secret = Buffer.from('MOTIONPHOTO-MP4-52.3702,4.8952');
    const motionPhoto = Buffer.concat([
      jpegWithMetadata(base),
      Buffer.from('   ftypmp42', 'latin1'),
      secret,
    ]);

    const result = stripJpegSegments(motionPhoto);
    assert.ok(result, 'a Motion Photo should still take the lossless path');
    assert.ok(!result.buffer.includes(secret), 'the appended video survived');
    assert.ok(
      result.removed.some((entry) => /trailer/.test(entry.name)),
      'the trailer was dropped without being reported',
    );

    // Still lossless: the point of this path is that it never re-encodes.
    assert.ok(result.buffer.equals(base), 'dropping the trailer disturbed the scan');
  });

  it('reports no trailer when there is none', async () => {
    const base = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .jpeg()
      .toBuffer();

    const { removed } = stripJpegSegments(jpegWithMetadata(base));
    assert.ok(!removed.some((entry) => /trailer/.test(entry.name)));
  });

  /* Progressive JPEGs carry several scans with tables between them. Walking the
     entropy-coded data — which is what finding the real end-of-image requires —
     has to survive that rather than stopping at the first scan. */
  it('handles a progressive JPEG with several scans', async () => {
    const base = await sharp({
      create: {
        width: 200,
        height: 140,
        channels: 3,
        background: { r: 200, g: 160, b: 90 },
      },
    })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();

    const result = stripJpegSegments(jpegWithMetadata(base));
    assert.ok(result, 'progressive JPEGs should still strip losslessly');
    assert.ok(!result.buffer.includes(Buffer.from('GPSLatitude')));
    assert.ok(result.buffer.equals(base), 'a scan was lost or altered');
  });

  it('declines a truncated file rather than rewriting it', async () => {
    const base = await sharp({
      create: { width: 80, height: 80, channels: 3, background: { r: 5, g: 5, b: 5 } },
    })
      .jpeg()
      .toBuffer();

    const cut = jpegWithMetadata(base);
    assert.equal(stripJpegSegments(cut.subarray(0, cut.length - 40)), null);
  });
});

/* ==========================================================================
   The check that makes the rest of it trustworthy
   ==========================================================================
   Everything above argues that metadata is removed. Nothing guarantees it
   stays removed: a sharp upgrade could start preserving EXIF, a new input
   format could route somewhere unexpected, an edit to the marker walk could
   quietly stop dropping a segment. All of those fail silently, and the failure
   is a photograph published with somebody's home coordinates on it. So the
   output is inspected by a decoder that had no hand in producing it, and these
   tests are about the inspector rather than the stripper. */

/** A PNG chunk: length, type, data, CRC. */
function pngChunk(type, data) {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);

  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

describe('verifying that stripping actually happened', () => {
  it('sees the metadata in a file that still has it', async () => {
    const dirty = await sharp({
      create: { width: 80, height: 60, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'Private Owner Name' } } })
      .jpeg()
      .toBuffer();

    const { found } = await findRemainingMetadata(dirty);
    assert.ok(found.length > 0, 'the check is blind — it would pass anything');
    assert.ok(found.some((entry) => entry.startsWith('EXIF')));
  });

  it('sees a PNG text chunk, which sharp does not report', async () => {
    // Photoshop writes a source path into tEXt; some tools write a username.
    // sharp reports EXIF, XMP and IPTC and nothing else, so this is the case
    // the byte- and chunk-level checks exist for.
    const base = await sharp({
      create: { width: 60, height: 40, channels: 3, background: { r: 7, g: 8, b: 9 } },
    })
      .png()
      .toBuffer();

    const secret = 'C:\Users\Private\Pictures';
    const text = pngChunk(
      'tEXt',
      Buffer.concat([Buffer.from('Source ', 'latin1'), Buffer.from(secret, 'latin1')]),
    );
    // After the 8-byte signature and the 25-byte IHDR chunk.
    const dirty = Buffer.concat([base.subarray(0, 33), text, base.subarray(33)]);

    const { found } = await findRemainingMetadata(dirty);
    assert.ok(
      found.some((entry) => entry.includes('tEXt')),
      `a tEXt chunk went unreported: ${found.join(', ') || 'nothing found'}`,
    );

    const prepared = await prepareImageForUpload({
      buffer: dirty,
      extension: '.png',
      orientation: 1,
    });
    assert.ok(!prepared.buffer.includes(Buffer.from(secret)), 'the path was published');
    const after = await findRemainingMetadata(prepared.buffer);
    assert.deepEqual(after.found, []);
  });

  it('passes a prepared file in every format the importer accepts', async () => {
    for (const [format, extension] of [
      ['jpeg', '.jpg'],
      ['png', '.png'],
      ['webp', '.webp'],
    ]) {
      const image = sharp({
        create: {
          width: 100,
          height: 80,
          channels: 3,
          background: { r: 20, g: 40, b: 60 },
        },
      }).withMetadata({
        exif: { IFD0: { Copyright: 'Owner Name', Make: 'SERIAL-1' } },
      });

      const encoded =
        format === 'png'
          ? await image.png().toBuffer()
          : format === 'webp'
            ? await image.webp().toBuffer()
            : await image.jpeg().toBuffer();

      const prepared = await prepareImageForUpload({
        buffer: encoded,
        extension,
        orientation: 1,
      });
      const { found } = await findRemainingMetadata(prepared.buffer);
      assert.deepEqual(found, [], `${extension} kept ${found.join(', ')}`);
    }
  });

  /* The signatures are all six bytes or longer for this reason. A four-byte
     marker turns up by chance in compressed scan data often enough to fail
     real photographs, and a privacy check that cries wolf gets switched off. */
  it('does not cry wolf on a large photograph of pure noise', async () => {
    const width = 900;
    const height = 700;
    const noise = Buffer.alloc(width * height * 3);
    // Deterministic, so a failure here is reproducible rather than a coin toss.
    let seed = 12345;
    for (let i = 0; i < noise.length; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = seed & 0xff;
    }

    const photo = await sharp(noise, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 92 })
      .toBuffer();

    const prepared = await prepareImageForUpload({
      buffer: photo,
      extension: '.jpg',
      orientation: 1,
    });
    const { found } = await findRemainingMetadata(prepared.buffer);
    assert.deepEqual(found, [], 'a clean photograph was flagged');
  });

  it('refuses to hand back an image it cannot read', async () => {
    await assert.rejects(
      () => findRemainingMetadata(Buffer.from('not an image')),
      /could not be read back/,
    );
  });
});

/* ==========================================================================
   Video carries coordinates too
   ==========================================================================
   A clip off a phone records where it was taken, in moov/udta/©xyz. It used to
   be uploaded untouched because the CDN strips metadata from what it delivers —
   but the stored master keeps it, and a master is fetchable at a URL built from
   the public id this repository publishes. */

/** size + type + payload — one MP4 atom. */
function atom(type, payload = Buffer.alloc(0)) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + payload.length, 0);
  head.write(type, 4, 4, 'latin1');
  return Buffer.concat([head, payload]);
}

const COORDINATES = '+52.3702+004.8952/';

/** The ©xyz atom an iPhone or Android phone writes. */
function locationAtom() {
  const text = Buffer.from(COORDINATES, 'latin1');
  const header = Buffer.alloc(4);
  header.writeUInt16BE(text.length, 0);
  header.writeUInt16BE(0x15c7, 2);
  return atom('©xyz', Buffer.concat([header, text]));
}

function phoneClip(extra = Buffer.alloc(0)) {
  return Buffer.concat([
    atom('ftyp', Buffer.from('mp42mp42isom', 'latin1')),
    extra,
    atom(
      'moov',
      Buffer.concat([atom('mvhd', Buffer.alloc(100)), atom('udta', locationAtom())]),
    ),
    atom('mdat', Buffer.alloc(4096, 0x41)),
  ]);
}

describe('video location stripping', () => {
  it('clears the coordinates a phone writes', () => {
    const clip = phoneClip();
    assert.ok(
      clip.includes(Buffer.from(COORDINATES)),
      'fixture should carry coordinates',
    );

    const result = stripVideoLocation(clip);
    assert.ok(result, 'a normal MP4 should parse');
    assert.ok(!result.buffer.includes(Buffer.from(COORDINATES)), 'coordinates survived');
    assert.ok(result.removed.some((entry) => /xyz/.test(entry.name)));
  });

  it('changes nothing else — every byte offset in the file stays valid', () => {
    const clip = phoneClip();
    const result = stripVideoLocation(clip);

    assert.equal(result.buffer.length, clip.length, 'the file changed length');
    // The atom becomes a same-sized `free` box, which every player skips.
    assert.ok(result.buffer.includes(Buffer.from('free')));
    // And the video payload itself is untouched.
    const mdat = result.buffer.subarray(clip.length - 4096);
    assert.ok(mdat.equals(Buffer.alloc(4096, 0x41)), 'the video stream was altered');
  });

  it('leaves a clip that has no location exactly as it was', () => {
    const clip = Buffer.concat([
      atom('ftyp', Buffer.from('mp42', 'latin1')),
      atom('moov', atom('udta', atom('©nam', Buffer.from('Holiday')))),
      atom('mdat', Buffer.alloc(64, 3)),
    ]);

    const result = stripVideoLocation(clip);
    assert.equal(result.removed.length, 0);
    assert.ok(result.buffer.equals(clip));
    assert.ok(
      result.buffer.includes(Buffer.from('Holiday')),
      'the title was removed too',
    );
  });

  it('never follows atom-shaped bytes inside the video payload', () => {
    // 'udta' occurring by chance inside mdat must not be descended into.
    const decoy = Buffer.concat([
      Buffer.from([0, 0, 0, 16]),
      Buffer.from('udta'),
      Buffer.alloc(8),
    ]);
    const clip = Buffer.concat([
      atom('ftyp', Buffer.from('mp42', 'latin1')),
      atom('mdat', Buffer.concat([Buffer.alloc(32, 7), decoy, Buffer.alloc(32, 7)])),
    ]);

    const result = stripVideoLocation(clip);
    assert.ok(result);
    assert.ok(result.buffer.equals(clip));
  });

  it('refuses a container it cannot read rather than claiming it is clean', () => {
    assert.equal(stripVideoLocation(Buffer.from('not a video at all, really')), null);
    assert.equal(stripVideoLocation(Buffer.alloc(0)), null);
  });

  it('streams a large file to the same bytes it would produce in memory', async () => {
    // Padded so the location atom lands mid-stream rather than in the first
    // chunk, which is where a boundary bug would hide.
    const clip = phoneClip(atom('free', Buffer.alloc(70000, 0x5a)));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-strip-test-'));

    try {
      const source = path.join(dir, 'in.mp4');
      const destination = path.join(dir, 'out.mp4');
      fs.writeFileSync(source, clip);

      const streamed = await stripVideoLocationToFile(source, destination);
      const written = fs.readFileSync(destination);
      const inMemory = stripVideoLocation(clip);

      assert.ok(
        written.equals(inMemory.buffer),
        'streamed output differs from in-memory',
      );
      assert.ok(!written.includes(Buffer.from(COORDINATES)));
      assert.equal(written.length, clip.length);
      assert.deepEqual(streamed.removed, inMemory.removed);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes nothing at all when the container will not parse', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-strip-test-'));
    try {
      const source = path.join(dir, 'junk.mp4');
      const destination = path.join(dir, 'out.mp4');
      fs.writeFileSync(source, Buffer.from('this is not a video'));

      assert.equal(await stripVideoLocationToFile(source, destination), null);
      assert.ok(!fs.existsSync(destination), 'a rejected file should leave no output');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ==========================================================================
   The manifest is the archive. A round trip must lose nothing.
   ========================================================================== */

describe('manifest round trip', () => {
  it('preserves hand-written words when technical fields are patched', async () => {
    const {
      loadManifestDoc,
      saveManifestDoc,
      addItem,
      addAlbum,
      findItemNodeById,
      patchItemNode,
    } = await import('../lib/manifest.mjs');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'));
    const previous = process.cwd();

    try {
      // loadManifestDoc resolves against the repo, so work on a document
      // directly rather than moving the process.
      const { doc } = loadManifestDoc(1999);
      addAlbum(doc, { slug: 'test', title: 'Test' });
      addItem(doc, {
        id: '1999-test-0001',
        type: 'image',
        album: 'test',
        publicId: 'p/1999/test/a',
        width: 1600,
        height: 1067,
        variants: [320, 640, 1024, 1600],
        formats: ['avif', 'webp'],
        hash: 'abc',
      });

      const node = findItemNodeById(doc, '1999-test-0001');
      node.set('caption', 'A line Dali wrote.');
      node.set('location', 'Novi Sad, Serbia');
      node.set('featured', true);

      // A re-import refreshes technical fields only.
      patchItemNode(node, {
        publicId: 'p/1999/test/a',
        width: 2400,
        height: 1600,
        variants: [320, 640, 1024, 1600, 2048, 2400],
        formats: ['avif', 'webp'],
        hash: 'abc',
      });

      assert.equal(
        String(node.get('caption')),
        'A line Dali wrote.',
        'caption was overwritten',
      );
      assert.equal(
        String(node.get('location')),
        'Novi Sad, Serbia',
        'location was overwritten',
      );
      assert.equal(node.get('featured'), true, 'featured was overwritten');
      assert.equal(Number(node.get('width')), 2400, 'width was not refreshed');

      const file = path.join(dir, '1999.yml');
      saveManifestDoc(doc, file);
      const text = fs.readFileSync(file, 'utf8');

      assert.match(text, /A line Dali wrote\./);
      // Width lists stay on one line, or the file stops being readable.
      assert.match(text, /variants: \[/);
      assert.ok(!/variants:\s*\n\s+-/.test(text), 'variants was written as a block list');
    } finally {
      process.chdir(previous);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
