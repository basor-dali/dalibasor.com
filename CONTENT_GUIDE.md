# Content guide

How to add things to the site. Everything is a file in `content/` — no database, nothing held
in a service. You can edit those files through a form or directly; either way you commit and
push, and the files are the archive.

```
content/
  writing/<year>/<slug>.mdx    essays and notes
  projects/<slug>.mdx          projects
  now/<YYYY-MM>.mdx            Now snapshots — one per update, kept forever
  pages/about.mdx              the About page body
  media/<YYYY>.yml             the photo + video manifest for one year
```

Run `npm run dev` and open <http://localhost:3000> while you work. Drafts (`draft: true`) are
visible in development and hidden in production.

## Two ways to edit

**A form, at <http://localhost:3000/admin>** — Keystatic for writing, projects, Now and About;
a drag-and-drop importer for photographs. Easiest for everyday use. See [docs/CMS.md](docs/CMS.md).

**The files themselves** — everything below. Both paths edit the same files and can be used
interchangeably; the CMS is a front-end onto `content/`, not a separate store.

---

## Write a new post

```bash
npm run new:post -- "Getting Strong Again"
```

Creates `content/writing/2026/getting-strong-again.mdx` with valid frontmatter and a
placeholder body. Then open it and write.

```yaml
---
title: Getting Strong Again
date: 2026-09-20
tags: [Fitness, Life]
---
Your words. Exactly as you want them.
```

### Frontmatter fields

| Field         | Required | What it does                                                                          |
| ------------- | -------- | ------------------------------------------------------------------------------------- |
| `title`       | yes      | The headline                                                                          |
| `date`        | yes      | `YYYY-MM-DD`. Drives ordering and the archive grouping                                |
| `slug`        | no       | Defaults to the filename. **Once published, never change it** — it is a permanent URL |
| `subtitle`    | no       | A short editorial line under the title                                                |
| `tags`        | no       | `[Life, Technology]`. Free-form; tag pages are generated automatically                |
| `coverImage`  | no       | A media public id, e.g. `dalibasor/2026/serbia/img_0042`                              |
| `coverAlt`    | no       | Alt text for the cover                                                                |
| `coverShape`  | no       | `wide` (default), `tall` or `square` — a hint for listings                            |
| `location`    | no       | e.g. `Belgrade, Serbia`. Shown as a small label                                       |
| `featured`    | no       | `true` promotes it on the homepage and archive                                        |
| `draft`       | no       | `true` hides it in production                                                         |
| `excerpt`     | no       | Used in listings and metadata. **Optional on purpose** — do not force one             |
| `placeholder` | no       | `true` marks the post as scaffolding you have not written yet                         |

### Writing style

The design does not need your prose to be tidy. Short paragraphs, no headings, an abrupt
ending, a list of half-thoughts — all of it renders well. Do not clean up your voice to suit
the layout.

### Things you can put in a post

Plain markdown covers almost everything: headings, lists, links, **bold**, _italic_,
`code`, code fences, tables, blockquotes, footnotes[^1], horizontal rules.

Beyond that there are six components:

```mdx
<Figure
  src="dalibasor/2026/serbia/img_0042"
  alt="Description"
  caption="Belgrade, August"
/>
<Figure src="..." alt="..." bleed /> {/* breaks out past the reading width */}

<Row>
  {' '}
  {/* two or three side by side */}
  <Figure src="..." alt="..." />
  <Figure src="..." alt="..." />
</Row>

<Video src="dalibasor/2026/serbia/clip_01" caption="Optional" />

<Pull>A line worth setting large.</Pull>

<Note>A short aside in a quieter voice.</Note>

<Placeholder>[DALI: WRITE THIS IN YOUR OWN WORDS]</Placeholder>
```

`src` is a media public id, not a URL — the same id you see in `content/media/*.yml`.

[^1]: Footnotes work like this.

### Publish it

```bash
git add content/writing/2026/getting-strong-again.mdx
git commit -m "Post: getting strong again"
git push
```

That is the whole publishing pipeline.

---

