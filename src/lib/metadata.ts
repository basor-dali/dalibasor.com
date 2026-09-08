import type { Metadata } from 'next';
import { ALLOW_INDEXING, site } from './site';

/**
 * One helper for every page's metadata. Canonical URLs, OpenGraph and Twitter
 * cards all derive from the same inputs so they can never drift apart.
 */

export type PageMetaInput = {
  title: string;
  description?: string;
  /** Path only, e.g. `/writing/getting-strong-again`. */
  path: string;
  /** Absolute or root-relative image URL. Falls back to the generated OG card. */
  image?: string;
  imageAlt?: string;
  type?: 'website' | 'article' | 'profile';
  publishedTime?: string;
  modifiedTime?: string;
  tags?: string[];
  noIndex?: boolean;
};

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${site.url}${path.startsWith('/') ? path : `/${path}`}`;
}

export function pageMetadata(input: PageMetaInput): Metadata {
  const url = absoluteUrl(input.path);
  const description = input.description ?? site.description;
  const image = input.image ? absoluteUrl(input.image) : absoluteUrl(`${input.path}/opengraph-image`);

  return {
    title: input.title,
    description,
    alternates: { canonical: url },
    // Always emit a value. Passing `undefined` here does not inherit the
    // layout's setting — it overrides it with nothing, which is how every page
    // ended up with no robots tag at all while robots.txt said Disallow.
    robots:
      input.noIndex || !ALLOW_INDEXING
        ? { index: false, follow: false, nocache: true }
        : { index: true, follow: true },
    openGraph: {
      title: input.title,
      description,
      url,
      siteName: site.name,
      locale: site.locale,
      type: input.type === 'profile' ? 'profile' : (input.type ?? 'website'),
      images: [{ url: image, width: 1200, height: 630, alt: input.imageAlt ?? input.title }],
      ...(input.type === 'article'
        ? {
            publishedTime: input.publishedTime,
            modifiedTime: input.modifiedTime,
            authors: [site.author.name],
            tags: input.tags,
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description,
      images: [image],
    },
  };
}

/* ==========================================================================
   Structured data
   ==========================================================================
   Minimal and honest. Enough for a search engine to understand that an
   article is an article; nothing that pretends this is a publication. */

export function personJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: site.author.name,
    url: site.url,
    email: `mailto:${site.author.email}`,
    homeLocation: { '@type': 'Place', name: site.location },
    sameAs: site.social.map((entry) => entry.href),
  };
}

export function articleJsonLd(input: {
  title: string;
  description?: string;
  path: string;
  datePublished: string;
  image?: string;
  tags?: string[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: input.title,
    description: input.description,
    url: absoluteUrl(input.path),
    datePublished: input.datePublished,
    keywords: input.tags?.join(', '),
    image: input.image ? absoluteUrl(input.image) : undefined,
    author: { '@type': 'Person', name: site.author.name, url: site.url },
    publisher: { '@type': 'Person', name: site.author.name, url: site.url },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(input.path) },
    inLanguage: site.language,
  };
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: absoluteUrl(entry.path),
    })),
  };
}

/** Renders a JSON-LD block. Kept in one place so escaping is handled once. */
export function jsonLdScript(data: unknown): { __html: string } {
  return {
    __html: JSON.stringify(data, (_key, value) => (value === undefined ? undefined : value)).replace(
      /</g,
      '\\u003c',
    ),
  };
}
