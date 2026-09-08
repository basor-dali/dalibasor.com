import { Archivo, IBM_Plex_Mono, Instrument_Serif } from 'next/font/google';

/**
 * Three families, all open licence (OFL), all self-hosted at build time by
 * next/font — no request ever leaves for Google.
 *
 *   Archivo          the voice. Variable weight and width, which is what makes
 *                    the oversized headlines work: heavy and slightly narrowed
 *                    at 9rem, normal at 1rem, one family throughout.
 *   Instrument Serif the counterpoint. High-contrast, a little theatrical.
 *                    Used only for subtitles, pull quotes and year notes.
 *   IBM Plex Mono    the connective tissue. Every date, tag, count and caption
 *                    on the site is set in this at 11px with wide tracking.
 *
 * ---------------------------------------------------------------------------
 * On `subsets`, which is a preload list and not a coverage list
 * ---------------------------------------------------------------------------
 * This is the confusing part of next/font, so it is written down rather than
 * rediscovered. `subsets` does not decide which characters render — Google
 * returns an @font-face for every subset it has, and the browser picks by
 * unicode-range, so č, ć, ž, š and đ resolve to the right face regardless.
 * What `subsets` decides is which files get a <link rel="preload">.
 *
 * Declaring latin-ext put all four latin-ext faces on the critical path of
 * every page: 56.8KB fetched at high priority on the homepage, on every
 * article, on /about — for characters that appear in a handful of place names
 * and almost nowhere else. Preload is a promise that a file is needed
 * immediately, and for latin-ext that promise was false nearly every time.
 *
 * So latin is preloaded and latin-ext is left to the browser, which fetches it
 * when a glyph actually calls for it. Preloaded weight went from 125.2KB
 * across 8 files to 68.4KB across 4. The cost is that the first Đ on a page
 * may show in the fallback face for a moment before swapping — which is what
 * `display: swap` already does for every other character, and a far better
 * trade than 56.8KB on every visit.
 *
 * Cyrillic and Vietnamese are built too, by the same mechanism, and have never
 * been preloaded.
 */

export const archivo = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-archivo',
  // Deliberately no `axes: ['wdth']`. The width axis was requested and never
  // used — nothing in the stylesheet sets font-stretch or
  // font-variation-settings — and a second variation axis is most of the
  // file's weight, downloaded on every page view.
  weight: 'variable',
  fallback: ['Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
  adjustFontFallback: true,
});

export const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-instrument-serif',
  weight: '400',
  // Upright only. The one italic on the site is `.prose em`, which is body copy
  // in the sans face — so the serif italic was fetched on every page and
  // applied on none.
  style: 'normal',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
  adjustFontFallback: true,
});

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plex-mono',
  weight: ['400', '500'],
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
});

export const fontVariables = [
  archivo.variable,
  instrumentSerif.variable,
  plexMono.variable,
].join(' ');
