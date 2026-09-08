import 'server-only';

import type { CoverShape, Post, PostSummary, WritingFrontmatter } from '@/types/content';
import {
  readingMinutes,
  slugify,
  toDateString,
  toPlainText,
  yearOf,
} from '@/lib/utils';
import { contentPath, once, readMdx, showDrafts, walk } from './fs';

/* ==========================================================================
   Loading
   ========================================================================== */

const loadAll = once((): Post[] => {
  const files = walk(contentPath('writing'), ['.mdx', '.md']);

  const posts = files.map((file): Post => {
    const { data, body, sourcePath, basename } = readMdx<WritingFrontmatter>(file);

    if (!data?.title) {
      throw new Error(`Missing "title" in frontmatter: ${sourcePath}`);
    }
    if (!data?.date) {
      throw new Error(`Missing "date" in frontmatter: ${sourcePath}`);
    }

    const slug = data.slug?.trim() || slugify(basename);
    const plain = toPlainText(body);
    const tags = normalizeTags(data.tags);

    return {
      slug,
      href: `/writing/${slug}`,
      title: data.title,
      subtitle: data.subtitle,
      date: toDateString(data.date),
      year: yearOf(toDateString(data.date)),
      tags,
      coverImage: data.coverImage,
      coverAlt: data.coverAlt,
      coverShape: (data.coverShape ?? 'wide') as CoverShape,
      location: data.location,
      featured: Boolean(data.featured),
      draft: Boolean(data.draft),
      excerpt: data.excerpt,
      placeholder: Boolean(data.placeholder),
      body,
      plain,
      readingMinutes: readingMinutes(plain),
      sourcePath,
    };
  });

  const seen = new Map<string, string>();
  for (const post of posts) {
    const existing = seen.get(post.slug);
    if (existing) {
      throw new Error(
        `Duplicate writing slug "${post.slug}" in ${post.sourcePath} and ${existing}. ` +
          'Slugs are permanent URLs — pick a different filename or set `slug:` explicitly.',
      );
    }
    seen.set(post.slug, post.sourcePath);
  }

  // Newest first. Ties broken by slug so builds are byte-identical.
  return posts.sort(
    (a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug),
  );
});

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const cleaned = tags
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    // Preserve the author's capitalisation for display; dedupe case-insensitively.
    .filter((tag, index, all) => all.findIndex((t) => t.toLowerCase() === tag.toLowerCase()) === index);
  return cleaned;
}

function visible(posts: Post[]): Post[] {
  return showDrafts ? posts : posts.filter((post) => !post.draft);
}

export function summarize(post: Post): PostSummary {
  const { body: _body, plain: _plain, sourcePath: _sourcePath, ...rest } = post;
  return rest;
}

/* ==========================================================================
   Public API
   ========================================================================== */

/** Every published post, newest first. */
export function getPosts(): PostSummary[] {
  return visible(loadAll()).map(summarize);
}

/** Full post including the MDX body. */
export function getPost(slug: string): Post | undefined {
  return visible(loadAll()).find((post) => post.slug === slug);
}

/** Slugs for `generateStaticParams`. Includes drafts in dev only. */
export function getPostSlugs(): string[] {
  return visible(loadAll()).map((post) => post.slug);
}

export function getFeaturedPosts(limit = 5): PostSummary[] {
  const posts = visible(loadAll());
  const featured = posts.filter((post) => post.featured);
  const rest = posts.filter((post) => !post.featured);
  return [...featured, ...rest].slice(0, limit).map(summarize);
}

export function getRecentPosts(limit = 5): PostSummary[] {
  return getPosts().slice(0, limit);
}

/* --- tags ----------------------------------------------------------------- */

export type TagCount = { tag: string; slug: string; count: number };

export function getTags(): TagCount[] {
  const counts = new Map<string, TagCount>();

  for (const post of visible(loadAll())) {
    for (const tag of post.tags) {
      const key = slugify(tag);
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { tag, slug: key, count: 1 });
      }
    }
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
  );
}

export function getPostsByTag(tagSlug: string): PostSummary[] {
  return visible(loadAll())
    .filter((post) => post.tags.some((tag) => slugify(tag) === tagSlug))
    .map(summarize);
}

export function getTagLabel(tagSlug: string): string | undefined {
  return getTags().find((tag) => tag.slug === tagSlug)?.tag;
}

/* --- years ---------------------------------------------------------------- */

export type PostsByYear = { year: number; posts: PostSummary[] };

export function getPostsGroupedByYear(): PostsByYear[] {
  const groups = new Map<number, PostSummary[]>();

  for (const post of getPosts()) {
    const bucket = groups.get(post.year);
    if (bucket) bucket.push(post);
    else groups.set(post.year, [post]);
  }

  return [...groups.entries()]
    .map(([year, posts]) => ({ year, posts }))
    .sort((a, b) => b.year - a.year);
}

export function getWritingYears(): number[] {
  return [...new Set(getPosts().map((post) => post.year))].sort((a, b) => b - a);
}

/* --- neighbours & relations ---------------------------------------------- */

export type PostNeighbours = {
  /** The post published before this one — older. */
  previous?: PostSummary;
  /** The post published after this one — newer. */
  next?: PostSummary;
};

export function getPostNeighbours(slug: string): PostNeighbours {
  const posts = getPosts();
  const index = posts.findIndex((post) => post.slug === slug);
  if (index === -1) return {};
  // The list runs newest → oldest.
  return {
    next: index > 0 ? posts[index - 1] : undefined,
    previous: index < posts.length - 1 ? posts[index + 1] : undefined,
  };
}

/**
 * Related posts, ranked by shared tags then by closeness in time. Simple on
 * purpose — with 500 posts this still runs in under a millisecond, and the
 * results are more honest than anything cleverer.
 */
export function getRelatedPosts(slug: string, limit = 3): PostSummary[] {
  const posts = getPosts();
  const current = posts.find((post) => post.slug === slug);
  if (!current) return [];

  const currentTags = new Set(current.tags.map((tag) => tag.toLowerCase()));
  const currentTime = new Date(current.date).getTime();

  return posts
    .filter((post) => post.slug !== slug)
    .map((post) => {
      const shared = post.tags.filter((tag) => currentTags.has(tag.toLowerCase())).length;
      const monthsApart =
        Math.abs(new Date(post.date).getTime() - currentTime) / (1000 * 60 * 60 * 24 * 30);
      return { post, score: shared * 100 - Math.min(monthsApart, 99) };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.post);
}

/** Every post including drafts and bodies — for feeds and the search index. */
export function getAllPostsWithBodies(): Post[] {
  return visible(loadAll());
}
