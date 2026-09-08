'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { MediaItem } from '@/types/content';
import { formatDuration, mediaAlt, responsiveImage } from '@/lib/media';
import { cx, formatDate } from '@/lib/utils';
import { MediaVideo } from './MediaVideo';

/**
 * The full-screen viewer.
 *
 * Design rules, in order of importance:
 *   1. The photograph owns the screen. Chrome hides itself after a moment.
 *   2. Everything works from the keyboard, and focus is trapped while open.
 *   3. Neighbours are preloaded so arrowing through an album never stalls.
 *   4. The URL carries the photo id, so any frame can be linked to directly.
 *
 * Only ever mounted once per page, via LightboxProvider. Grid cells are plain
 * server-rendered markup that call `open(index)`.
 */

/**
 * What a contained photograph actually measures on screen.
 *
 * The viewer letterboxes with object-contain inside a padded box, so a portrait
 * frame never uses the full viewport width — a 2:3 photograph on a 1440×900
 * screen occupies about 570px, not 1440. Declaring `100vw` made the browser
 * fetch the 2560px file for it, up to a 6× over-fetch on the one screen where
 * the visitor is looking hardest.
 *
 * Height is the binding constraint, so the width is bounded by
 * `height × aspect-ratio`. The padding is fixed px (p-3 / sm:p-8 / md:p-12), so
 * it is written exactly rather than approximated in vw.
 */
function containSizes(width: number, height: number): string {
  const ratio = (width / Math.max(1, height)).toFixed(4);
  return [
    `(min-width: 48rem) min(calc(100vw - 96px), calc((100vh - 96px) * ${ratio}))`,
    `(min-width: 40rem) min(calc(100vw - 64px), calc((100vh - 64px) * ${ratio}))`,
    `min(calc(100vw - 24px), calc((100vh - 24px) * ${ratio}))`,
  ].join(', ');
}

/** How long the viewer chrome stays up after the last interaction. */
const CHROME_IDLE_MS = 3200;

type LightboxContextValue = {
  open: (items: MediaItem[], index: number, label?: string) => void;
};

const LightboxContext = createContext<LightboxContextValue | null>(null);

