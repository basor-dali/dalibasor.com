# The editing tools

Two local tools, both of which write plain files into `content/`. Start the dev server and go
to <http://localhost:3000/admin>.

```bash
npm run dev
```

| Tool      | URL            | What it edits                             |
| --------- | -------------- | ----------------------------------------- |
| Keystatic | `/keystatic`   | Writing, projects, Now entries, About     |
| Media     | `/admin/media` | Photographs and video, per year and album |

**Neither exists on the deployed site**, and neither answers to anything but this machine.
See [Why there is no login](#why-there-is-no-login) — it is worth two minutes.

---

## Why there is no login

There is no password on `/admin` or `/keystatic`, and adding one would not make you safer.
Anyone who can reach localhost on this machine can already open `content/` in a text editor and
edit the same files. A login there guards nothing, and is one more thing to lose.

The boundary that matters is not _who_ you are, it is _where the request came from_. Two locks:

**1. Production does not have them.** The pages and all four API routes return a plain 404 in a
production build — indistinguishable from a route that was never built. They write to the
working tree and hold the storage API secret, so on a public URL they would be an
unauthenticated remote-write endpoint.

**2. `npm run dev` listens on 127.0.0.1 only.** This is the real lock. Nothing on your network
can open a socket to it — not a laptop on the same Wi-Fi, not a compromised device, not anyone
in the cafe. Connection refused at the TCP level, before any code runs.

### The exception, and its honest limits

`npm run dev:lan` binds to every interface so you can open the site on your phone. That is
genuinely useful, and it is a real trade: while it runs, this machine is listening on the
network.

In that mode the admin routes fall back to a header check — the request has to claim a loopback
`Host` and `x-forwarded-for`. **That is a speed bump, not a lock.** A browser respects it:
typing `http://192.168.0.131:3000/admin` on a phone gets a 404. Anyone deliberately trying does
not, because the Next dev server passes a client-supplied `Host` and `x-forwarded-for` straight
through, so one curl flag defeats it. This was tested rather than assumed.

So: use `npm run dev` normally. Use `npm run dev:lan` when you want to check the site on a
phone, on a network you trust, and stop it when you are done.

### If you want to edit from somewhere else

Do not open a hole in the admin routes. Switch Keystatic to GitHub storage, which puts a real
identity provider in front of the editor and commits through the GitHub API — see
[Editing from a phone, later](#editing-from-a-phone-later).

That works for words. It deliberately does **not** extend to `/admin/media`, which holds the
storage API secret and writes to the local filesystem. For photographs from a phone, upload
through the provider's own app and run the importer later.

---

## The important part

**These are a front-end onto your files, not a database.**

Keystatic reads and writes the same `.mdx` files you would edit by hand. The media tool writes
the same `content/media/<year>.yml` the CLI importer writes. Nothing moves into a service.

That means the CMS is **disposable**. If Keystatic is abandoned in 2032, delete
`keystatic.config.ts`, `src/app/keystatic/` and `src/app/api/keystatic/`, and your archive is
completely untouched. That is the whole reason it was safe to add.

You can also keep editing files directly in VS Code and committing. Both paths work, on the
same files, at the same time.

---

## Writing, projects, Now, About

`/keystatic`

Real form fields for everything in the frontmatter — tags, cover image, location, featured,
draft — and a rich editor for the body that can insert the site's own components (`Figure`,
`Row`, `Video`, `Pull`, `Note`, `Placeholder`) as blocks rather than as typed-out tags.

Saving writes the file immediately. There is no publish step and no login, because it is
running on your own machine against your own working tree. Commit when you are ready:

```bash
git add content/
git commit -m "Post: getting strong again"
git push
```

### Two things to know

**Slugs are permanent.** Keystatic derives one from the title on creation and lets you edit it.
Once a post is live, changing it breaks every link that ever pointed there.

**Filing under a year is optional.** Existing posts live at `content/writing/2026/<slug>.mdx`
and stay editable. A new entry created in Keystatic lands flat in `content/writing/` unless you
type `2026/my-slug` as the slug. Either works — the site reads the year from the `date` field,
not from the folder. Use `npm run new:post` if you want the year folder without thinking about
it.

### One caveat worth knowing

Keystatic round-trips the body through a structured editor. Anything it does not model — a raw
MDX expression, an unusual comment block, a component that is not declared in
`keystatic.config.ts` — may be normalised or dropped when you save that entry.

In practice this only bites if you hand-write exotic MDX and then open the same file in the CMS.
If you add a component to `src/components/mdx/components.tsx`, **add it to the `mdxComponents`
map in `keystatic.config.ts` too**, and this never comes up.

---

## Photographs and video

`/admin/media`

1. **Pick the year and album.** Leave the album blank and files become that year's everyday
   photographs. Type a new album name and it is created, with a title you can set.
2. **Drop the files in.** A folder's worth at a time. Three upload in parallel; each one reports
   its own result, so one corrupt photo from 2011 does not stop the batch.
3. **Write the captions.** The table below the dropzone edits caption, alt text, location and
   featured, and saves back to the YAML.

This runs the **same pipeline as the CLI** — literally the same module, `scripts/lib/process.mjs`.
So it makes the same promises:

- your originals are never modified, moved or deleted
- GPS coordinates, device serials and filesystem paths are stripped **before** upload
- files already uploaded are recognised by content hash and skipped
- anything you have written by hand in the manifest is preserved

The CLI still exists and is better for very large batches, since it can run for an hour without
a browser tab open:

```bash
npm run media:import -- --year 2019 --album serbia --dir ~/PhotosToUpload/2019/Serbia
```

### What the tool will not overwrite

Captions, alt text, locations and `featured` are yours. Re-importing the same folder never
touches them — see `TECHNICAL_KEYS` in [scripts/lib/manifest.mjs](../scripts/lib/manifest.mjs).
The metadata form is likewise only allowed to write those four fields; it cannot corrupt a
`publicId` or a set of dimensions.

### Locations are always typed by hand

There is no path by which a coordinate reaches the site. GPS is removed at import, and the
`location` field is free text you write yourself — `Belgrade, Serbia`, not `44.7866, 20.4489`.

---

## Setup

```bash
cp .env.example .env.local
```

Every variable is explained in `.env.example` itself, which is deliberately the only place the
setup is written out. Photographs go to Cloudflare R2 and video to Cloudinary;
[MEDIA.md](MEDIA.md) covers creating the bucket and the token.

Restart the dev server afterwards — env files are read once at boot. Without them the media
tool loads but refuses to upload and says exactly what is missing.

---

## Editing from a phone, later

Everything above is local-only by design. If you ever want to write from a phone or a borrowed
laptop, the change is contained:

1. In `keystatic.config.ts`, swap storage:

   ```ts
   storage: {
     kind: 'github',
     repo: { owner: 'dalibasor', name: 'dalibasor.com' },
   }
   ```

2. Create a GitHub App through Keystatic's setup flow at `/keystatic/setup`, which walks you
   through it and gives you the environment variables to add.
3. Remove the production guard in `src/app/keystatic/layout.tsx` so the route exists on the
   deployed site — the GitHub App login becomes the thing protecting it.

Saving then commits to the repository through the GitHub API and Vercel redeploys. Your content
is still MDX in Git; only the transport changes.

**Do not do the same for `/admin/media`.** It holds the bucket's write credentials, generates
every derivative with sharp, and writes to the local filesystem — none of which belongs on a
deployed site. For photographs taken while you are away from your machine, keep the files and
run `npm run media:import` when you are back at it. The originals should reach your own disk
before they reach anything else, which is the whole arrangement in
[BACKUP.md](../BACKUP.md).

---

## If something breaks

| Symptom                                  | Cause                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/keystatic` or `/admin` is 404          | You are on a production build. These are dev-only.                                                  |
| Media tool says credentials are missing  | No `.env.local`, or the dev server was not restarted after adding it.                               |
| An entry will not open in Keystatic      | Frontmatter does not match the schema — a bad `status` or a malformed date. Open the file directly. |
| A photo page looks wrong                 | `npm run media:check`                                                                               |
| An upload says "already in the manifest" | It is. Same file, same content hash.                                                                |
