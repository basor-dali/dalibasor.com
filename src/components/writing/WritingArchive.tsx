'use client';

import { useDeferredValue, useId, useMemo, useState, type ReactNode } from 'react';
import type { PostSummary } from '@/types/content';
import { EmptyState, Label } from '@/components/primitives';
import { cx, pluralize, slugify } from '@/lib/utils';
import { ArticlePreview } from './ArticlePreview';

/**
 * The chronological index, with filters.
 *
 * Everything here happens in memory against `PostSummary[]` — no bodies, no
 * network, no index to rebuild. At five hundred entries the filtering is a
 * single pass over an array of pre-lowercased strings, which costs less than
 * the keystroke that triggered it.
 *
 * Progressive enhancement: the full archive is server-rendered, so with
 * scripting off every entry is present and only the controls disappear.
 */

export type WritingArchiveTag = { tag: string; slug: string; count: number };

export type WritingArchiveProps = {
  posts: PostSummary[];
  /** Omit to hide the tag filter entirely — tag pages are already scoped. */
  tags?: WritingArchiveTag[];
  /** Tag chips shown before "all subjects" is expanded. */
  visibleTagCount?: number;
  /** Shown when the archive itself is empty, before any filtering. */
  emptyTitle?: string;
  emptyBody?: string;
  className?: string;
};

type YearFilter = number | 'all';

const NOSCRIPT_CSS = '.js-writing-filters{display:none!important}';

