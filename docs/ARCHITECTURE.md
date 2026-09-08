# Architecture

Why the site is built the way it is. Written for whoever maintains this in 2036 — probably
Dali, possibly with no memory of 2026.

## The constraint that decided everything

This has to still work in twenty years, with thousands of photographs and hundreds of essays,
maintained by one person in occasional evenings. Every decision below falls out of that.

Concretely:

- **Content is text on disk, not rows in a database.** A CMS is a dependency on a company.
  `.mdx` and `.yml` are a dependency on nothing.
- **Everything is statically generated.** No server runs at request time, so there is no
  runtime to keep patched, no database to migrate, and hosting stays close to free.
- **The one service that is genuinely hard to replace — the media CDN — sits behind an
  interface** so replacing it is one file, not a rewrite.
- **The client-side JavaScript budget is small on purpose.** Most of the site is server
  components. A photograph grid ships almost nothing.

## Content pipeline

```
content/*.mdx ──▶ gray-matter ──▶ typed objects ──▶ Server Components ──▶ static HTML
content/media/*.yml ──▶ YAML ──▶ MediaItem[] ──┘
```

`src/lib/content/` is the only place that touches the filesystem. Everything is loaded once per
build process and memoised (`once()` in `fs.ts`) — a page that appears in fifty places reads its
file once.

Loaders validate as they read and **throw on ambiguity**: a duplicate slug, an invalid project
status, two Now entries claiming the same month. These are build failures rather than silent
breakage because each one would quietly corrupt a URL.

Types live in `src/types/content.ts`. That file is the contract; the loaders satisfy it and the
components consume it.

### Summaries vs. full records

`Post` contains the MDX body. `PostSummary` does not. Listings use summaries so that a page
showing forty posts does not serialise forty article bodies into the RSC payload. Same split
for projects and Now entries.

## Media

The part that has to survive scale.

```
src/lib/media/
  provider.ts    the interface + width ladders + `sizes` presets
  cloudinary.ts  production
  local.ts       development fallback / lifeboat
  index.ts       provider selection + responsiveImage()/responsiveVideo()
```

Nothing in `src/components` or `src/app` knows what a Cloudinary URL looks like. Components
call `responsiveImage(item, { ladder, sizes, fit })` and get back `{ src, srcSet, sizes, width,
height, aspectRatio, lqip, color }`.

### How a photo page stays fast

Six things, all of them necessary:

1. **Aspect ratio is reserved before anything downloads.** `width`/`height` come from the
   manifest and drive a CSS `aspect-ratio` box (`.u-frame` + `--ar`). Cumulative layout shift
   on a page of two hundred photographs is zero.
2. **A ~400-byte base64 placeholder** is baked into the manifest at import and painted as a
   background immediately.
3. **The width ladder is trimmed to the source's own resolution**, so the CDN is never asked to
   upscale and a 400px thumbnail cannot pull a 6000px original.
4. **`f_auto` negotiates AVIF/WebP** per browser.
5. **Native `loading="lazy"` plus `content-visibility: auto`** on grid cells, so off-screen rows
   cost nothing to lay out or paint.
6. **The DOM grows with scrolling.** `MediaGrid` renders an initial chunk and reveals more via
   an `IntersectionObserver` sentinel with a generous `rootMargin`.

Deliberately **no `dpr_auto`**: every image is chosen by the browser from a `w`-descriptor
`srcSet`, which already accounts for device pixel ratio. Multiplying the two would fetch a
3200px file into a 1600px slot on any retina screen.

The single most common way to break this is a wrong `sizes` attribute. The presets in
`provider.ts` (`third`, `quarter`, `measure`, `bleed`…) exist so components declare intent
rather than hand-rolling media queries that drift from the layout.

### Video

Sources are ordered HLS first, MP4 second. Safari and iOS take the adaptive stream natively;
every other browser cannot play `application/x-mpegURL` and falls through on its own. That
avoids shipping hls.js — 40KB to solve a problem a personal archive does not have.

Videos render as a poster-image facade until pressed. Nothing autoplays, and a year page with
six clips issues zero video requests until someone wants one.

### Privacy

GPS coordinates, device serials and filesystem paths are stripped **before upload**, in
`scripts/lib/strip-metadata.mjs` — so private metadata never leaves the machine, rather than
relying on the CDN to hide it. JPEGs whose orientation is already upright are stripped
losslessly by rewriting marker segments; everything else is rotated and re-encoded at high
quality. The user's original file is never modified.