## Add a project

```bash
npm run new:project -- "ReMow"
```

Creates `content/projects/remow.mdx`.

```yaml
---
title: ReMow
status: building
startDate: 2025-01
technologies: [ESP32, Rust, LoRa]
collaborators: [Angel]
links:
  - { label: Repo, href: https://github.com/... }
---
```

| Field            | Required | Notes                                                           |
| ---------------- | -------- | --------------------------------------------------------------- |
| `title`          | yes      |                                                                 |
| `status`         | yes      | `building` · `experiment` · `finished` · `paused` · `abandoned` |
| `startDate`      | yes      | `2025`, `2025-01` or a full date                                |
| `endDate`        | no       | Adding one turns `2025 —` into `2025 — 2026`                    |
| `description`    | no       | One or two lines, shown in listings                             |
| `technologies`   | no       |                                                                 |
| `collaborators`  | no       | Names, shown as-is                                              |
| `coverImage`     | no       | Media public id                                                 |
| `gallery`        | no       | See below                                                       |
| `links`          | no       | `[{ label, href }]`                                             |
| `relatedWriting` | no       | Post slugs — they get linked from the project                   |
| `featured`       | no       | Promotes it on the homepage                                     |
| `order`          | no       | Higher sorts first, overriding status ordering                  |
| `draft`          | no       |                                                                 |

**`abandoned` is a real status, not a failure.** The archive is meant to show the things that
did not work. Mark them and leave them up.

Gallery entries:

```yaml
gallery:
  - {
      publicId: dalibasor/projects/remow/bench-01,
      width: 4032,
      height: 3024,
      alt: 'Bench test',
      caption: 'First full run',
    }
  - { publicId: dalibasor/projects/remow/clip-01, type: video, width: 1920, height: 1080 }
```

---

## Photographs and video

This is the part with tooling, because doing it by hand does not scale to a hundred photos.

### One-time setup

Photographs are stored on Cloudflare R2 and video on Cloudinary.

```bash
cp .env.example .env.local
```

Then fill it in. Every variable is explained in the file itself, which is deliberately the only
place the setup is written out — a second copy in a guide is a copy that goes stale, and this
one did. Creating the bucket, the API token and a custom domain is in
[docs/MEDIA.md](docs/MEDIA.md).

`.env.local` is gitignored. Keep those credentials in your password manager too.

You can skip all of it while you are only writing. With no `.env.local` the site falls back to
the `local` provider, every page renders, and photographs simply come from `public/media`
unresized.

### Create a new year

```bash
npm run new:year -- 2019
```

Creates `content/media/2019.yml`. The year page appears at `/photos/2019` as soon as it has
items.

### Upload 100 photos into an album

Put them in a folder — any folder, anywhere:

```
~/PhotosToUpload/2026/Serbia/
```

Then:

```bash
npm run media:import -- --year 2026 --album serbia --dir ~/PhotosToUpload/2026/Serbia
```

The importer:

1. scans and validates every supported file
2. reads image dimensions and safe EXIF (capture date, orientation)
3. **strips GPS coordinates, device serials and every other private tag before upload**
4. generates a tiny blurred placeholder and an average colour for each image
5. skips anything already uploaded, by content hash
6. uploads to `dalibasor/2026/serbia/` with limited concurrency and retries
7. appends entries to `content/media/2026.yml`, creating the album if it is new
8. prints a summary of uploaded / skipped / failed

**Your originals are never modified, moved or deleted.** The importer works on copies in
memory. See [BACKUP.md](BACKUP.md) for where the originals should actually live.

Useful flags:

```bash
--dry-run              # do everything except upload and write
--album-title "Serbia" # nicer than the auto title-cased slug
--limit 20             # only the first 20 files, for a test run
--concurrency 8        # default is 4
--force                # re-upload even if the hash matches
```

### Upload the year's everyday photos

Leave off `--album`:

```bash
npm run media:import -- --year 2026 --dir ~/PhotosToUpload/2026/Everyday
```

These appear under "Other moments from 2026" on the year page.

