import 'server-only';

import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * A bridge to the media pipeline in /scripts.
 *
 * The importer's logic — EXIF reading, GPS stripping, LQIP generation, hashing,
 * derivative encoding, upload, manifest writing — is deliberately NOT
 * reimplemented here.
 * There is one implementation, in plain .mjs with no build step, and both
 * `npm run media:import` and the /admin/media UI call it. Two copies would
 * drift, and the copy that drifts is the one that stops stripping GPS.
 *
 * The modules are loaded through an absolute file:// URL with a turbopackIgnore
 * hint so the bundler leaves them alone. That matters: those files compute
 * their own repo root from `import.meta.url`, which would point into a bundle
 * chunk rather than the real directory if Turbopack inlined them.
 */

type ScriptModule = Record<string, unknown>;

const cache = new Map<string, Promise<ScriptModule>>();

function loadScript(relativePath: string): Promise<ScriptModule> {
  const existing = cache.get(relativePath);
  if (existing) return existing;

  const absolute = path.join(process.cwd(), 'scripts', relativePath);
  const url = pathToFileURL(absolute).href;

  const loading = import(
    /* turbopackIgnore: true */ /* webpackIgnore: true */ url
  ) as Promise<ScriptModule>;
  cache.set(relativePath, loading);
  return loading;
}

/* ==========================================================================
   Typed views over the script modules
   ========================================================================== */

/** The slice of a `yaml` Document the admin routes use. */
/** One item entry inside the manifest, as a YAML node. */
export type ItemNode = {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
};

export type YamlDoc = {
  get(key: string, keepScalar?: boolean): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  createNode(value: unknown): unknown;
  toString(options?: Record<string, unknown>): string;
};

export type ManifestModule = {
  manifestPath: (year: number | string) => string;
  findManifestPath: (year: number | string) => string | null;
  listManifestFiles: () => string[];
  loadManifestDoc: (year: number | string) => {
    doc: YamlDoc;
    file: string;
    existed: boolean;
  };
  saveManifestDoc: (doc: YamlDoc, file: string) => void;
  readManifestFile: (file: string) => unknown;
  addAlbum: (doc: YamlDoc, album: Record<string, unknown>) => boolean;
  addItem: (
    doc: YamlDoc,
    item: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => unknown;
  findItemNodeByHash: (doc: YamlDoc, hash: string) => ItemNode | null;
  findItemNodeById: (doc: YamlDoc, id: string) => ItemNode | null;
  patchItemNode: (node: ItemNode, item: Record<string, unknown>) => void;
  nextItemNumber: (doc: YamlDoc, year: number | string, album?: string) => number;
  formatItemId: (year: number | string, album: string | undefined, n: number) => string;
  albumSlugs: (doc: YamlDoc) => string[];
  itemNodes: (doc: YamlDoc) => ItemNode[];
  slugify: (value: string) => string;
  titleCase: (slug: string) => string;
  displayPath: (absolute: string) => string;
};

export type StripModule = {
  prepareImageForUpload: (input: {
    buffer: Buffer;
    extension: string;
    orientation?: number;
  }) => Promise<{
    buffer: Buffer;
    method: string;
    extension?: string;
    removed?: unknown[];
  }>;
  VIDEO_METADATA_NOTE: string;
};

export type ExifModule = {
  readCaptureInfo: (
    buffer: Buffer,
    stats: { mtime: Date } | null,
    options?: { readExif?: boolean },
  ) => Promise<{ capturedAt?: string; inferred?: boolean; orientation?: number }>;
};

export type UploadModule = {
  loadEnv: (root?: string) => void;
  readCredentials: () => { cloudName?: string; apiKey?: string; apiSecret?: string };
  configureCloudinary: () => unknown;
  folderFor: (base: string, year: number | string, album?: string) => string;
  publicIdLeaf: (filename: string) => string;
  uploadAsset: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  DEFAULT_FOLDER: string;
};

export type ProcessModule = {
  processFile: (
    file: { path: string; name: string; ext: string; kind: string; relative: string },
    context: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  uploadErrorMessage: (error: unknown) => string;
};

export type TargetContext = {
  target: 'r2' | 'cloudinary';
  targetFolder: string;
  missing: string[];
  s3: unknown;
  bucket?: string;
  prefix?: string;
  formats: string[];
  keepOriginal: boolean;
};

export type TargetModule = {
  resolveTarget: (input: {
    target?: string;
    year: number | string;
    album?: string;
    kind?: 'image' | 'video';
    dryRun?: boolean;
    root?: string;
  }) => TargetContext;
  resolveTargetName: (explicit?: string) => 'r2' | 'cloudinary';
  describeTarget: (target: string) => string;
  TARGETS: string[];
};

export const targetLib = () => loadScript('lib/target.mjs') as Promise<TargetModule>;
export const processLib = () => loadScript('lib/process.mjs') as Promise<ProcessModule>;
export const manifestLib = () =>
  loadScript('lib/manifest.mjs') as Promise<ManifestModule>;
export const stripLib = () =>
  loadScript('lib/strip-metadata.mjs') as Promise<StripModule>;
export const exifLib = () => loadScript('lib/exif.mjs') as Promise<ExifModule>;
export const uploadLib = () => loadScript('lib/upload.mjs') as Promise<UploadModule>;
