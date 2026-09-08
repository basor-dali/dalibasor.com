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
 */

export const archivo = Archivo({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-archivo',
  // Latin-ext covers the Bosnian/Serbian diacritics — č, ć, ž, š, đ.
  //
  // Deliberately no `axes: ['wdth']`. The width axis was requested and never
  // used — nothing in the stylesheet sets font-stretch or
  // font-variation-settings — and a second variation axis is most of the
  // file's weight, downloaded on every page view.
  weight: 'variable',
  fallback: ['Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
  adjustFontFallback: true,
});

export const instrumentSerif = Instrument_Serif({
  subsets: ['latin', 'latin-ext'],
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
  subsets: ['latin', 'latin-ext'],
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
