/**
 * The media manifest: content/media/<year>.yml
 *
 * One YAML file per year, hand-editable forever. Every script in this folder
 * that touches content goes through here, so there is exactly one place that
 * knows the key order, the id format, and how to write a file without ever
 * risking a half-written manifest.
 *
 * Three rules this module exists to enforce:
 *
 *   1. Nothing already in the file is ever destroyed. Captions, locations,
 *      album notes, covers, hand-written YAML comments — all of it survives a
 *      re-import. New items are appended; existing ones are only ever patched
 *      on their technical fields (dimensions, publicId, lqip, hash).
 *   2. Key order is fixed, so a re-run produces a clean git diff rather than a
 *      reshuffled file.
 *   3. Writes are atomic. A crash mid-write leaves the old file intact.
 *
 * It also carries the handful of path and string helpers every script here
 * needs, so scripts/ does not end up with a fourth copy of `slugify`.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

/* ==========================================================================
   Locations
   ========================================================================== */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The repository root — scripts/lib/manifest.mjs is two levels down. */
export const REPO_ROOT = path.resolve(HERE, '..', '..');
export const CONTENT_ROOT = path.join(REPO_ROOT, 'content');
export const MEDIA_DIR = path.join(CONTENT_ROOT, 'media');

export function contentPath(...segments) {
  return path.join(CONTENT_ROOT, ...segments);
}

/** Where a year's manifest is written. `.yml`, matching what already exists. */
export function manifestPath(year) {
  return path.join(MEDIA_DIR, `${year}.yml`);
}

