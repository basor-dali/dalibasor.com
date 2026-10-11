/**
 * Where a piece of writing points, inside this site.
 *
 * Pure text in, paths out, so it can be tested without a build. The archive
 * side — who points at what — is lib/content/links.ts.
 *
 * Read from the MDX source rather than the rendered page, so it sees exactly
 * what was written: markdown links, `href` on any element, links written out
 * in full to this site's own domain, and photographs placed with <Figure> or
 * <Video>, which are a mention of that photograph too.
 */

export type Outbound = {
  /** Root-relative paths, without query, fragment or trailing slash. */
  paths: string[];
  /** The `src` of every <Figure> and <Video>: media references, unresolved. */
  media: string[];
};

/** `/writing/x/` → `/writing/x`, `/x?y#z` → `/x`. Not a path → undefined. */
export function normalizePath(raw: string, siteUrl?: string): string | undefined {
  let value = raw.trim();
  if (siteUrl && value.toLowerCase().startsWith(siteUrl.toLowerCase())) {
    value = value.slice(siteUrl.length) || '/';
  }
  if (!value.startsWith('/') || value.startsWith('//')) return undefined;
  value = value.replace(/[?#].*$/, '');
  if (value.length > 1) value = value.replace(/\/+$/, '');
  return value || undefined;
}

export function outboundLinks(source: string, siteUrl?: string): Outbound {
  // Code is quoted, not written: a link inside a code block points nowhere.
  const text = source.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
  const paths = new Set<string>();
  const media = new Set<string>();

  const add = (raw: string | undefined) => {
    const path = raw ? normalizePath(raw, siteUrl) : undefined;
    if (path) paths.add(path);
  };

  // [text](/path) and [text](/path "title"), images excluded: those are pictures.
  for (const match of text.matchAll(/(?<!!)\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)/g))
    add(match[1]);
  // href="/path", href='/path', href={'/path'}, href={"/path"}
  for (const match of text.matchAll(/\bhref=\{?\s*["']([^"']+)["']/g)) add(match[1]);
  // <https://dalibasor.com/path> autolinks, and bare links to this site.
  if (siteUrl) {
    const escaped = siteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const match of text.matchAll(new RegExp(`${escaped}(/[^\\s)>"'\\]]*)?`, 'gi'))) {
      add(match[1] ?? '/');
    }
  }
  // <Figure src="2019-serbia-0003" …>, <Video src="…">
  for (const match of text.matchAll(
    /<(?:Figure|Video)\b[^>]*?\bsrc=\{?\s*["']([^"']+)["']/g,
  )) {
    media.add(match[1]!.trim());
  }

  return { paths: [...paths].sort(), media: [...media].sort() };
}