Locations shown on the site are the broad ones typed by hand into the manifest. There is no
face detection and no automatic tagging of people, by choice.

## Rendering

Server Components by default. `'use client'` appears in exactly the places that need it:

| Component | Why it is a client component |
|---|---|
| `Navigation` | scroll state, mobile menu, focus trapping |
| `MediaLightbox` | keyboard, swipe, portal, history |
| `MediaGrid` | progressive reveal, opening the lightbox |
| `MediaVideo` | play state |
| `WritingArchive` | in-memory filtering |
| `SearchClient` | fetch-on-interaction and scoring |
| `error.tsx` | React requires it |

The image fade-in is a notable exception: rather than per-image React state, one capture-phase
`load` listener inlined in `<head>` tags images as they decode, and CSS does the rest. On a page
with three hundred photographs that is one listener instead of three hundred effects. It is
gated behind a `.js-media` class so photographs are simply visible if scripting fails.

## Styling

Tailwind CSS v4, configured entirely in CSS (`src/app/globals.css`). There is no
`tailwind.config.js`; the `@theme` block *is* the design system.

Three layers:

1. **Tokens** — colours, fluid type scale, spacing, containers, easing.
2. **`u-*` utility classes** — the shared vocabulary (`u-page`, `u-display`, `u-label`,
   `u-frame`, `u-measure`). These exist because they appear on nearly every page and a
   twelve-class Tailwind incantation repeated two hundred times is not maintainable.
3. **`.prose`** — article typography. Raw, unpolished personal writing has to look good with no
   effort from the author, so this handles headings, quotes, code, tables, footnotes and
   figures without any per-post markup.

One dark theme, on purpose. A light mode would be a different site.

## Search

A static JSON index built at build time from all content, served from
`/search-index.json` with `force-static`, and fetched by the client **on first interaction**
rather than on mount — so a visitor who never searches never downloads it. Scoring is about
forty lines: title matches beat tag matches beat body matches, with prefix support.

At a few thousand documents this stays comfortably faster than a network round-trip to a search
service, and it has no account to lose.

## Time as structure

Years are not metadata here, they are the organising principle:

- writing is grouped by year in the archive
- the media archive is `content/media/<year>.yml`, one file per year
- `getTimeline()` reports what exists in every year across all content types
- `pickArchiveEntry()` weights **older** material higher, because the point of "From the
  archive" is being shown something you had forgotten

That randomiser is seeded deterministically (build SHA + date) rather than using
`Math.random()`, because a statically generated page and a later rebuild would otherwise
disagree about what it showed.

## Motion

There is no animation library in the dependency list. Everything that moves — the underline
that grows from the left, the image reveal, the grid hover, the mobile menu, the lightbox fade
— is a CSS transition or a keyframe declared in `globals.css`.

That is not minimalism for its own sake. CSS transitions are compositor-driven, cost no
JavaScript, and cannot break in a future React release. The global `prefers-reduced-motion`
block flattens all of them in one place, which is far harder to get wrong than remembering to
check a hook in every component.

If something genuinely needs spring physics or gesture tracking later, install `motion` then
and use it in that one component.

## Things deliberately not built

- A CMS or admin UI — text files and Git are the interface.
- Comments, newsletter capture, share buttons, analytics beyond nothing.
- Infinite album nesting. One level under a year, forever. Deeper hierarchies are how personal
  archives become unbrowsable.
- Face recognition or automatic people-tagging.
- A search SaaS.
- Light mode.

## Where to change things

| I want to… | Go to |
|---|---|
| change a colour or the type scale | `src/app/globals.css` (`@theme`) |
| change the fonts | `src/app/fonts.ts` |
| change navigation or social links | `src/lib/site.ts` |
| add a component usable inside posts | `src/components/mdx/components.tsx` |
| change how an image is sized | `src/lib/media/provider.ts` (`SIZES`, `WIDTH_LADDERS`) |
| swap the media CDN | add a file to `src/lib/media/`, extend `index.ts` |
| add a frontmatter field | `src/types/content.ts`, then its loader in `src/lib/content/` |
| change the importer | `scripts/media-import.mjs` |
