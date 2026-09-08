'use client';

import Link from 'next/link';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { SearchDoc } from '@/types/content';
import { EmptyState } from '@/components/primitives';
import { cx, ordinalLabel, pluralize } from '@/lib/utils';

/**
 * Search.
 *
 * The whole index is one static JSON file. It is fetched on the first real
 * interaction — a focus, a keystroke, or arriving with `?q=` already in the
 * URL — and never on mount, so a visitor who scrolls past this page pays
 * nothing for it. Everything after that is a loop over an array in memory.
 *
 * No search library. The ranking below is thirty lines and is honest about
 * what it does: every word you typed has to appear somewhere, a hit in the
 * title beats a hit in a tag, and a tag beats a hit in the body.
 */

type Kind = SearchDoc['kind'];

export type SearchCount = { label: string; value: number };

const INDEX_URL = '/search-index.json';
const MAX_RESULTS = 60;

const GROUPS: { label: string; kinds: Kind[] }[] = [
  { label: 'Writing', kinds: ['post'] },
  { label: 'Projects', kinds: ['project'] },
  { label: 'Photographs', kinds: ['album', 'year'] },
  { label: 'Now', kinds: ['now'] },
  { label: 'Pages', kinds: ['page'] },
];

/* ==========================================================================
   Ranking
   ========================================================================== */

function tokenize(value: string): string[] {
  const found = value.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  // Eight words is already an unusual query; past that it is a paste.
  return found ? found.slice(0, 8) : [];
}

/** True when `index` begins a word — which is what makes prefixes rank well. */
function isWordStart(haystack: string, index: number): boolean {
  if (index === 0) return true;
  return !/[\p{L}\p{N}]/u.test(haystack.charAt(index - 1));
}

function scoreDoc(doc: SearchDoc, tokens: string[]): number {
  const title = doc.title.toLowerCase();
  const tags = doc.tags && doc.tags.length > 0 ? doc.tags.join(' ').toLowerCase() : '';
  let score = 0;

  for (const token of tokens) {
    let best = 0;

    const inTitle = title.indexOf(token);
    if (inTitle > -1) best = inTitle === 0 ? 60 : isWordStart(title, inTitle) ? 46 : 26;

    if (tags) {
      const inTags = tags.indexOf(token);
      if (inTags > -1) best = Math.max(best, isWordStart(tags, inTags) ? 24 : 14);
    }

    const inText = doc.text.indexOf(token);
    if (inText > -1) best = Math.max(best, isWordStart(doc.text, inText) ? 9 : 4);

    // Every word has to land somewhere, or this is not what you meant.
    if (best === 0) return 0;
    score += best;
  }

  const phrase = tokens.join(' ');
  if (tokens.length > 1 && doc.text.includes(phrase)) score += 24;
  if (title === phrase) score += 50;

  // A hair of recency — only ever enough to break a tie.
  score += Math.min(40, Math.max(0, (doc.year ?? 1990) - 1990)) / 100;

  return score;
}

type Result = { doc: SearchDoc; score: number };

function runSearch(docs: SearchDoc[], tokens: string[]): Result[] {
  if (tokens.length === 0) return [];

  const scored: Result[] = [];
  for (const doc of docs) {
    const score = scoreDoc(doc, tokens);
    if (score > 0) scored.push({ doc, score });
  }

  return scored
    .sort(
      (a, b) => b.score - a.score || (b.doc.date ?? '').localeCompare(a.doc.date ?? ''),
    )
    .slice(0, MAX_RESULTS);
}

/**
 * A fragment of the indexed text around the first match, skipping past the
 * title — the heading is already on screen, showing it twice explains nothing.
 * The index is stored lowercased, so these read as what they are: raw index
 * material, set in mono to say so.
 */
