# dalibasor.com

The personal site and archive of Dali Basor — writing, projects, photography, and a record of
the years. Built to be maintained for decades, not quarters.

- **[docs/CMS.md](docs/CMS.md)** — the local editing tools: `/keystatic` for words,
  `/admin/media` for photographs
- **[CONTENT_GUIDE.md](CONTENT_GUIDE.md)** — how to write a post, add a project, upload 100
  photos, update the Now page
- **[docs/MEDIA.md](docs/MEDIA.md)** — where photographs live, and how to set up the bucket
- **[BACKUP.md](BACKUP.md)** — what to back up and how to get everything out
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how it is put together and why

---

## Run it

```bash
npm install
cp .env.example .env.local     # optional — the site runs without it
npm run dev
```

<http://localhost:3000> — and <http://localhost:3000/admin> for the editing tools.

Without `.env.local` the media layer falls back to the `local` provider and serves files from
`public/media`. Every page still renders; photographs just are not optimised.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (also typechecks) |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `npm run media:import` | Upload and index photos/video — see the content guide |
| `npm run media:check` | Validate every media manifest |
| `npm run new:post` | Scaffold a post |
| `npm run new:project` | Scaffold a project |
| `npm run new:now` | Scaffold this month's Now entry |
| `npm run new:year` | Create a year manifest |
| `npm run new:album` | Add an album to a year |

## Stack

Next.js 16 (App Router, static generation) · React 19 · TypeScript · Tailwind CSS v4 ·
MDX via `next-mdx-remote` · YAML media manifests · photographs pre-generated with sharp and
served as static files from Cloudflare R2, behind a swappable provider interface; video on
Cloudinary.

Deployed on Vercel. Nothing runs at request time — every page is static.

There is no animation library. Every transition on the site is CSS, which is both lighter and
less likely to need a migration in five years. If something genuinely needs spring physics or
gesture handling later, `npm i motion` and use it in that one component.

Two versions are pinned below the newest release on purpose:

- **TypeScript 5.9** — `typescript-eslint` does not support TypeScript 7 yet, and a project
  meant to last should have a linter that runs. Revisit when it does.
- **ESLint 9** — the `eslint-plugin-react` bundled inside `eslint-config-next@16` calls an API
  that ESLint 10 removed.

Both are noted here rather than in a comment nobody will find.

## Layout

```
content/            everything Dali writes. Plain text. The actual archive.
src/
  app/              routes, metadata, feeds, OG images
  components/
    chrome/         navigation, footer
    primitives/     the shared vocabulary — labels, section headers, year marks
    media/          image, video, grid, lightbox, albums
    mdx/            what an .mdx file is allowed to contain
    home/ writing/ projects/ now/ about/ search/
  lib/
    content/        reads content/ at build time
    media/          the CDN provider interface and implementations
    search/         the static search index
  types/content.ts  the content contract
scripts/            the media importer and content scaffolding
```

## The rules this repository keeps

- Content is plain text — `.mdx` and `.yml`, readable with no software from 2026.
- Photo originals never live only in a service. See [BACKUP.md](BACKUP.md).
- GPS coordinates and device metadata are stripped before anything is uploaded.
- No faces are detected, tagged or recognised.
- Slugs are permanent URLs.
- Now entries are append-only — updating means adding a file, never editing the old one.
- No tracking, no comments, no newsletter popups, no share widgets, no ads.
