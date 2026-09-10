# Deploying

The site is static. Every page is generated at build time and served as a file, so hosting it
is not complicated and does not have to be Vercel — anything that runs `npm run build` and
serves the output will do.

What follows is the order that works, from nothing to a public site. You can stop after step 1
and come back to the rest whenever.

---

## The important thing first

**The site deploys with no credentials at all.** With no R2 and no Cloudinary configured, the
media layer falls back to serving files from `public/media`, and every page still renders. You
do not need the bucket to get a URL — only to put photographs on it.

The archive is currently empty, so nothing is missing or broken; `/photos` says so in plain
words rather than showing holes.

---

## 1. First deploy

1. **vercel.com → Add New → Project → import the repository.** Next.js is detected
   automatically. There is no `vercel.json`; the defaults are correct.
2. **Add one environment variable**, for Production, Preview and Development:

   ```
   NEXT_PUBLIC_SITE_URL=https://dalibasor.com
   ```

   This is what canonical URLs, the sitemap, the OpenGraph cards and both feeds are built from.
   If the domain is not attached yet, use the `.vercel.app` URL for now and change it when it
   is — the site is `noindex` until step 4, so nothing is being published to search engines
   under the wrong address in the meantime.

3. **Deploy.**

Prefer the dashboard to the CLI for this. `vercel` has been observed rewriting
`package-lock.json` in this repository and dropping the `libc` constraints from it, which
breaks `sharp` on Linux — the build then fails on Vercel and works on your machine, which is a
miserable afternoon.

### What is deliberately not there

`/admin`, `/admin/media` and `/keystatic` return 404 in production. They write to the local
filesystem and hold credentials, so they exist only when the dev server is running on your own
machine. You edit locally and push; there is no CMS on the deployed site to secure.

### If you would rather nobody sees it yet

Vercel → Settings → Deployment Protection → Vercel Authentication. That puts the whole
deployment behind your Vercel login, which is the right setting while the writing is still
placeholder text.

---

## 2. Environment variables, and which ones Vercel must never see

The deployed site holds **no secrets**. Importing photographs happens on your machine, so the
keys that can write to the bucket never need to leave it.

| Variable                            | Your `.env.local` | Vercel | Why                                        |
| ----------------------------------- | ----------------- | ------ | ------------------------------------------ |
| `NEXT_PUBLIC_SITE_URL`              | yes               | yes    | Canonicals, sitemap, feeds, share cards    |
| `NEXT_PUBLIC_MEDIA_PROVIDER`        | yes               | yes    | Which provider builds image URLs           |
| `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`    | yes               | yes    | Public read address — it is in every `src` |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | yes               | yes    | Public; appears in every video URL         |
| `NEXT_PUBLIC_ALLOW_INDEXING`        | no                | yes    | Step 4                                     |
| `R2_ACCOUNT_ID`                     | yes               | **no** | Only the importer uses it                  |
| `R2_ACCESS_KEY_ID`                  | yes               | **no** | Can write to your bucket                   |
| `R2_SECRET_ACCESS_KEY`              | yes               | **no** | Can write to your bucket                   |
| `R2_BUCKET`                         | yes               | **no** | Only the importer uses it                  |
| `CLOUDINARY_API_KEY`                | yes               | **no** | Only the importer uses it                  |
| `CLOUDINARY_API_SECRET`             | yes               | **no** | Only the importer uses it                  |

Anything named `NEXT_PUBLIC_` is compiled into the pages and is readable by anyone. That is
correct for all four above — a public bucket address is public by definition — and it is the
reason nothing secret is ever given that prefix.

---

## 3. Photographs

Create the bucket and the token — [MEDIA.md](MEDIA.md) has the walkthrough — then fill in the
R2 variables locally, run `npm run media:import`, and commit the manifest it writes. Add
`NEXT_PUBLIC_MEDIA_PROVIDER` and `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` to Vercel and redeploy.

The photographs themselves are never committed. Git holds the manifest — captions, dates,
albums, dimensions — and the bucket holds the files.

---

## 4. The domain, and going public

1. Vercel → Settings → Domains → add `dalibasor.com` and `www.dalibasor.com`, then set the DNS
   records it gives you at your registrar. An apex domain is usually an `A` record; `www` is a
   `CNAME`. Vercel issues the certificate itself.
2. Confirm `NEXT_PUBLIC_SITE_URL` matches the domain exactly, including `https://` and no
   trailing slash.
3. When there is writing worth finding, set:

   ```
   NEXT_PUBLIC_ALLOW_INDEXING=true
   ```

   Until then `robots.txt` says `Disallow: /` and every page carries a `noindex` tag, so the
   site can be live and unfinished without ending up in search results.

Anything still marked `placeholder: true` stays `noindex` and stays out of the sitemap and both
feeds even after indexing is switched on, so you can publish the site before every page is
written. A placeholder starts being advertised the moment you remove that flag.

---

## Before pushing a deploy

```bash
npm test              # the invariants that would otherwise rot quietly
npm run build         # catches everything typecheck does, and more
npm run media:check   # if a manifest changed
npm run html:check    # after the build, if a component changed
```

Vercel runs `npm run build` itself and a failure there stops the deploy, so a broken build
cannot reach the site. The other three are the ones worth running yourself.

Note that a local build is not the same build. Some route configuration is validated by the
host rather than by Next, so it compiles here and rejects the deployment there — `maxDuration`
on a route is the one that has actually happened. `npm test` checks the settings that behave
that way, which is why it is first in the list.

---

## Somewhere other than Vercel

`npm run build` produces a standard Next.js application. Netlify, Cloudflare Pages, a container
or a plain Node process behind nginx all work; the only requirements are Node 20 or newer and
the `NEXT_PUBLIC_` variables at **build** time, since they are compiled into the output rather
than read at runtime.

Nothing in the site executes at request time — no database, no API, no server-rendered page —
so whatever hosts it is replaceable, which is the point.
