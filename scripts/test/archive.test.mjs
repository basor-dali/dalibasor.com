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
import { stripJpegSegments, prepareImageForUpload } from '../lib/strip-metadata.mjs';

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
