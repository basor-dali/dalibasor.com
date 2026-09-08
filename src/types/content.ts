/**
 * The content contract.
 *
 * Everything on this site is a file in /content. These types describe what
 * those files are allowed to contain. Keep them small — frontmatter that is
 * cheap to write by hand is frontmatter that still gets written in 2040.
 */

/* ==========================================================================
   Shared
   ========================================================================== */

/** An ISO-ish date string: `2026-09-07` or a full ISO timestamp. */
export type DateString = string;

export type MediaRef = {
  /** Provider-side identifier (Cloudinary public id, or a path under /public/media). */
  publicId: string;
  width?: number;
  height?: number;
  alt?: string;
  /** Tiny inline base64 placeholder generated at import time. */
  lqip?: string;
};

/* ==========================================================================
   Writing
   ========================================================================== */

export type WritingFrontmatter = {
  title: string;
  date: DateString;
  slug?: string;
  /** A short editorial subtitle. Optional — most posts will not have one. */
  subtitle?: string;
  tags?: string[];
  coverImage?: string;
  /** Alt text for the cover. */
  coverAlt?: string;
  /** Crop hint for the cover in listings: "wide" | "tall" | "square". */
  coverShape?: CoverShape;
  location?: string;
  featured?: boolean;
  draft?: boolean;
  /** Optional plain-text summary for listings and metadata. Never required. */
  excerpt?: string;
  /** Marks placeholder scaffolding so it can be found and replaced. */
  placeholder?: boolean;
};

export type CoverShape = 'wide' | 'tall' | 'square';

export type Post = {
  slug: string;
  /** Route path, e.g. `/writing/getting-strong-again`. */
  href: string;
  title: string;
  subtitle?: string;
  date: DateString;
  year: number;
  tags: string[];
  coverImage?: string;
  coverAlt?: string;
  coverShape: CoverShape;
  location?: string;
  featured: boolean;
  draft: boolean;
  excerpt?: string;
  placeholder: boolean;
  /** Raw MDX body, compiled at render time. */
  body: string;
  /** Plain text, used for search indexing and reading time only. */
  plain: string;
  readingMinutes: number;
  /** Path relative to the repo root — shown nowhere, used for diagnostics. */
  sourcePath: string;
};

/** A post reduced to what a listing needs. Keeps RSC payloads small. */
export type PostSummary = Omit<Post, 'body' | 'plain' | 'sourcePath'>;

/* ==========================================================================
   Projects
   ========================================================================== */

