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
import {
  formatDuration,
  mediaAlt,
  responsiveImage,
  SIZES,
} from '@/lib/media';
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
          const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], video',
          );
          if (!focusable || focusable.length === 0) break;
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
        sizes: SIZES.lightbox,
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
    } else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      onClose();
    }
  }

  if (!item) return null;

  const image =
    item.type === 'image'
      ? responsiveImage(item, { ladder: 'lightbox', sizes: SIZES.lightbox, fit: 'fit' })
      : null;

  const captured = item.capturedAt ? formatDate(item.capturedAt) : undefined;
  const metaBits = [captured, item.location, label].filter(Boolean) as string[];

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Photograph viewer. ${index + 1} of ${count}.`}
      tabIndex={-1}
      onMouseMove={wakeChrome}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="fixed inset-0 z-[100] bg-ground-deep/98 backdrop-blur-sm"
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
          <div className="pointer-events-auto w-full max-w-[min(100%,110rem)]">
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

      {/* --- chrome ------------------------------------------------------ */}
      <div
        className={cx(
          'pointer-events-none absolute inset-0 transition-opacity duration-500',
          chromeVisible ? 'opacity-100' : 'opacity-0',
        )}
      >
        {/* top bar */}
        <div className="pointer-events-auto absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-gradient-to-b from-ground-deep/80 to-transparent p-4 sm:p-6">
          <p className="u-label text-muted">
            <span className="text-ivory">{String(index + 1).padStart(2, '0')}</span>
            <span className="mx-1.5 text-mute">/</span>
            {String(count).padStart(2, '0')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="u-label -m-3 p-3 text-muted transition-colors hover:text-ivory"
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
          <figcaption className="pointer-events-auto absolute inset-x-0 bottom-0 bg-gradient-to-t from-ground-deep/85 to-transparent p-4 pt-16 sm:p-6 sm:pt-20">
            <div className="u-page">
              {item.caption ? (
                <p className="max-w-2xl text-sm text-ivory sm:text-base">{item.caption}</p>
              ) : null}
              {metaBits.length > 0 ? (
                <p className="u-label mt-2 text-mute">
                  {metaBits.map((bit, i) => (
                    <span key={bit}>
                      {i > 0 ? <span className="mx-2 text-line-strong">·</span> : null}
                      {bit}
                    </span>
                  ))}
                  {item.type === 'video' && item.duration ? (
                    <span>
                      <span className="mx-2 text-line-strong">·</span>
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
        'pointer-events-auto absolute top-1/2 hidden -translate-y-1/2 p-6 text-muted transition-colors hover:text-ivory sm:block',
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
