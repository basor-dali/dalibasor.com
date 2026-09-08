import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

/**
 * Filesystem access for /content.
 *
 * Everything here runs at build time only. Results are memoised per process:
 * a static build reads each file once no matter how many pages reference it.
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

/**
 * Memoise a zero-argument loader for the life of the process.
 *
 * Next runs a static build in a handful of workers; each pays the read cost
 * once. Simpler and faster than React's `cache()` here because none of this
 * is request-scoped.
 */
export function once<T>(loader: () => T): () => T {
  let value: T;
  let loaded = false;
  return () => {
    if (!loaded) {
      value = loader();
      loaded = true;
    }
    return value;
  };
}

/** Drafts are visible while developing and invisible in production. */
export const showDrafts = process.env.NODE_ENV !== 'production';
