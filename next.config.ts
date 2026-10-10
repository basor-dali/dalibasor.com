import type { NextConfig } from 'next';

/**
 * The parts of a Content-Security-Policy that cannot break anything here.
 *
 * A full policy would have to allow Next's inline bootstrap scripts, the
 * inline image-reveal script and the JSON-LD blocks — which means nonces,
 * which means rendering every page per request, which this site does not do.
 * These directives need none of that and still close real holes: no plugins,
 * no <base> hijacking, no framing by other sites, no form posting elsewhere.
 * Production only, so the local Keystatic and media tools are never in their
 * way.
 */
const CSP = [
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // No "X-Powered-By: Next.js" on every response — it tells nobody anything
  // useful except which framework's advisories to try.
  poweredByHeader: false,

  // Next generates AGENTS.md / CLAUDE.md on dev boot; this repo documents itself
  // in README, CONTENT_GUIDE and docs/ instead.
  agentRules: false,

  // Pin the workspace root so a stray package-lock.json in a parent directory
  // is never picked up instead of this project's.
  turbopack: { root: import.meta.dirname },

  // Media is delivered by a CDN with our own srcset, so Next's image optimizer
  // is deliberately bypassed. See src/lib/media/provider.ts.
  //
  // Bypassed, and switched off. Nothing uses next/image, yet allowing
  // res.cloudinary.com left /_next/image fetching and resizing any image on
  // any Cloudinary account on request — a free proxy on this site's quota, and
  // the surface of CVE-2026-94483 (SSRF in image optimization). With nothing
  // allowed and optimization off, there is nothing to fetch.
  images: {
    unoptimized: true,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Content-Security-Policy', value: CSP }]
            : []),
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
