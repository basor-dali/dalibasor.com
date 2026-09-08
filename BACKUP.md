# Backup

What you need to keep so that this archive survives anything — a deleted account, a dead
laptop, a company going out of business, or twenty years.

The rule this site is built around: **nothing irreplaceable lives inside a service you do not
control.** Everything below is either plain text in Git or a file on a disk you own.

---

## The short version

Back up three things:

| # | What | Where it lives | How bad if lost |
|---|------|----------------|-----------------|
| 1 | Your writing and metadata | This Git repository | Catastrophic — irreplaceable |
| 2 | Your original photos and videos | Your own disks (never only Cloudinary) | Catastrophic — irreplaceable |
| 3 | The site code | This Git repository | Annoying, rebuildable |

If you only ever do one thing: **keep `/content` and your photo originals backed up in two
physical places plus one offsite.** Everything else can be reconstructed.

---

## 1. Writing, projects, Now entries and photo metadata

All of it is plain text inside this repository:

```
content/
  writing/2026/*.mdx     your essays and notes
  projects/*.mdx         project write-ups
  now/2026-09.mdx        every Now snapshot, forever
  pages/about.mdx        the About page body
  media/2026.yml         the photo + video manifest for each year
```

**Format:** Markdown with YAML frontmatter, and YAML for the media manifests. Both are open,
text-based, and readable in any editor — including in 2046, with no software from 2026
installed.

**Backup method:** Git. Push to GitHub, and add at least one second remote:

```bash
# a second remote on a different provider
git remote add mirror git@gitlab.com:yourname/dalibasor.com.git
git push mirror main

# or a bare clone on an external drive, updated whenever you remember
git clone --mirror . /Volumes/Archive/dalibasor.com.git
cd /Volumes/Archive/dalibasor.com.git && git remote update
```

A GitHub repository is not a backup. It is one copy that happens to be off your laptop.

**Sanity check:** open any `.mdx` file in Notepad or TextEdit. If you can read your own words
without this website running, the backup is working.

---

## 2. Photo and video originals — the important one

**Cloudinary is a delivery network, not your archive.** The importer uploads a metadata-
stripped copy for the web. Your originals — the full-resolution, unmodified files — stay on
your machine and are never touched by any script in this repository.

Keep them somewhere deliberate and permanent:

```
~/Archive/photos/
  2016/
    Everyday/
    Snapchat-Export/
  2017/
    Everyday/
    NewYork/
  2026/
    Everyday/
    Serbia/
    Angels-Wedding/
```

Mirror the structure of `content/media/*.yml` so that in ten years you can match a manifest
entry to its original file without guessing.

### The 3-2-1 rule

Three copies, two different media, one offsite.

1. **Working copy** — the folder above, on your machine.
2. **Local backup** — an external drive. On Windows, File History or a scheduled
   `robocopy /MIR`. On macOS, Time Machine or `rsync -a --delete`.
   ```powershell
   # Windows — mirror the archive to an external drive
   robocopy "$env:USERPROFILE\Archive\photos" "E:\PhotoArchive" /MIR /R:2 /W:5 /LOG+:E:\backup.log
   ```
3. **Offsite** — Backblaze, an S3/B2 bucket, or a drive at a family member's house. Cloud sync
   folders (Dropbox, iCloud, OneDrive) count only if you understand that a deletion syncs too.
   Prefer a service with versioning and a long deletion grace period.

### Verify it occasionally

A backup you have never restored from is a rumour. Once a year, pick a random photo from 2017,
restore it from the offsite copy, and open it. Put a reminder in your calendar.

### If Cloudinary disappears

You lose nothing irreplaceable. The manifests still contain every caption, date, location and
album. Re-upload the originals to whatever replaces it, keep the same folder structure, and
either point the new provider at the same public ids or run a find-and-replace over
`content/media/*.yml`. Then write a new provider in `src/lib/media/` — see below.

---

## 3. The code

This repository. It is worth backing up, but it is the only thing here that could be rebuilt
from scratch if it vanished. Same Git remotes as section 1.

---

## Exporting the entire archive

### Everything you have written

```bash
# a dated snapshot of all content, independent of Git
tar -czf dalibasor-content-$(date +%Y-%m-%d).tar.gz content/
```

On Windows PowerShell:

```powershell
Compress-Archive -Path content -DestinationPath "dalibasor-content-$(Get-Date -f yyyy-MM-dd).zip"
```

### Everything currently on the media CDN

If you ever need to pull the delivery copies back down (you should still rely on your
originals):

```bash
# list every asset in the account
npx cloudinary-cli ls "folder=dalibasor" --max_results 500

# or use the Admin API directly with the credentials in .env.local
```

Cloudinary's own account settings also offer a full account export. Do this once a year and
drop the result next to your originals.

### The rendered site

```bash
npm run build
# .next/ contains the built site; a static crawl of the deployed URL also works:
wget --mirror --page-requisites --convert-links https://dalibasor.com
```

Worth doing once a decade as a "this is what it looked like in 2031" artifact.

---

## Changing media providers later

The whole media layer sits behind one interface so that this is a contained job, not a rewrite:

```
src/lib/media/provider.ts    the interface every component talks to
src/lib/media/cloudinary.ts  the current implementation
src/lib/media/local.ts       the fallback — serves files from /public/media
src/lib/media/index.ts       picks one based on NEXT_PUBLIC_MEDIA_PROVIDER
```

To move to something else, write one new file implementing `MediaProvider`, add it to the
switch in `index.ts`, and change one environment variable. No component, page or content file
changes.

`local.ts` is also the emergency parachute: drop your originals into `public/media/` matching
the `publicId` paths, set `NEXT_PUBLIC_MEDIA_PROVIDER=local`, and the entire site renders with
no external service at all. It will be slow and heavy — it is a lifeboat, not a home.

---

## What is safe to lose

- `node_modules/` — reinstall with `npm install`
- `.next/` — regenerated by `npm run build`
- Cloudinary derivatives — regenerated on demand from the uploaded copies
- The deployment on Vercel — redeploy from Git in a few minutes

---

## An annual ritual

Once a year, ideally when you write the January Now entry:

1. `git push` to every remote.
2. Mirror the photo originals to the external drive.
3. Confirm the offsite backup ran recently and actually contains this year's photos.
4. Restore one random old file from offsite and open it.
5. Export `content/` to a dated archive and drop it beside the originals.
6. Check that `.env.local` credentials are recorded in your password manager — losing the
   Cloudinary API secret is recoverable, losing the account is not.

Five minutes a year to keep a life's archive.
