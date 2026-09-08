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

export function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [index, setIndex] = useState(0);
  const [label, setLabel] = useState<string | undefined>();
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((next: MediaItem[], at: number, contextLabel?: string) => {
    setItems(next);
    setIndex(at);
    setLabel(contextLabel);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

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