### Create an album without uploading yet

```bash
npm run new:album -- 2026 serbia --title "Serbia"
```

### Upload video

Same command. `.mp4`, `.mov`, `.m4v` and `.webm` are recognised and uploaded as video. Poster
frames, adaptive streaming and the mobile player are handled automatically; nothing autoplays
and nothing loads until someone presses play.

One caveat: video metadata is not stripped locally the way image EXIF is. If a clip's location
matters to you, strip it before importing.

### Fix a caption, a date, or a location

Edit `content/media/<year>.yml` directly. It is designed to be hand-edited:

```yaml
items:
  - id: 2026-serbia-0007
    type: image
    album: serbia
    publicId: dalibasor/2026/serbia/img_0042
    width: 4032
    height: 3024
    capturedAt: 2026-07-14T18:22:00
    caption: The last night before we drove back.
    location: Belgrade, Serbia # broad, and only if you want it public
    alt: Three people on a balcony at dusk
    featured: false
```

Re-running the importer preserves anything you have written by hand.

**Locations are always manual.** GPS is stripped at import and never published. If you want a
photo to say `Belgrade, Serbia`, type it.

### Feature a photograph

```yaml
featured: true
```

Featured photographs are used for year previews, the homepage archive section and
"From the archive".

### Set a year or album cover

```yaml
year: 2026
cover: 2026-serbia-0007 # a media id, or a raw publicId

albums:
  - slug: serbia
    title: Serbia
    subtitle: Summer 2026
    date: 2026-07
    cover: 2026-serbia-0012
    note: |
      An optional note about the trip, in your own words.
```

### Check a manifest

```bash
npm run media:check
```

Validates every `content/media/*.yml`: parses, required fields, duplicate ids, orphaned
album references, implausible dimensions. Run it if a photo page looks wrong.

---

## Update the Now page

**Never edit the current Now entry to update it. Create a new one.**

```bash
npm run new:now
```

Creates `content/now/2026-10.mdx` for the current month. `/now` always shows the newest entry;
the previous one stays at its own permanent URL — `/now/2026-09` — and appears in the list of
past entries.

```yaml
---
period: 2026-10
title: October 2026
location: Wichita, Kansas
date: 2026-10-02
---
## Working
...
## Building
...
## Training
...
```

The headings are yours to choose. In twenty years this folder is a month-by-month record of a
life, which only works because nothing is ever overwritten.

### Archiving an old Now page

There is nothing to do. It archives itself the moment you add a newer one.

---

## Update the About page

Edit `content/pages/about.mdx`. The body is ordinary MDX. The optional timeline lives in the
frontmatter:

```yaml
---
title: About
coverImage: dalibasor/about/portrait
timeline:
  - { when: '1993', what: 'Born', where: 'Bosnia and Herzegovina' }
  - { when: '2004', what: 'Moved to the United States' }
  - { when: '2019 — now', what: 'Viaanix' }
---
```

Entries render in the order you write them. Leave the array out entirely and the timeline
disappears.

---

## Tags

Tags are free text in a post's frontmatter. Tag pages (`/writing/tag/fitness`) are generated
from whatever you have used — there is no list to maintain. Capitalisation is preserved for
display and ignored for matching, so `Fitness` and `fitness` are the same tag.

Resist making tags too granular. Ten good tags across five hundred posts beats two hundred
tags used once each.

---

## Before you push

```bash
npm test              # the invariants that would otherwise rot quietly
npm run typecheck     # catches a malformed frontmatter field
npm run build         # catches everything else
npm run media:check   # if you touched a manifest
```

The build deliberately fails on a duplicate slug or an invalid project status, because both
would quietly break URLs.

---

## Rules the site enforces on itself

- **Slugs are permanent.** Changing one breaks every link anyone ever made to it.
- **Now entries are append-only.** That is the whole feature.
- **GPS never ships.** Stripped at import, and the manifest only carries the broad location
  you typed yourself.
- **No faces are detected, tagged or recognised.** Not implemented, not planned.
- **Originals are never touched by any script here.**
