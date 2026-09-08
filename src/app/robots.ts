import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/metadata';

/**
 * Everything here is public and meant to be found. The only job this file has
 * is to point crawlers at the sitemap.
 */

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
