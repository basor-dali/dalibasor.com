# Photographs and video

Where the media actually lives, why it lives there, and how to set it up.

---

## The short version

Photographs are **generated on your machine and uploaded as static files** to Cloudflare R2.
There is no transformation service in front of them. Video still goes to Cloudinary, because
doing video properly means transcoding rather than resizing.

Costs, at the scale this archive is built for:

| | Cloudinary free | R2 |
|---|---|---|
| Storage | 25 credits/mo shared with bandwidth and transforms | 10 GB free, then $0.015/GB/mo |
| Bandwidth | Consumes the same 25 credits | **Free, always** |
| Max image | 10 MB / 25 MP | none |
| 5,000 photographs + every derivative | over the cap | **~$0.40/month** |

---

## Why not just use a transformation service

Because this archive is **immutable**. A photograph from 2019 is never re-cropped. On-demand
transformation — the thing you pay a media CDN for — is a feature this site cannot use.

So every size is generated once, at import, by sharp. What gets uploaded is plain files:

```
dalibasor/2019/novi-sad/img-0042/
  320.avif   640.avif   1024.avif   1600.avif   2048.avif   2560.avif
  320.webp   640.webp   1024.webp   1600.webp   2048.webp   2560.webp
  1024.jpg          the <img src> fallback, the only JPEG
  original.jpg      full resolution, metadata stripped
```

Thirteen derivatives plus the original, about 7 seconds of CPU per photograph. A 500-photo
trip takes roughly ten minutes across eight cores.

The browser picks the format itself from a `<picture>` element — AVIF if it can, WebP
otherwise, and that lone JPEG if somehow neither. That replaces server-side format detection
with something that costs nothing and cannot guess wrong.

AVIF is worth the encode: measured on photographic data it comes out **~30% smaller than WebP
and faster to encode than mozjpeg**.

---

## Setting up R2

**1. Create the bucket.** Cloudflare dashboard → R2 → Create bucket. Name it something like
`dalibasor-media`. Location: automatic.

**2. Make it publicly readable.** Bucket → Settings → Public access. Either enable the
`r2.dev` development URL, or — better — connect a custom domain such as
`media.dalibasor.com`. A custom domain is worth doing: it keeps the URLs yours, so the
provider can change again later without every image URL in the manifest going stale.

**3. Create an API token.** R2 → Manage API Tokens → Create. Permission **Object Read & Write**,
scoped to just this bucket. You get an Access Key ID and a Secret Access Key, shown once.

**4. Fill in `.env.local`:**

```
NEXT_PUBLIC_MEDIA_PROVIDER=r2
NEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://media.dalibasor.com
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=dalibasor-media
R2_PREFIX=dalibasor
```

Restart the dev server. Add the same variables to Vercel for the deployed site — but **only
the two `NEXT_PUBLIC_` ones**. The site never needs the keys; it only reads public URLs.

**5. Set CORS if you use the `r2.dev` URL.** Not needed for a custom domain on the same
account. Only matters for fonts and fetches, not `<img>`.

---

## Importing

Identical to before — the target is read from `NEXT_PUBLIC_MEDIA_PROVIDER`:

```bash
npm run media:import -- --year 2019 --album novi-sad --dir ~/PhotosToUpload/2019/NoviSad
```

Useful flags:

```bash
--target r2          # or cloudinary, to override the default
--no-original        # skip the full-resolution copy, saving roughly half the storage
--dry-run            # everything except uploading and writing
--concurrency 8      # default 4
```

Or drag files into `/admin/media`, which runs exactly the same pipeline.

### About `--no-original`

By default the metadata-stripped full-resolution copy is uploaded alongside the derivatives.
It roughly doubles storage, and it buys you two things: the "open original" link works, and
you get an offsite copy of every photograph for about twenty cents a month.

That is one leg of the 3-2-1 rule in [BACKUP.md](../BACKUP.md) — but only one. **It is not a
substitute for your own backups**, because it holds the stripped copy rather than the true
original, and because a deleted bucket deletes it too.

---

## Rebuilding derivatives

Pre-generating sizes has one cost: they are decided at import. This is the way back.

```bash
npm run media:regenerate -- --year 2019
npm run media:regenerate -- --all --from ~/Archive/photos
npm run media:regenerate -- --all --dry-run
```

Run it when the ladder in `scripts/lib/derivatives.mjs` changes, when a new format becomes
worth adding, or when a redesign wants a width nobody built.

Pixels come from your originals when `--from` finds a matching filename, and otherwise from
the full-resolution copy already in the bucket. Only `--from` can produce a size *larger* than
what was originally uploaded, and it picks up the new dimensions automatically if a better
original has turned up since.

It rewrites derivative objects and the `variants`/`formats` fields. It never touches captions,
alt text, locations, `featured`, ids or album membership.

Derivatives at widths that are no longer generated are left in the bucket. They cost a little
storage and break nothing.

## Getting everything back out

```bash
npm run media:backup -- --to ~/Archive/photos
npm run media:backup -- --verify
```

Downloads the full-resolution copy of every photograph into `<year>/<album>/<filename>`,
mirroring the archive. Resumable — a file already on disk at the right size is skipped.

`--verify` answers the question a backup strategy actually turns on: **is every photograph the
manifest claims to have really in the bucket?** A manifest entry with no object behind it is a
photograph already lost, and you want to find that out now rather than in 2041. Worth running
once a year alongside the ritual in [BACKUP.md](../BACKUP.md).

This retrieves the delivery copy — full resolution, metadata stripped. Your true originals are
the ones on your own disks. This is the offsite leg, not a replacement.

## What is recorded in the manifest

Two fields describe what was generated:

```yaml
- id: 2019-novi-sad-0007
  publicId: dalibasor/2019/novi-sad/img-0042
  width: 4032
  height: 3024
  variants: [320, 640, 1024, 1600, 2048, 2560]
  formats: [avif, webp]
```

`variants` is recorded per photograph rather than inferred from a constant. That matters: if
the ladder ever changes, nothing already imported breaks, because each entry still says
exactly which files exist for it.

---

## Privacy

Unchanged, and still enforced before upload rather than at delivery:

- GPS coordinates, device serials and filesystem paths are stripped from the buffer **before**
  anything leaves the machine — losslessly for an upright JPEG, by re-encode otherwise
- derivatives are generated from that stripped buffer, so nothing private can survive into one
- locations shown on the site are the broad ones you type by hand
- no face detection, no automatic tagging

Your original files are never modified, moved or deleted by any script here.

---

## Video

Video stays on Cloudinary for now, configured separately:

```
NEXT_PUBLIC_VIDEO_PROVIDER=cloudinary
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=...
```

Cloudinary's free tier caps video uploads at **100 MB**, which is roughly thirty seconds of 4K.
Longer clips need either a paid tier or local transcoding.

Moving video across too means transcoding with ffmpeg at import — an H.264 MP4 at a sensible
bitrate plus an extracted poster frame — and writing them to R2 like everything else. The
provider interface already supports it; only the importer would need the ffmpeg step.

---

## Changing provider later

`src/lib/media/` holds one file per provider and an interface they satisfy:

```
provider.ts     the contract every provider implements
r2.ts           pre-generated static files
cloudinary.ts   transforms on demand
local.ts        straight off disk, the lifeboat
index.ts        picks one per asset type from the environment
```

No component knows which is in use. Switching is one environment variable, plus a re-import if
the URL layout differs. Because R2 speaks the S3 API, moving to Backblaze B2, Wasabi, S3 or a
MinIO box you own is a change of endpoint rather than a rewrite.