/** An existing manifest for `year`, tolerating either extension. */
export function findManifestPath(year) {
  for (const ext of ['.yml', '.yaml']) {
    const candidate = path.join(MEDIA_DIR, `${year}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every year manifest on disk, oldest first. */
export function listManifestFiles() {
  if (!fs.existsSync(MEDIA_DIR)) return [];
  return fs
    .readdirSync(MEDIA_DIR)
    .filter((name) => /^\d{4}\.ya?ml$/i.test(name))
    .sort()
    .map((name) => path.join(MEDIA_DIR, name));
}

/**
 * Resolve a user-supplied path: expand a leading `~`, then make it absolute
 * against the current working directory. Windows-safe — everything goes
 * through node:path, and a path with spaces arrives from argv already intact,
 * so nothing here needs to quote or split it.
 */
export function expandPath(input) {
  if (!input) return '';
  let value = String(input).trim();
  // Strip one pair of surrounding quotes, which some shells hand through.
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.resolve(os.homedir(), value.slice(2));
  }
  return path.resolve(value);
}

/** A path as shown to a human: relative to the repo, forward slashes. */
export function displayPath(absolute) {
  const relative = path.relative(REPO_ROOT, absolute);
  if (!relative || relative.startsWith('..')) return absolute;
  return relative.split(path.sep).join('/');
}

/* ==========================================================================
   Filesystem
   ========================================================================== */

export function fileExists(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Write via a temp file in the same directory, then rename over the target.
 * Rename is atomic on NTFS and on POSIX filesystems alike, so the manifest is
 * either the old file or the new one and never a truncated hybrid.
 */
export function writeFileAtomic(file, contents) {
  ensureDir(path.dirname(file));
  const temp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.writeFileSync(temp, contents, 'utf8');
  try {
    fs.renameSync(temp, file);
  } catch (err) {
    try {
      fs.unlinkSync(temp);
    } catch {
      /* the rename already failed; nothing useful left to do */
    }
    throw err;
  }
}

/* ==========================================================================
   Strings
   ==========================================================================
   `slugify` mirrors src/lib/utils.ts exactly. A file scaffolded here has to
   land on the same slug the site derives at build time, and Balkan names are
   the reason the transliteration table exists at all: `Dorde` written properly
   must not collapse to `or-e`. Keep the two implementations in step. */

const TRANSLITERATE = {
  đ: 'd',
  ð: 'd',
  ø: 'o',
  ł: 'l',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  þ: 'th',
  ħ: 'h',
  ı: 'i',
};

export function slugify(input) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[đðøłßæœþħı]/g, (char) => TRANSLITERATE[char] ?? char)
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** `serbia-summer` to `Serbia Summer`. A starting point, not a final title. */
export function titleCase(slug) {
  return String(slug ?? '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** `0007` */
export function padNumber(value, width = 4) {
  return String(value).padStart(width, '0');
}

export const EVERYDAY_KEY = 'everyday';

/** `2026-serbia-0007` — stable, human-readable, never reused. */
export function formatItemId(year, album, number) {
  return `${year}-${album || EVERYDAY_KEY}-${padNumber(number)}`;
}

/* ==========================================================================
   Reading
   ========================================================================== */

/**
 * Load a year manifest as a YAML *Document* rather than a plain object.
 * Keeping the document means comments and formatting written by hand survive
 * every subsequent import.
 */
export function loadManifestDoc(year) {
  const existing = findManifestPath(year);

  if (existing) {
    const raw = fs.readFileSync(existing, 'utf8');
    const doc = YAML.parseDocument(raw);
    if (doc.errors.length > 0) {
      throw new Error(
        `${displayPath(existing)} is not valid YAML: ${doc.errors[0].message}\n` +
          'Fix it by hand (or run `npm run media:check`) before importing.',
      );
    }
    if (doc.contents === null || !YAML.isMap(doc.contents)) {
      // Empty file, or a scalar. Treat it as a fresh manifest rather than
      // refusing — it is almost always a `new:year` file nobody filled in.
      return { doc: createManifestDoc(year), file: existing, existed: false };
    }
    if (doc.get('year') === undefined) doc.set('year', Number(year));
    return { doc, file: existing, existed: true };
  }

  return { doc: createManifestDoc(year), file: manifestPath(year), existed: false };
}

export function createManifestDoc(year) {
  return new YAML.Document({ year: Number(year), albums: [], items: [] });
}

/** Plain JS parse — for read-only consumers like `media:check`. */
export function readManifestFile(file) {
  return YAML.parse(fs.readFileSync(file, 'utf8'));
}

export function saveManifestDoc(doc, file) {
  // lineWidth: 0 disables folding. A base64 lqip has to stay on one line or
  // the file stops being pleasant to read and to diff.
  writeFileAtomic(file, doc.toString({ lineWidth: 0 }));
}

/* ==========================================================================
   Albums
   ========================================================================== */

function ensureSeq(doc, key) {
  let node = doc.get(key, true);
  if (!YAML.isSeq(node)) {
    node = new YAML.YAMLSeq();
    doc.set(key, node);
  }
  // An empty sequence round-trips as `[]`; the moment it gains an entry it has
  // to become a block sequence or the file stops being readable.
  node.flow = false;
  return node;
}

export function albumsSeq(doc) {
  return ensureSeq(doc, 'albums');
}

export function itemsSeq(doc) {
  return ensureSeq(doc, 'items');
}

/** Album slugs already present, in file order. */
export function albumSlugs(doc) {
  const seq = doc.get('albums', true);
  if (!YAML.isSeq(seq)) return [];
  return seq.items
    .map((node) => (YAML.isMap(node) ? node.get('slug') : undefined))
    .filter(Boolean)
    .map(String);
}

export function findAlbumNode(doc, slug) {
  const seq = doc.get('albums', true);
  if (!YAML.isSeq(seq)) return null;
  return (
    seq.items.find((node) => YAML.isMap(node) && String(node.get('slug')) === slug) ??
    null
  );
}

/**
 * Add an album if it is new.
 *
 * The date is left out rather than written blank on purpose: an empty string
 * would sort the album to 1970 in the timeline, while a missing key is exactly
 * what the site already treats as "undated". A trailing comment tells Dali
 * what to add.
 */
export function addAlbum(
  doc,
  { slug, title, subtitle, date, location, cover, note, featured, hidden } = {},
) {
  if (!slug) throw new Error('addAlbum needs a slug.');
  if (findAlbumNode(doc, slug)) return false;

  const value = { slug, title: title || titleCase(slug) };
  if (subtitle) value.subtitle = subtitle;
  // Always a string. A bare `2019` is a YAML number, and album ordering calls
  // .localeCompare on this — the loader now coerces it on the way back in, but
  // there is no reason to write the ambiguous form in the first place.
  if (date) value.date = String(date);
  if (location) value.location = location;
  if (cover) value.cover = cover;
  if (note) value.note = note;
  // Only when true. `featured: false` is the default and writing it is noise —
  // the same rule the item writer follows.
  if (featured === true) value.featured = true;
  if (hidden === true) value.hidden = true;

  const node = doc.createNode(value);
  if (!date) {
    node.comment = ' date: YYYY-MM  <- add this so albums sort by when they happened';
  }
  albumsSeq(doc).add(node);
  return true;
}

/** Album fields a person writes. `slug` is not among them — it is the URL. */
export const EDITABLE_ALBUM_FIELDS = [
  'title',
  'subtitle',
  'date',
  'location',
  'note',
  'cover',
  'featured',
  'hidden',
];

/**
 * Update an album that already exists, in place.
 *
 * `addAlbum` refuses to touch an album it did not create, which is right for an
 * importer — a run that quietly rewrote the title of an album you had already
 * captioned would be a bad surprise. But the admin UI has to be able to correct
 * a title or add the date the importer left as a comment, so that path lives
 * here rather than as a second implementation inside the route.
 *
 * Only the keys actually passed are touched, so a form that submits three
 * fields cannot erase the other four. An empty string removes a key rather than
 * writing a blank one, matching the item editor: the site distinguishes a
 * missing field from an empty one, and a manifest full of `subtitle: ''` is
 * unreadable.
 *
 * Returns false if there is no such album.
 */
export function updateAlbum(doc, slug, fields = {}) {
  const node = findAlbumNode(doc, slug);
  if (!node) return false;

  for (const key of EDITABLE_ALBUM_FIELDS) {
    if (!(key in fields)) continue;
    const value = fields[key];

    if (value === '' || value === undefined || value === null || value === false) {
      node.delete(key);
    } else {
      node.set(key, value);
    }
  }

  // The placeholder comment addAlbum leaves has done its job once a date exists.
  if (node.get('date')) node.comment = undefined;

  return true;
}

/**
 * Remove an album, and hand its photographs back to the year.
 *
 * Deleting the entry alone would leave every item pointing at an album that no
 * longer exists. The loader survives that — it warns and files them under
 * everyday — but a manifest that needs forgiving is a manifest that is wrong,
 * so the items are updated to match rather than left to be tolerated.
 *
 * Nothing is deleted from the bucket and no photograph is lost: they move from
 * "in this album" to "in this year". Removing the *photographs* is a separate
 * decision, taken one at a time, and this is not it.
 *
 * Returns { removed, moved } — or null when there is no such album.
 */
export function removeAlbum(doc, slug) {
  const seq = doc.get('albums', true);
  if (!YAML.isSeq(seq)) return null;

  const index = seq.items.findIndex(
    (node) => YAML.isMap(node) && String(node.get('slug')) === slug,
  );
  if (index === -1) return null;

  seq.delete(index);

  let moved = 0;
  for (const node of itemNodes(doc)) {
    if (String(node.get('album') ?? '') !== slug) continue;
    node.delete('album');
    moved += 1;
  }

  return { removed: true, moved };
}

/* ==========================================================================
   Items
   ========================================================================== */

/**
 * Canonical key order: identity first, then where the pixels are, then the
 * things a human writes, then the machine-generated tail. Anything undefined,
 * null or empty is dropped rather than written as a blank line.
 *
 * `orientation` is deliberately absent — the site derives it from width and
 * height, and a stored copy would only ever go stale.
 */
const ITEM_KEY_ORDER = [
  'id',
  'type',
  'album',
  'publicId',
  'width',
  'height',
  'variants',
  'formats',
  'capturedAt',
  'caption',
  'alt',
  'location',
  'featured',
  'hidden',
  'lqip',
  'color',
  'duration',
  'poster',
  'originalFilename',
  'originalExt',
  'hash',
];

/** Keys whose array values stay on one line, because they are data not prose. */
const FLOW_KEYS = new Set(['variants', 'formats']);

function orderedItem(item) {
  const out = {};
  for (const key of ITEM_KEY_ORDER) {
    const value = item[key];
    if (value === undefined || value === null || value === '') continue;
    // `featured: false` is the default. Writing it 500 times helps nobody.
    if (key === 'featured' && value !== true) continue;
    out[key] = value;
  }
  return out;
}

export function itemNodes(doc) {
  const seq = doc.get('items', true);
  return YAML.isSeq(seq) ? seq.items.filter((node) => YAML.isMap(node)) : [];
}

export function findItemNodeByHash(doc, hash) {
  if (!hash) return null;
  return itemNodes(doc).find((node) => String(node.get('hash') ?? '') === hash) ?? null;
}

export function findItemNodeById(doc, id) {
  return itemNodes(doc).find((node) => String(node.get('id') ?? '') === id) ?? null;
}

export function findItemNodeByPublicId(doc, publicId) {
  return (
    itemNodes(doc).find((node) => String(node.get('publicId') ?? '') === publicId) ?? null
  );
}

/**
 * The next free number for `year` + `album`. Reads the highest number already
 * used by an id with that prefix and continues from there, so deleting an item
 * never causes its id to be handed to a different photograph later.
 */
export function nextItemNumber(doc, year, album) {
  const prefix = `${year}-${album || EVERYDAY_KEY}-`;
  let highest = 0;
  for (const node of itemNodes(doc)) {
    const id = String(node.get('id') ?? '');
    if (!id.startsWith(prefix)) continue;
    const number = Number.parseInt(id.slice(prefix.length), 10);
    if (Number.isFinite(number) && number > highest) highest = number;
  }
  return highest + 1;
}

/**
 * Append one item. `capturedAtInferred` adds a trailing comment rather than a
 * field, so the manifest keeps only the shape the site's types describe while
 * still telling the truth about where the date came from.
 */
export function addItem(doc, item, { capturedAtInferred = false } = {}) {
  const node = doc.createNode(orderedItem(item));

  // `variants: [320, 640, 1024]` on one line rather than six. These are data,
  // and a manifest is meant to stay readable by a human in twenty years.
  for (const pair of node.items ?? []) {
    if (FLOW_KEYS.has(String(pair.key?.value)) && YAML.isSeq(pair.value)) {
      pair.value.flow = true;
    }
  }

  if (capturedAtInferred && item.capturedAt) {
    const pair = node.items.find((entry) => String(entry.key?.value) === 'capturedAt');
    if (pair && pair.value && typeof pair.value === 'object') {
      pair.value.comment =
        ' inferred from the file date - the file carried no capture date';
    }
  }

  itemsSeq(doc).add(node);
  return node;
}

/**
 * Fields a script is allowed to overwrite on an item that already exists.
 * Caption, alt text, location and `featured` are absent from this list on
 * purpose: those are Dali's words, and no re-import may touch them.
 */
const TECHNICAL_KEYS = [
  'type',
  'album',
  'publicId',
  'width',
  'height',
  'variants',
  'formats',
  'lqip',
  'color',
  'duration',
  'poster',
  'originalFilename',
  'originalExt',
  'hash',
];

export function patchItemNode(node, item) {
  const changed = [];
  for (const key of TECHNICAL_KEYS) {
    const value = item[key];
    if (value === undefined || value === null || value === '') continue;
    if (String(node.get(key) ?? '') === String(value)) continue;
    // Keep width lists on one line here too. Without this a re-import turns a
    // readable `variants: [320, 640]` into six bullet points, which is exactly
    // the kind of slow rot that makes a hand-editable file stop being one.
    // The seq has to be built explicitly: setting a plain array stores the
    // array, and there is no node to hang the flow flag on.
    if (FLOW_KEYS.has(key) && Array.isArray(value)) {
      const seq = new YAML.YAMLSeq();
      for (const entry of value) seq.add(entry);
      seq.flow = true;
      node.set(key, seq);
    } else {
      node.set(key, value);
    }
    changed.push(key);
  }
  // Fill in a capture date only when the item does not already have one.
  if (item.capturedAt && !node.get('capturedAt')) {
    node.set('capturedAt', item.capturedAt);
    changed.push('capturedAt');
  }
  return changed;
}

/** Every id used in this document — the uniqueness check's input. */
export function itemIds(doc) {
  return itemNodes(doc).map((node) => String(node.get('id') ?? ''));
}
