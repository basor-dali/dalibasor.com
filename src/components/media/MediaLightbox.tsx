'use client';

import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MediaItem } from '@/types/content';

/**
 * The photograph viewer's provider, and nothing else.
 *
 * This file is imported by the root layout, so whatever it pulls in is in the
 * bundle every page of the site downloads. The viewer itself drags in
 * MediaVideo and the whole media provider layer — 7.6KB brotli, measured —
 * which an article, the About page and /now can never use, because there is
 * nothing on them to click.
 *
 * So the viewer is fetched on demand and this file keeps only the context. To
 * make sure "on demand" never means "after a wait", anything that can open the
 * lightbox calls `prefetchLightbox()` when it mounts: the chunk downloads
 * alongside the photographs it belongs to, long before anyone clicks one.
 */

const importViewer = () => import('./LightboxViewer');
const Lightbox = lazy(importViewer);

/**
 * Warm the viewer chunk. Safe to call repeatedly — the module registry makes
 * every call after the first a no-op.
 *
 * Call it from anything that can open the lightbox. Not calling it is not a
 * bug, only a pause on the first click.
 */
export function prefetchLightbox(): void {
  void importViewer();
}

type LightboxContextValue = {
  open: (items: MediaItem[], index: number, label?: string) => void;
};

const LightboxContext = createContext<LightboxContextValue | null>(null);

/**
 * Get `open`, and warm the viewer chunk while you are at it.
 *
 * The prefetch lives here rather than at each call site precisely so it cannot
 * be forgotten: holding `open` is the definition of being able to open the
 * lightbox, so anything that asks for it is by definition a component whose
 * page will need the viewer.
 */
export function useLightbox(): LightboxContextValue {
  const value = useContext(LightboxContext);
  if (!value) {
    throw new Error('useLightbox must be used inside <LightboxProvider>');
  }

  // In an effect, not in render: render must stay free of side effects, and
  // this is not needed until the page is interactive anyway.
  useEffect(prefetchLightbox, []);

  return value;
}

/* --------------------------------------------------------------------------
   The viewer and the Back button
   --------------------------------------------------------------------------
   On a phone, Back is how you leave a full-screen photograph — the system
   gesture, the hardware button, the browser's own arrow. The viewer used to
   live entirely in replaceState, so Back skipped straight past it and off the
   album, which is the one thing nobody pressing it meant.

   So opening the viewer pushes one history entry, marked as ours, and Back
   simply pops it. Moving between photographs replaces that same entry, so
   twenty photographs later Back still means "close", not "previous photo".
   Closing from inside the viewer (Close, Escape, a swipe down, the backdrop)
   goes back too, so the entry never lingers to be landed on later.

   Next patches pushState and copies its own router state into the entry, so a
   pop to the album URL restores the page that is already on screen: no fetch,
   no remount. Only the viewer's own state changes. */

/** Marks a history entry as the viewer's. Holds the photo id on screen. */
const HISTORY_KEY = 'lightbox';

function photoUrl(id: string | null): string {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('photo', id);
  else url.searchParams.delete('photo');
  return url.toString();
}

function viewerEntryIsCurrent(): boolean {
  return Boolean((window.history.state as Record<string, unknown> | null)?.[HISTORY_KEY]);
}

export function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [index, setIndex] = useState(0);
  const [label, setLabel] = useState<string | undefined>();
  const [isOpen, setIsOpen] = useState(false);
  /* Set between asking the browser to go back and hearing that it has. A
     second Close in that gap — a double click is enough — would otherwise go
     back twice, and the second step leaves the album altogether. */
  const closing = useRef(false);

  const open = useCallback((next: MediaItem[], at: number, contextLabel?: string) => {
    const item = next[at];
    if (!item) return;

    setItems(next);
    setIndex(at);
    setLabel(contextLabel);
    setIsOpen(true);
    closing.current = false;

    if (!viewerEntryIsCurrent()) {
      // Arriving on a shared ?photo= link, the landing entry already names a
      // photograph. Clean it first, so Back from the viewer lands on the
      // album itself rather than on a URL that reopens what you just closed.
      if (new URLSearchParams(window.location.search).has('photo')) {
        window.history.replaceState(null, '', photoUrl(null));
      }
      window.history.pushState({ [HISTORY_KEY]: item.id }, '', photoUrl(item.id));
    }
  }, []);

  const close = useCallback(() => {
    if (closing.current) return;
    if (viewerEntryIsCurrent()) {
      closing.current = true;
      window.history.back(); // the popstate below does the closing
      return;
    }
    window.history.replaceState(null, '', photoUrl(null));
    setIsOpen(false);
  }, []);

  /* Back (or Forward) through the viewer's entry. */
  useEffect(() => {
    function onPopState() {
      closing.current = false;
      const state = window.history.state as Record<string, unknown> | null;
      const id = state?.[HISTORY_KEY];

      if (typeof id !== 'string') {
        setIsOpen(false);
        return;
      }
      // Forward into the entry just left: reopen on the same photograph, as
      // long as it belongs to the collection this page last opened.
      const at = items.findIndex((item) => item.id === id);
      if (at !== -1) {
        setIndex(at);
        setIsOpen(true);
      }
    }

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [items]);

  /* Keep the address on the photograph that is on screen, in the viewer's one
     entry — so any frame can be copied out of the address bar and shared. */
  useEffect(() => {
    if (!isOpen || !viewerEntryIsCurrent()) return;
    const item = items[index];
    if (!item) return;
    const state = window.history.state as Record<string, unknown> | null;
    if (state?.[HISTORY_KEY] === item.id) return;
    window.history.replaceState({ [HISTORY_KEY]: item.id }, '', photoUrl(item.id));
  }, [isOpen, items, index]);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <LightboxContext.Provider value={value}>
      {children}
      {isOpen ? (
        // No fallback: on the rare path where the chunk has not been
        // prefetched, the page should stay exactly as it is for the moment the
        // download takes, rather than flash a spinner over the photograph
        // someone just clicked.
        <Suspense fallback={null}>
          <Lightbox
            items={items}
            index={index}
            label={label}
            onIndexChange={setIndex}
            onClose={close}
          />
        </Suspense>
      ) : null}
    </LightboxContext.Provider>
  );
}

/**
 * Open the viewer on the photograph named in the URL.
 *
 * The viewer has always written `?photo=<id>` as you move through an album, so
 * every frame looked linkable — but nothing ever read it back, so following one
 * of those links landed you on the album with the viewer closed. The feature
 * was advertised in the URL bar and in the docs, and did nothing.
 *
 * Runs once, on mount, before the viewer writes anything of its own. An id that
 * is not in this collection is ignored rather than treated as an error: the
 * photograph may have moved to another album, and the page it lands on is still
 * the right one.
 */
export function useDeepLinkedPhoto(
  items: MediaItem[],
  open: LightboxContextValue['open'],
  label?: string,
) {
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current || items.length === 0) return;
    consumed.current = true;

    const wanted = new URLSearchParams(window.location.search).get('photo');
    if (!wanted) return;

    const index = items.findIndex((item) => item.id === wanted);
    if (index === -1) return;

    // Deferred a tick: opening during the effect body would be a cascading
    // render straight on top of hydration.
    const timer = setTimeout(() => open(items, index, label), 0);
    return () => clearTimeout(timer);
  }, [items, open, label]);
}

/* ==========================================================================
   The viewer itself
   ========================================================================== */
