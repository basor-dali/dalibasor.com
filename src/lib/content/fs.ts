import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

/**
 * Filesystem access for /content.
 *
 * Everything here runs on the server only. Results are memoised per process, so
 * a static build reads each file once no matter how many pages reference it —
 * and in development the same cache is invalidated on every write to /content
 * rather than turned off, for reasons set out at `once` below.
 */

export const CONTENT_ROOT = path.join(process.cwd(), 'content');

export function contentPath(...segments: string[]): string {
  return path.join(CONTENT_ROOT, ...segments);
}

/** Recursively lists files under `dir` matching one of `extensions`. */
export function walk(dir: string, extensions: string[]): string[] {
  if (!fs.existsSync(dir)) return [];

  const out: string[] = [];
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      // Skip dotfiles and editor cruft so a stray .DS_Store never becomes a page.
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        out.push(full);
      }
    }
  }

  return out.sort();
}

export type ParsedFile<T> = {
  data: T;
  body: string;
  /** Path relative to the repo root, for diagnostics. */
  sourcePath: string;
  /** Filename without extension — the default slug. */
  basename: string;
};

export function readMdx<T>(absolutePath: string): ParsedFile<T> {
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const parsed = matter(raw);
  return {
    data: parsed.data as T,
    body: parsed.content.trim(),
    sourcePath: path.relative(process.cwd(), absolutePath).split(path.sep).join('/'),
    basename: path.basename(absolutePath).replace(/\.mdx?$/i, ''),
  };
}

export function readText(absolutePath: string): string | null {
  try {
    return fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return null;
  }
}

export function listDirectories(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

/* ==========================================================================
   Development: cache, but notice when a file changes
   ==========================================================================

   A static build is a short-lived process, so memoising for its lifetime is
   exactly right. A dev server is long-lived, and the same memoisation means
   content written while it runs never appears — save a post in Keystatic, drag
   a photograph into /admin/media, or hand-edit a manifest, and the page keeps
   serving whatever was on disk at boot. The admin tools write files for a
   living, so that made them look broken: an upload would succeed and its album
   page would 404 until a restart.

   The first fix was to stop memoising in dev altogether. That is correct and
   unusably slow, because the cost is not "a few milliseconds": every reference
   to a cover image calls findMediaByRef, which parses the entire photo archive
   from YAML. With one 500-photograph year on disk the homepage took 31s to
   render, and it grows with both the number of posts and the size of the
   archive. A twenty-year archive would never finish.

   So: memoise in dev too, and watch /content. Any write bumps a generation
   counter and every cached loader reloads on its next call. Two independent
   triggers, because a missed invalidation is the bug that started all this:

     1. fs.watch, which catches hand-edits, Keystatic, and git checkouts.
     2. invalidateContent(), called directly by the admin routes that write.

   If the watcher cannot start, we fall back to not caching — slow beats
   serving stale content out of a tool whose whole job is editing it. */

let generation = 0;
let watcherState: 'unstarted' | 'watching' | 'unavailable' = 'unstarted';

/** Force every cached loader to reload. Call after writing into /content. */
export function invalidateContent(): void {
  generation += 1;
}

function watchingContent(): boolean {
  if (watcherState !== 'unstarted') return watcherState === 'watching';

  try {
    if (!fs.existsSync(CONTENT_ROOT)) {
      // Nothing to watch yet. Stay 'unstarted' so a later call tries again
      // once the directory exists.
      return false;
    }
    // `persistent: false` so the watcher never holds the process open.
    const watcher = fs.watch(
      CONTENT_ROOT,
      { recursive: true, persistent: false },
      invalidateContent,
    );
    // A watcher error (an unmounted share, a deleted root) must not take the
    // dev server down; drop to the uncached path instead.
    watcher.on('error', () => {
      watcherState = 'unavailable';
      invalidateContent();
    });
    watcherState = 'watching';
  } catch {
    watcherState = 'unavailable';
  }

  return watcherState === 'watching';
}

/**
 * Memoise a zero-argument loader for the life of the process.
 *
 * Next runs a static build in a handful of workers; each pays the read cost
 * once. Simpler and faster than React's `cache()` here because none of this is
 * request-scoped. In development the cache is invalidated by writes to
 * /content — see above.
 */
export function once<T>(loader: () => T): () => T {
  const production = process.env.NODE_ENV === 'production';

  let value: T;
  let loadedAt = -1;

  return () => {
    if (!production && !watchingContent()) return loader();

    // Read the generation *before* loading, so a write that lands while the
    // loader is running invalidates the result rather than being swallowed.
    const current = production ? 0 : generation;
    if (loadedAt !== current) {
      value = loader();
      loadedAt = current;
    }
    return value;
  };
}

/** Drafts are visible while developing and invisible in production. */
export const showDrafts = process.env.NODE_ENV !== 'production';
