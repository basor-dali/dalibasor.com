'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { requestSearchFocus } from '@/lib/search/intent';
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
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

      const focusable =
        panelRef.current?.querySelectorAll<HTMLElement>('a[href], button');
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
    // Move focus into the panel so a screen reader lands inside the menu, on
    // the Close control — the right landing spot for a dialog. By ref rather
    // than "the first focusable": the wordmark link now comes first.
    closeButtonRef.current?.focus();

    return () => {
      body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  /* --- `/` to search ----------------------------------------------------
     The search was only ever linked from the footer. It now has a place in
     the bar, and the keyboard convention most sites with a search share:
     `/` from anywhere goes to the field, already focused. Never while typing
     in a field, never with a modifier held, and never while a dialog — the
     menu or the photo viewer — has the page. */
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return;
      }
      if (menuOpen || document.querySelector('[role="dialog"][aria-modal="true"]'))
        return;

      event.preventDefault();
      const field = document.querySelector<HTMLInputElement>('input[type="search"]');
      if (window.location.pathname === '/search' && field) {
        field.focus();
        field.select();
        return;
      }
      requestSearchFocus();
      router.push('/search');
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen, router]);

  const isHome = pathname === '/';
  const searchActive = pathname === '/search';

  return (
    <>
      <header
        className={cx(
          'fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500',
          scrolled && !menuOpen
            ? 'border-line bg-ground/85 border-b backdrop-blur-md'
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
            <span className="u-label-lg text-ivory block font-medium transition-colors duration-300 group-hover:text-white">
              {site.name}
            </span>
          </Link>

          {/* --- desktop --- */}
          <nav aria-label="Primary" className="hidden md:block">
            <ul className="flex list-none items-center gap-5 p-0 lg:gap-8 xl:gap-9">
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
              {/* Set apart from the sections by a hairline: it is a tool, not
                  a place. The key hint shows where there is room for it. */}
              <li className="border-line-strong border-l pl-5 lg:pl-8 xl:pl-9">
                <Link
                  href="/search"
                  aria-current={searchActive ? 'page' : undefined}
                  aria-keyshortcuts="/"
                  className={cx(
                    'u-label u-link u-link-reveal -m-2 inline-flex items-baseline gap-2 p-2 transition-colors duration-300',
                    searchActive ? 'text-ivory' : 'text-muted hover:text-ivory',
                  )}
                >
                  Search
                  <kbd
                    aria-hidden="true"
                    className="border-line-strong text-muted hidden border px-1.5 font-mono text-[0.625rem] leading-[1.4] lg:inline-block"
                  >
                    /
                  </kbd>
                </Link>
              </li>
            </ul>
          </nav>

          {/* --- mobile trigger --- */}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="u-label text-ivory -m-3 p-3 md:hidden"
          >
            Menu
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
        // Above the bar, not below it. At z-40 under the bar's z-50 the bar
        // stayed on top — transparent, because the scrolled treatment is
        // suppressed while the menu is open — so its trigger, relabelled
        // "Close", was drawn straight over this panel's own "Close ✕": two
        // labels on top of each other at the corner of every phone. The panel
        // now covers the bar and carries its own copy of the bar's top row.
        className="bg-ground fixed inset-0 z-[60] flex flex-col md:hidden"
        style={menuOpen ? { animation: 'fade-in 0.3s var(--ease-out-quart)' } : undefined}
      >
        {/* The bar's own row, repeated inside the dialog: the wordmark where
            it always is, and the one way out. An aria-modal dialog needs its
            close control inside it — Escape is not discoverable and does not
            exist on a touch screen. */}
        <div
          className="u-page flex shrink-0 items-center justify-between gap-6"
          style={{ height: 'var(--nav-height)' }}
        >
          <Link
            href="/"
            onClick={() => setMenuOpen(false)}
            className="-m-2 shrink-0 p-2"
            aria-current={isHome ? 'page' : undefined}
          >
            <span className="u-label-lg text-ivory block font-medium">{site.name}</span>
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => {
              setMenuOpen(false);
              menuButtonRef.current?.focus();
            }}
            className="u-label text-ivory -m-3 p-3"
          >
            Close <span aria-hidden="true">✕</span>
          </button>
        </div>

        {/* A scroll container, not a centred column.
            The five links plus their notes are ~811px tall; an iPhone SE has
            about 553px under Safari's toolbars, and body overflow is hidden
            while the menu is open. Centred and unscrollable, "Now" and the
            social row were simply unreachable — worse in landscape, where two
            entries disappeared. `min-h-0` is load-bearing: flex children
            default to min-height:auto, which keeps the nav at content height
            and stops the scroll container ever engaging. `my-auto` on the
            inner column keeps the centred look whenever it does fit. */}
        <nav
          aria-label="Primary"
          className="u-pad flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-10"
        >
          <div className="my-auto flex flex-col gap-1">
            {primaryNav.map((item, index) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  // The menu closes itself when the pathname changes, which a
                  // link to the page you are already on never does — tapping
                  // "Writing" on /writing left the menu standing open.
                  onClick={() => setMenuOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className="group border-line block border-b py-5"
                  style={
                    menuOpen
                      ? {
                          animation: `fade-up 0.5s var(--ease-out-expo) ${index * 45}ms both`,
                        }
                      : undefined
                  }
                >
                  <span className="flex items-baseline gap-3">
                    <span className="u-label text-muted w-6 shrink-0">
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
                    <span className="text-muted mt-1.5 block pl-9 text-sm">
                      {item.note}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="u-pad flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 pb-10">
          <Link
            href="/search"
            onClick={() => setMenuOpen(false)}
            aria-current={searchActive ? 'page' : undefined}
            className="u-label u-link u-link-reveal text-ivory"
          >
            Search
          </Link>
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