function snippetFor(doc: SearchDoc, tokens: string[]): string | null {
  const heading = doc.title.toLowerCase().replace(/\s+/g, ' ').trim();
  const from = doc.text.startsWith(heading) ? heading.length : 0;

  let at = -1;
  for (const token of tokens) {
    const found = doc.text.indexOf(token, from);
    if (found > -1 && (at === -1 || found < at)) at = found;
  }
  if (at === -1) return null;

  const start = Math.max(from, at - 72);
  const end = Math.min(doc.text.length, at + 128);

  let body = doc.text.slice(start, end);
  if (start > from) body = body.replace(/^\S*\s/, '');
  if (end < doc.text.length) body = body.replace(/\s\S*$/, '');
  body = body.replace(/^[\s·]+/, '').replace(/[\s·]+$/, '');
  if (body.length < 12) return null;

  return `${start > from ? '… ' : ''}${body}${end < doc.text.length ? ' …' : ''}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (tokens.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="text-ember bg-transparent">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

/* ==========================================================================
   The component
   ========================================================================== */

type Status = 'idle' | 'loading' | 'ready' | 'error';

export function SearchClient({ counts = [] }: { counts?: SearchCount[] }) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [docs, setDocs] = useState<SearchDoc[] | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [focused, setFocused] = useState(false);
  const requested = useRef(false);

  /* --- the index -------------------------------------------------------- */

  const load = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    setStatus('loading');

    fetch(INDEX_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        const list = Array.isArray(data)
          ? data
          : ((data as { docs?: unknown }).docs ?? []);
        setDocs(Array.isArray(list) ? (list as SearchDoc[]) : []);
        setStatus('ready');
      })
      .catch(() => {
        // Let a retry through.
        requested.current = false;
        setStatus('error');
      });
  }, []);

  /* Arriving with ?q= is itself the interaction — a shared search should
     resolve without the visitor having to touch anything. */
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q');
    if (!initial || !initial.trim()) return;

    // Deferred by a tick rather than set synchronously: the server rendered an
    // empty field, so adopting the URL's query during the effect body would be
    // a cascading render on top of hydration.
    const id = setTimeout(() => {
      setQuery(initial);
      load();
    }, 0);
    return () => clearTimeout(id);
  }, [load]);

  /* Keep the URL in step so any search can be sent to someone. replaceState,
     not push — a search is not twenty entries in the back button. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if ((params.get('q') ?? '') === query) return;

    if (query) params.set('q', query);
    else params.delete('q');

    const rest = params.toString();
    window.history.replaceState(
      null,
      '',
      rest ? `${window.location.pathname}?${rest}` : window.location.pathname,
    );
  }, [query]);

  /* --- results ---------------------------------------------------------- */

  const deferred = useDeferredValue(query);
  const trimmed = deferred.trim();
  const tokens = useMemo(() => tokenize(deferred), [deferred]);
  const results = useMemo(() => (docs ? runSearch(docs, tokens) : []), [docs, tokens]);

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        label: group.label,
        items: results.filter((result) => group.kinds.includes(result.doc.kind)),
      })).filter((group) => group.items.length > 0),
    [results],
  );

  const statusLine =
    status === 'loading'
      ? 'Reading the index'
      : status === 'error'
        ? 'The index could not be loaded'
        : trimmed === ''
          ? ''
          : results.length === 0
            ? `Nothing for “${trimmed}”`
            : `${pluralize(results.length, 'result')}${
                results.length === MAX_RESULTS ? ' shown' : ''
              } for “${trimmed}”`;

  const showIdle = status !== 'error' && trimmed === '' && status !== 'loading';
  const showNothing = status === 'ready' && trimmed !== '' && results.length === 0;

  return (
    <div className="u-page pb-(--spacing-section)">
      {/* --- the field ---------------------------------------------------- */}
      <form
        role="search"
        onSubmit={(event) => event.preventDefault()}
        className="max-w-(--container-text-wide)"
      >
        <label htmlFor={inputId} className="u-label text-mute mb-5 block">
          Search everything
        </label>

        <div
          className={cx(
            'border-b transition-colors duration-500 ease-[var(--ease-out-expo)]',
            focused || query ? 'border-ember' : 'border-line-strong',
          )}
        >
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              load();
            }}
            onFocus={() => {
              setFocused(true);
              load();
            }}
            onBlur={() => setFocused(false)}
            placeholder="A word, a year, a place"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="u-display placeholder:text-mute w-full bg-transparent pb-5 text-2xl text-white placeholder:font-normal placeholder:opacity-100"
          />
        </div>

        <p role="status" aria-live="polite" className="u-label text-muted mt-5 min-h-4">
          {statusLine}
        </p>
      </form>

      {/* --- loading ------------------------------------------------------ */}
      {status === 'loading' ? (
        <div className="mt-(--spacing-section-sm)" aria-hidden="true">
          <div className="bg-ember-deep h-px w-full origin-left animate-[draw-rule_1.4s_ease-in-out_infinite]" />
        </div>
      ) : null}

      {/* --- results ------------------------------------------------------ */}
      {grouped.map((group) => (
        <section key={group.label} className="mt-(--spacing-section-sm)">
          <div className="border-line-strong flex items-baseline justify-between gap-6 border-b pb-3">
            <h2 className="u-label text-ember">{group.label}</h2>
            <span className="u-label u-nums text-mute">
              {ordinalLabel(group.items.length - 1)}
            </span>
          </div>

          <ul className="list-none p-0">
            {group.items.map((result, index) => {
              const snippet = snippetFor(result.doc, tokens);

              return (
                <li key={result.doc.id} className="border-line border-b">
                  <Link
                    href={result.doc.href}
                    className="group/row block py-7 md:grid md:grid-cols-12 md:gap-(--spacing-gutter)"
                  >
                    {/* Numbered within the group, most relevant first. */}
                    <span
                      aria-hidden="true"
                      className="u-label u-nums text-mute md:col-span-1"
                    >
                      {ordinalLabel(index)}
                    </span>

                    <div className="mt-3 md:col-span-8 md:mt-0">
                      <h3 className="u-display text-ivory text-xl transition-colors duration-300 group-hover/row:text-white">
                        <Highlight text={result.doc.title} tokens={tokens} />
                      </h3>
                      {snippet ? (
                        <p className="text-muted mt-3 font-mono text-xs leading-relaxed">
                          <Highlight text={snippet} tokens={tokens} />
                        </p>
                      ) : null}
                    </div>

                    {result.doc.meta ? (
                      <p className="u-label text-mute mt-4 md:col-span-3 md:mt-0 md:text-right">
                        {result.doc.meta}
                      </p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* --- nothing found ------------------------------------------------ */}
      {showNothing ? (
        <EmptyState className="mt-(--spacing-section-sm)" title="Nothing matches that">
          The index covers titles, tags and the opening of every entry. A single word, a
          year or a place name usually finds more than a phrase does.
        </EmptyState>
      ) : null}

      {/* --- the index did not load --------------------------------------- */}
      {status === 'error' ? (
        <EmptyState className="mt-(--spacing-section-sm)" title="The index did not load">
          <button
            type="button"
            onClick={load}
            className="u-label border-line-strong text-muted hover:border-ember hover:text-ivory mt-4 border px-4 py-3 transition-colors duration-300"
          >
            Try again
          </button>
        </EmptyState>
      ) : null}

      {/* --- what is in here ---------------------------------------------- */}
      {showIdle && counts.length > 0 ? (
        <div className="mt-(--spacing-section-sm)">
          <div className="border-line-strong flex items-baseline justify-between gap-6 border-b pb-3">
            <h2 className="u-label text-mute">In the index</h2>
            {docs ? (
              <span className="u-label u-nums text-mute">{docs.length}</span>
            ) : null}
          </div>

          <ul className="mt-10 grid list-none grid-cols-1 gap-x-(--spacing-gutter) gap-y-6 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {counts.map((count) => (
              <li
                key={count.label}
                className="border-line flex items-baseline justify-between gap-4 border-b pb-4"
              >
                <span className="u-label text-muted">{count.label}</span>
                <span className="u-display u-nums text-ivory text-xl">{count.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