export function useLightbox(): LightboxContextValue {
  const value = useContext(LightboxContext);
  if (!value) {
    throw new Error('useLightbox must be used inside <LightboxProvider>');
  }
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
        <Lightbox
          items={items}
          index={index}
          label={label}
          onIndexChange={setIndex}
          onClose={close}
        />
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

type LightboxProps = {
  items: MediaItem[];
  index: number;
  label?: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

function Lightbox({ items, index, label, onIndexChange, onClose }: LightboxProps) {
  const [chromeVisible, setChromeVisible] = useState(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const item = items[index];
  const count = items.length;

  // No `mounted` guard is needed before createPortal: the provider renders this
  // only once `isOpen` is true, and that can only happen from a click. It never
  // exists during SSR, so `document.body` is always there.

  /* --- focus management ------------------------------------------------- */
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    node?.focus();
    return () => restoreFocusRef.current?.focus?.();
  }, []);

  /* --- scroll lock ------------------------------------------------------ */
  useEffect(() => {
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    // Compensate for the scrollbar so the page behind does not shift.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, []);

  /* --- deep link -------------------------------------------------------- */
  useEffect(() => {
    if (!item) return;
    const url = new URL(window.location.href);
    url.searchParams.set('photo', item.id);
    window.history.replaceState(null, '', url.toString());
    return () => {
      const cleanup = new URL(window.location.href);
      cleanup.searchParams.delete('photo');
      window.history.replaceState(null, '', cleanup.toString());
    };
  }, [item]);

  const go = useCallback(
    (delta: number) => {
      if (count === 0) return;
      onIndexChange((index + delta + count) % count);
      setChromeVisible(true);
    },
    [count, index, onIndexChange],
  );

  /* --- keyboard --------------------------------------------------------- */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
        case 'ArrowRight':
        case ' ':
          event.preventDefault();
          go(1);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          go(-1);
          break;
        case 'Home':
          event.preventDefault();
          onIndexChange(0);
          break;
        case 'End':
          event.preventDefault();
          onIndexChange(count - 1);
          break;
        case 'Tab': {
          // Trap focus inside the dialog.
          // Filtered on what is actually tabbable, not on tag name. The
          // backdrop is a <button tabindex="-1"> and the prev/next buttons are
          // display:none below sm — counting either made "first" wrong, so
          // shift+Tab from the real first control escaped into the page behind.
          const focusable = Array.from(
            dialogRef.current?.querySelectorAll<HTMLElement>('button, a[href], video') ??
              [],
          ).filter(
            (el) =>
              !el.hasAttribute('disabled') &&
              el.tabIndex >= 0 &&
              el.getClientRects().length > 0,
          );
          if (focusable.length === 0) break;
          const first = focusable[0]!;
          const last = focusable[focusable.length - 1]!;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
          break;
        }
        default:
          break;
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [count, go, onClose, onIndexChange]);

  /* --- idle chrome ------------------------------------------------------ */
  const wakeChrome = useCallback(() => {
    setChromeVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
  }, []);

  // The chrome starts visible, so opening only needs to schedule its retreat —
  // calling wakeChrome() here would set state that is already set.
  useEffect(() => {
    const timer = setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
    hideTimer.current = timer;
    return () => clearTimeout(timer);
  }, []);

  /* --- preload neighbours ----------------------------------------------- */
  useEffect(() => {
    if (count < 2) return;
    for (const offset of [1, -1]) {
      const neighbour = items[(index + offset + count) % count];
      if (!neighbour || neighbour.type !== 'image') continue;
      // Preload through the same responsive pipeline the viewer renders with,
      // so the warmed entry is the one the browser goes on to request.
      const next = responsiveImage(neighbour, {
        ladder: 'lightbox',
        sizes: containSizes(neighbour.width, neighbour.height),
        fit: 'fit',
      });
      const preload = new Image();
      if (next.sources[0]) preload.srcset = next.sources[0].srcSet;
      preload.sizes = next.sizes;
      preload.src = next.src;
    }
  }, [count, index, items]);

  /* --- swipe ------------------------------------------------------------ */
  function onTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: React.TouchEvent) {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    // Horizontal intent only — a vertical swipe closes.
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      go(dx < 0 ? 1 : -1);
      return;
    }
    if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      onClose();
      return;
    }

    // A tap, not a swipe: bring the chrome back.
    //
    // wakeChrome was wired to mousemove alone, and a touch screen never sends
    // one. So on a phone the counter, the caption, the Close button and the
    // arrows faded out 3.2s after opening and there was no gesture that could
    // return them — the photograph was still swipeable, but everything written
    // about it was gone for the rest of the session.
    //
    // Tapping the photograph toggles, the way a phone's own photo viewer does.
    // Taps that land on the chrome are ignored, or tapping "next" would hide
    // the arrow that was just tapped.
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const target = event.target as Node | null;
      if (target && chromeRef.current?.contains(target)) return;
      if (chromeVisible) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
        setChromeVisible(false);
      } else {
        wakeChrome();
      }
    }
  }

  if (!item) return null;

  const image =
    item.type === 'image'
      ? responsiveImage(item, {
          ladder: 'lightbox',
          sizes: containSizes(item.width, item.height),
          fit: 'fit',
        })
      : null;

  const captured = item.capturedAt ? formatDate(item.capturedAt) : undefined;
  const metaBits = [captured, item.location, label].filter(Boolean) as string[];

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Photograph viewer"
      tabIndex={-1}
      onMouseMove={wakeChrome}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="bg-ground-deep/98 fixed inset-0 z-[100] backdrop-blur-sm"
      style={{ animation: 'fade-in 0.25s var(--ease-out-quart)' }}
    >
      {/* The frame. Clicking the empty space around the photograph closes. */}
      <button
        type="button"
        aria-label="Close viewer"
        onClick={onClose}
        className="absolute inset-0 cursor-zoom-out"
        tabIndex={-1}
      />

      <figure className="pointer-events-none relative flex h-full w-full items-center justify-center p-3 sm:p-8 md:p-12">
        {item.type === 'video' ? (
          // Keyed, so arrowing to the next clip mounts a fresh <video>. A media
          // element that has already completed resource selection ignores its
          // <source> children being swapped, so without this the caption, the
          // counter and the URL all advanced while the first clip kept playing.
          <div
            key={item.id}
            className="pointer-events-auto w-full max-w-[min(100%,110rem)]"
          >
            <MediaVideo
              item={item}
              playOnMount
              cover={false}
              ratio={`${item.width} / ${item.height}`}
              posterWidth={1600}
            />
          </div>
        ) : image ? (
          <picture key={item.id}>
            {image.sources.map((source) => (
              <source
                key={source.type}
                type={source.type}
                srcSet={source.srcSet}
                sizes={image.sizes}
              />
            ))}
            <img
              src={image.src}
              srcSet={image.srcSet || undefined}
              sizes={image.srcSet ? image.sizes : undefined}
              alt={mediaAlt(item)}
              width={image.width}
              height={image.height}
              decoding="async"
              className="pointer-events-none max-h-full w-auto max-w-full object-contain"
              style={{ animation: 'fade-in 0.4s var(--ease-out-quart)' }}
            />
          </picture>
        ) : null}
      </figure>

      {/* Arrowing between frames replaces the image but changes no focused
          element, so a screen reader is told nothing. This says what is now on
          screen. Outside the chrome wrapper, which toggles opacity. */}
      <p className="sr-only" aria-live="polite">
        {`${index + 1} of ${count}. ${item.caption ? `${item.caption}. ` : ''}${mediaAlt(item)}`}
      </p>

      {/* --- chrome ------------------------------------------------------ */}
      <div
        ref={chromeRef}
        className={cx(
          // focus-within keeps the chrome up for exactly as long as focus is
          // inside it. Waking it on focus instead would re-arm the 3.2s hide
          // and fade the Close button out from under the keyboard.
          'pointer-events-none absolute inset-0 transition-opacity duration-500 focus-within:opacity-100',
          chromeVisible
            ? 'opacity-100'
            : // opacity: 0 hides a control; it does not disable it. Faded out,
              // the Close button and both arrows were still sitting there
              // catching clicks and taps, so reaching for the edge of an
              // invisible photograph jumped to the next one instead. Focus
              // still works, which is all the keyboard path needs.
              'opacity-0 [&_*]:pointer-events-none',
        )}
      >
        {/* top bar */}
        <div className="from-ground-deep/80 pointer-events-auto absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-gradient-to-b to-transparent p-4 sm:p-6">
          <p className="u-label text-muted">
            <span className="text-ivory">{String(index + 1).padStart(2, '0')}</span>
            <span className="text-muted mx-1.5">/</span>
            {String(count).padStart(2, '0')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="u-label text-muted hover:text-ivory -m-3 p-3 transition-colors"
          >
            Close <span aria-hidden="true">✕</span>
          </button>
        </div>

        {/* previous / next */}
        {count > 1 ? (
          <>
            <NavButton side="left" onClick={() => go(-1)} />
            <NavButton side="right" onClick={() => go(1)} />
          </>
        ) : null}

        {/* caption */}
        {(item.caption || metaBits.length > 0) && (
          <figcaption className="from-ground-deep/85 pointer-events-auto absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-4 pt-16 sm:p-6 sm:pt-20">
            <div className="u-page">
              {item.caption ? (
                <p className="text-ivory max-w-2xl text-sm sm:text-base">
                  {item.caption}
                </p>
              ) : null}
              {metaBits.length > 0 ? (
                <p className="u-label text-muted mt-2">
                  {metaBits.map((bit, i) => (
                    <span key={bit}>
                      {i > 0 ? <span className="text-line-strong mx-2">·</span> : null}
                      {bit}
                    </span>
                  ))}
                  {item.type === 'video' && item.duration ? (
                    <span>
                      <span className="text-line-strong mx-2">·</span>
                      {formatDuration(item.duration)}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </figcaption>
        )}
      </div>
    </div>,
    document.body,
  );
}

function NavButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous photograph' : 'Next photograph'}
      className={cx(
        'text-muted hover:text-ivory pointer-events-auto absolute top-1/2 hidden -translate-y-1/2 p-6 transition-colors sm:block',
        side === 'left' ? 'left-0' : 'right-0',
      )}
    >
      <svg
        viewBox="0 0 24 24"
        width="28"
        height="28"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        aria-hidden="true"
      >
        {side === 'left' ? <path d="M15 4 7 12l8 8" /> : <path d="M9 4l8 8-8 8" />}
      </svg>
    </button>
  );
}
