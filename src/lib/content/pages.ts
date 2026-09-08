import 'server-only';

import fs from 'node:fs';
import { toPlainText } from '@/lib/utils';
import { contentPath, once, readMdx } from './fs';

/**
 * Standalone pages whose body Dali writes but whose layout is fixed — About,
 * and anything else that is one-of-a-kind. Same MDX pipeline, no listing.
 */

export type StandalonePage = {
  slug: string;
  title?: string;
  subtitle?: string;
  coverImage?: string;
  coverAlt?: string;
  placeholder: boolean;
  body: string;
  plain: string;
  /** Free-form frontmatter — About uses `timeline`, `links`, `elsewhere`. */
  data: Record<string, unknown>;
};

type PageFrontmatter = {
  title?: string;
  subtitle?: string;
  coverImage?: string;
  coverAlt?: string;
  placeholder?: boolean;
  [key: string]: unknown;
};

const loadPages = once((): Map<string, StandalonePage> => {
  const pages = new Map<string, StandalonePage>();
  const dir = contentPath('pages');
  if (!fs.existsSync(dir)) return pages;

  for (const name of fs.readdirSync(dir)) {
    if (!/\.mdx?$/i.test(name) || name.startsWith('.')) continue;
    const { data, body, basename } = readMdx<PageFrontmatter>(contentPath('pages', name));
    pages.set(basename, {
      slug: basename,
      title: data?.title,
      subtitle: data?.subtitle,
      coverImage: data?.coverImage,
      coverAlt: data?.coverAlt,
      placeholder: Boolean(data?.placeholder),
      body,
      plain: toPlainText(body),
      data: (data ?? {}) as Record<string, unknown>,
    });
  }

  return pages;
});

export function getPage(slug: string): StandalonePage | undefined {
  return loadPages().get(slug);
}

export function getAllPages(): StandalonePage[] {
  return [...loadPages().values()];
}

/* --- About's optional timeline -------------------------------------------- */

export type TimelineEntry = {
  /** `1993`, `2011`, `2019 — 2024`. Free text; it is a label, not a date. */
  when: string;
  what: string;
  where?: string;
};

export function getAboutTimeline(): TimelineEntry[] {
  const raw = getPage('about')?.data.timeline;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is TimelineEntry => Boolean(entry && typeof entry === 'object'))
    .map((entry) => ({
      when: String(entry.when ?? ''),
      what: String(entry.what ?? ''),
      where: entry.where ? String(entry.where) : undefined,
    }))
    .filter((entry) => entry.when && entry.what);
}