export const PROJECT_STATUSES = [
  'building',
  'experiment',
  'finished',
  'paused',
  'abandoned',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectFrontmatter = {
  title: string;
  slug?: string;
  status: ProjectStatus;
  /** Year or `YYYY-MM` or full date. */
  startDate: DateString;
  endDate?: DateString;
  /** One or two lines. Shown in listings and at the top of the project page. */
  description?: string;
  technologies?: string[];
  collaborators?: string[];
  coverImage?: string;
  coverAlt?: string;
  /** Media ids or provider public ids shown in the project gallery. */
  gallery?: ProjectMediaInput[];
  /** External links: repo, product site, video. */
  links?: { label: string; href: string }[];
  /** Slugs of related writing. */
  relatedWriting?: string[];
  featured?: boolean;
  draft?: boolean;
  order?: number;
  placeholder?: boolean;
};

export type ProjectMediaInput = {
  publicId: string;
  type?: 'image' | 'video';
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  poster?: string;
};

export type ProjectUpdate = {
  date: DateString;
  title?: string;
  /** Raw MDX for the update body. */
  body: string;
};

export type Project = {
  slug: string;
  href: string;
  title: string;
  status: ProjectStatus;
  startDate: DateString;
  endDate?: DateString;
  /** `2024 —` / `2023 — 2025` — precomputed for display. */
  period: string;
  description?: string;
  technologies: string[];
  collaborators: string[];
  coverImage?: string;
  coverAlt?: string;
  gallery: ProjectMediaInput[];
  links: { label: string; href: string }[];
  relatedWriting: string[];
  featured: boolean;
  draft: boolean;
  order: number;
  placeholder: boolean;
  body: string;
  plain: string;
  sourcePath: string;
};

export type ProjectSummary = Omit<Project, 'body' | 'plain' | 'sourcePath' | 'gallery'>;

/* ==========================================================================
   Now
   ========================================================================== */

export type NowFrontmatter = {
  /** `2026-09` — this is also the URL segment and the sort key. */
  period: string;
  /** Display heading, e.g. `September 2026`. Derived if absent. */
  title?: string;
  location?: string;
  /** Date the entry was actually written. */
  date?: DateString;
  coverImage?: string;
  coverAlt?: string;
  draft?: boolean;
  placeholder?: boolean;
};

export type NowEntry = {
  period: string;
  href: string;
  title: string;
  location?: string;
  date: DateString;
  year: number;
  coverImage?: string;
  coverAlt?: string;
  draft: boolean;
  placeholder: boolean;
  body: string;
  plain: string;
  sourcePath: string;
};

export type NowSummary = Omit<NowEntry, 'body' | 'plain' | 'sourcePath'>;

/* ==========================================================================
   Media archive
   ========================================================================== */

export type MediaOrientation = 'landscape' | 'portrait' | 'square';

export type MediaItem = {
  /** Stable, human-readable: `2026-serbia-0007`. Never reused. */
  id: string;
  type: 'image' | 'video';
  year: number;
  /** Album slug, or undefined for the year's general "Everyday" photographs. */
  album?: string;
  publicId: string;
  width: number;
  height: number;
  orientation: MediaOrientation;
  /** Local ISO capture time from EXIF, when it could be read. */
  capturedAt?: DateString;
  caption?: string;
  /** Alt text. Falls back to caption, then to a generic description. */
  alt?: string;
  /** Broad, manually specified. Never derived from GPS. */
  location?: string;
  featured?: boolean;
  /** Base64 data URI, ~400 bytes, generated at import. */
  lqip?: string;
  /** Average colour, used before the LQIP paints. */
  color?: string;
  /** Video only. */
  duration?: number;
  poster?: string;
  /** Original filename, kept for provenance. Not displayed. */
  originalFilename?: string;
  /**
   * Extension the full-resolution copy was actually stored under.
   *
   * Not derivable from originalFilename: the importer re-encodes anything it
   * cannot strip losslessly, so a HEIC is stored as .jpg. Guessing from the
   * source name is what made media:backup report every HEIC as missing.
   */
  originalExt?: string;
  /** Content hash — the importer's dedupe key. */
  hash?: string;
  /**
   * Widths actually generated for this asset, for providers that serve
   * pre-generated files. Recorded per item rather than inferred so that
   * changing the ladder later cannot break anything already imported.
   */
  variants?: number[];
  /** Ladder formats generated, best first — e.g. ['avif', 'webp']. */
  formats?: ('avif' | 'webp')[];
};

export type Album = {
  slug: string;
  title: string;
  /** e.g. `Summer 2026` */
  subtitle?: string;
  /** `2026-07` or a full date — used for ordering albums within a year. */
  date?: DateString;
  /** Media id or publicId used as the album cover. */
  cover?: string;
  /** Optional MDX-free note written by Dali. Plain text or light markdown. */
  note?: string;
  location?: string;
  featured?: boolean;
};

export type YearManifest = {
  year: number;
  /** Optional short note about the year, written by hand. */
  note?: string;
  /** Media id or publicId used as the year's opening image. */
  cover?: string;
  albums: Album[];
  items: MediaItem[];
};

/** An album with its items and counts resolved. What album pages receive. */
export type ResolvedAlbum = Album & {
  year: number;
  href: string;
  items: MediaItem[];
  photoCount: number;
  videoCount: number;
  coverItem?: MediaItem;
};

export type ResolvedYear = {
  year: number;
  href: string;
  note?: string;
  coverItem?: MediaItem;
  albums: ResolvedAlbum[];
  /** Items with no album — the year's everyday photographs. */
  everyday: MediaItem[];
  photoCount: number;
  videoCount: number;
  totalCount: number;
};

/** Year reduced to what the archive index needs — no item arrays. */
export type YearSummary = {
  year: number;
  href: string;
  note?: string;
  coverItem?: MediaItem;
  albumCount: number;
  photoCount: number;
  videoCount: number;
  totalCount: number;
  /** A few representative items for the index preview. */
  preview: MediaItem[];
};

/* ==========================================================================
   Cross-cutting
   ========================================================================== */

/** Anything that can surface in "From the archive" or search. */
export type ArchiveEntry =
  | { kind: 'post'; date: DateString; year: number; post: PostSummary }
  | { kind: 'project'; date: DateString; year: number; project: ProjectSummary }
  | { kind: 'album'; date: DateString; year: number; album: ResolvedAlbum }
  | { kind: 'photo'; date: DateString; year: number; item: MediaItem }
  | { kind: 'now'; date: DateString; year: number; now: NowSummary };

export type SearchDoc = {
  id: string;
  kind: 'post' | 'project' | 'album' | 'year' | 'now' | 'page';
  title: string;
  href: string;
  /** Small line under the result: date, status, count. */
  meta?: string;
  tags?: string[];
  year?: number;
  date?: DateString;
  /** Lowercased, whitespace-collapsed searchable text. */
  text: string;
};