export function WritingArchive({
  posts,
  tags,
  visibleTagCount = 12,
  emptyTitle = 'Nothing here yet',
  emptyBody = 'The first entries are still being written.',
  className,
}: WritingArchiveProps) {
  const searchId = useId();

  const [query, setQuery] = useState('');
  const [year, setYear] = useState<YearFilter>('all');
  const [tag, setTag] = useState<string>('all');
  const [allTagsShown, setAllTagsShown] = useState(false);

  const deferredQuery = useDeferredValue(query);

  /* --- derived, once ----------------------------------------------------- */

  const years = useMemo(
    () => [...new Set(posts.map((post) => post.year))].sort((a, b) => b - a),
    [posts],
  );

  /** One lowercased haystack per post: title, subtitle, excerpt, tags, year. */
  const haystacks = useMemo(() => {
    const map = new Map<string, string>();
    for (const post of posts) {
      map.set(
        post.slug,
        [post.title, post.subtitle ?? '', post.excerpt ?? '', post.tags.join(' '), post.year]
          .join(' ')
          .toLowerCase(),
      );
    }
    return map;
  }, [posts]);

  const tagSlugs = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const post of posts) map.set(post.slug, post.tags.map((value) => slugify(value)));
    return map;
  }, [posts]);

  /* --- filtering --------------------------------------------------------- */

  const terms = useMemo(
    () => deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [deferredQuery],
  );

  const filtered = useMemo(() => {
    if (terms.length === 0 && year === 'all' && tag === 'all') return posts;

    return posts.filter((post) => {
      if (year !== 'all' && post.year !== year) return false;
      if (tag !== 'all' && !(tagSlugs.get(post.slug) ?? []).includes(tag)) return false;
      if (terms.length === 0) return true;
      const haystack = haystacks.get(post.slug) ?? '';
      return terms.every((term) => haystack.includes(term));
    });
  }, [posts, terms, year, tag, haystacks, tagSlugs]);

  /** Newest first is preserved from the server, so groups stay in order. */
  const groups = useMemo(() => {
    const map = new Map<number, PostSummary[]>();
    for (const post of filtered) {
      const bucket = map.get(post.year);
      if (bucket) bucket.push(post);
      else map.set(post.year, [post]);
    }
    return [...map.entries()]
      .map(([groupYear, groupPosts]) => ({ year: groupYear, posts: groupPosts }))
      .sort((a, b) => b.year - a.year);
  }, [filtered]);

  const filtering = terms.length > 0 || year !== 'all' || tag !== 'all';

  function clearAll() {
    setQuery('');
    setYear('all');
    setTag('all');
  }

  /* --- empty archive ----------------------------------------------------- */

  if (posts.length === 0) {
    return (
      <div className={className}>
        <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>
      </div>
    );
  }

  const shownTags = tags ? (allTagsShown ? tags : tags.slice(0, visibleTagCount)) : [];
  const hiddenTagCount = tags ? Math.max(0, tags.length - visibleTagCount) : 0;

  return (
    <div className={className}>
      <noscript>
        <style dangerouslySetInnerHTML={{ __html: NOSCRIPT_CSS }} />
      </noscript>

      {/* --- controls ----------------------------------------------------- */}
      <div className="js-writing-filters">
        <div className="u-grid items-end">
          <div className="col-span-2 md:col-span-6 lg:col-span-5">
            <label htmlFor={searchId} className="u-label mb-3 block text-muted">
              Search
            </label>
            <div className="relative flex items-center border-b border-line transition-colors duration-300 focus-within:border-ember">
              <input
                id={searchId}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Title, subject or year"
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-transparent py-3 pr-16 text-lg text-ivory outline-none placeholder:text-base placeholder:text-muted"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="u-label absolute right-0 text-muted transition-colors duration-300 hover:text-ivory"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div
            role="group"
            aria-label="Filter by year"
            className="col-span-2 md:col-span-6 lg:col-span-6 lg:col-start-7"
          >
            <Label className="mb-3 block">Year</Label>
            <div className="flex flex-wrap gap-2">
              <FilterButton active={year === 'all'} onClick={() => setYear('all')}>
                All
              </FilterButton>
              {years.map((value) => (
                <FilterButton
                  key={value}
                  active={year === value}
                  onClick={() => setYear(year === value ? 'all' : value)}
                >
                  <span className="u-nums">{value}</span>
                </FilterButton>
              ))}
            </div>
          </div>
        </div>

        {tags && tags.length > 0 ? (
          <div role="group" aria-label="Filter by subject" className="mt-10">
            <Label className="mb-3 block">Subject</Label>
            <div className="flex flex-wrap gap-2">
              <FilterButton active={tag === 'all'} onClick={() => setTag('all')}>
                All
              </FilterButton>
              {shownTags.map((entry) => (
                <FilterButton
                  key={entry.slug}
                  active={tag === entry.slug}
                  onClick={() => setTag(tag === entry.slug ? 'all' : entry.slug)}
                >
                  {entry.tag}
                  <span className="u-nums ml-2 opacity-70">{entry.count}</span>
                </FilterButton>
              ))}
              {hiddenTagCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setAllTagsShown((value) => !value)}
                  aria-expanded={allTagsShown}
                  className="u-label px-3 py-2 text-muted underline decoration-line-strong underline-offset-4 transition-colors duration-300 hover:text-ivory"
                >
                  {allTagsShown ? 'Fewer subjects' : `${hiddenTagCount} more`}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* --- count -------------------------------------------------------- */}
      <div className="mt-12 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 border-b border-line-strong pb-4">
        <p className="u-label u-nums text-muted" aria-live="polite">
          {filtering
            ? `${filtered.length} of ${posts.length} ${posts.length === 1 ? 'entry' : 'entries'}`
            : pluralize(posts.length, 'entry', 'entries')}
        </p>
        {filtering ? (
          <button
            type="button"
            onClick={clearAll}
            className="js-writing-filters u-label text-ember transition-colors duration-300 hover:text-white"
          >
            Reset filters
          </button>
        ) : null}
      </div>

      {/* --- the index ---------------------------------------------------- */}
      {groups.length === 0 ? (
        <EmptyState title="Nothing matches" className="mt-16">
          Try a shorter search, or reset the filters.
        </EmptyState>
      ) : (
        <div>
          {groups.map((group) => (
            <section
              key={group.year}
              className="u-grid pt-10 pb-(--spacing-section-sm) last:pb-0"
            >
              <div className="col-span-2 self-start md:col-span-6 lg:sticky lg:top-[calc(var(--nav-height)_+_2.5rem)] lg:col-span-3">
                <h3 className="u-display u-display-tight u-nums text-3xl text-mute 2xl:text-4xl">
                  {group.year}
                </h3>
                <p className="u-label mt-4 text-muted">
                  {pluralize(group.posts.length, 'entry', 'entries')}
                </p>
              </div>

              <ol className="col-span-2 m-0 list-none p-0 md:col-span-6 lg:col-span-9">
                {group.posts.map((post) => (
                  <li key={post.slug}>
                    <ArticlePreview post={post} variant="row" headingLevel={4} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* --- a filter chip -------------------------------------------------------- */

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'u-label border px-3 py-2 transition-colors duration-300',
        active
          ? 'border-ember/60 bg-ember-deep/10 text-ember'
          : 'border-line text-muted hover:border-line-strong hover:text-ivory',
      )}
    >
      {children}
    </button>
  );
}
