import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Next generates AGENTS.md / CLAUDE.md on dev boot; this repo documents itself
  // in README, CONTENT_GUIDE and docs/ instead.
  agentRules: false,

  // Pin the workspace root so a stray package-lock.json in a parent directory
  // is never picked up instead of this project's.
  turbopack: { root: import.meta.dirname },

  // Media is delivered by a CDN with our own srcset, so Next's image optimizer
  // is deliberately bypassed. See src/lib/media/provider.ts.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
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
