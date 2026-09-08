'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { primaryNav, site } from '@/lib/site';
import { cx } from '@/lib/utils';

/* --------------------------------------------------------------------------
   Scroll position, read as an external store rather than mirrored into state.

   The effect-plus-setState version renders once with the wrong answer and then
   again with the right one, which on a page whose hero sits under the bar is a
   visible flash of the scrolled treatment. useSyncExternalStore reads the real
   value during the first client render and gives SSR an explicit `false`.
   -------------------------------------------------------------------------- */

const SCROLL_THRESHOLD = 24;

function subscribeToScroll(onChange: () => void): () => void {
  window.addEventListener('scroll', onChange, { passive: true });
  return () => window.removeEventListener('scroll', onChange);
}

function getScrolledSnapshot(): boolean {
  return window.scrollY > SCROLL_THRESHOLD;
}

/** At the top of the document until proven otherwise. */
function getScrolledServerSnapshot(): boolean {
  return false;
}

/**
 * Navigation.
 *
 * Desktop: a thin fixed bar that is transparent over a hero and picks up a
 * ground colour once you scroll past it. Nothing moves, nothing bounces.
 *
 * Mobile: a full-screen menu set in the same oversized display type as the
 * rest of the site, so opening it feels like arriving somewhere rather than
 * pulling out a drawer of links.
 */

export function Navigation() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const scrolled = useSyncExternalStore(
    subscribeToScroll,
    getScrolledSnapshot,
    getScrolledServerSnapshot,
  );

  /* --- close on navigation -----------------------------------------------
     Adjusted during render rather than in an effect: by the time an effect
     runs, the new page has already painted with the menu still covering it. */
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }

  /* --- menu behaviour ---------------------------------------------------- */
  useEffect(() => {
    if (!menuOpen) return;

    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>('a[href], button');
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    // Move focus into the panel so a screen reader lands inside the menu.
    panelRef.current?.querySelector<HTMLElement>('a[href]')?.focus();

    return () => {
      body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const isHome = pathname === '/';

  return (
    <>
      <header
        className={cx(
          'fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500',
          scrolled && !menuOpen
            ? 'border-b border-line bg-ground/85 backdrop-blur-md'
            : 'border-b border-transparent',
        )}
        style={{ height: 'var(--nav-height)' }}
      >
        <div className="u-page flex h-full items-center justify-between gap-6">
          <Link
            href="/"
            className="group -m-2 shrink-0 p-2"
            aria-label={`${site.name} — home`}
            aria-current={isHome ? 'page' : undefined}
          >
            <span className="u-label-lg block font-medium text-ivory transition-colors duration-300 group-hover:text-white">
              {site.name}
            </span>
          </Link>

          {/* --- desktop --- */}
          <nav aria-label="Primary" className="hidden md:block">
            <ul className="flex list-none items-center gap-7 p-0 lg:gap-9">
              {primaryNav.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'u-label u-link u-link-reveal -m-2 inline-block p-2 transition-colors duration-300',
                        active ? 'text-ivory' : 'text-muted hover:text-ivory',
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* --- mobile trigger --- */}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="u-label -m-3 p-3 text-ivory md:hidden"
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>

      {/* --- mobile panel --- */}
      <div
        id="mobile-menu"
        ref={panelRef}
        role="dialog"
        aria-modal={menuOpen ? true : undefined}
        aria-label="Site menu"
        hidden={!menuOpen}
        className="fixed inset-0 z-40 flex flex-col bg-ground md:hidden"
        style={menuOpen ? { animation: 'fade-in 0.3s var(--ease-out-quart)' } : undefined}
      >
        <nav
          aria-label="Primary"
          className="u-pad flex flex-1 flex-col justify-center gap-1 pb-24"
          style={{ paddingTop: 'var(--nav-height)' }}
        >
          {primaryNav.map((item, index) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="group block border-b border-line py-5"
                style={
                  menuOpen
                    ? {
                        animation: `fade-up 0.5s var(--ease-out-expo) ${index * 45}ms both`,
                      }
                    : undefined
                }
              >
                <span className="flex items-baseline gap-3">
                  <span className="u-label w-6 shrink-0 text-mute">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={cx(
                      'u-display text-3xl',
                      active ? 'text-white' : 'text-ivory',
                    )}
                  >
                    {item.label}
                  </span>
                </span>
                {item.note ? (
                  <span className="mt-1.5 block pl-9 text-sm text-muted">{item.note}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="u-pad flex flex-wrap items-center gap-x-6 gap-y-2 pb-10">
          {site.social.map((social) => (
            <a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="me noreferrer"
              className="u-label u-link u-link-reveal text-muted"
            >
              {social.label}
            </a>
          ))}
          <a
            href={`mailto:${site.author.email}`}
            className="u-label u-link u-link-reveal text-muted"
          >
            Email
          </a>
        </div>
      </div>
    </>
  );
}
