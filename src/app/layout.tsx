import type { Metadata, Viewport } from 'next';
import { SiteChrome } from '@/components/chrome/SiteChrome';
import { LightboxProvider } from '@/components/media/MediaLightbox';
import { getArchiveSpan } from '@/lib/content';
import { jsonLdScript, personJsonLd } from '@/lib/metadata';
import { site } from '@/lib/site';
import { fontVariables } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.descriptor}`,
    template: `%s — ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.author.name, url: site.url }],
  creator: site.author.name,
  alternates: {
    canonical: '/',
    types: {
      'application/rss+xml': [{ url: '/writing/rss.xml', title: `${site.name} — Writing` }],
      'application/feed+json': [{ url: '/writing/feed.json', title: `${site.name} — Writing` }],
    },
  },
  openGraph: {
    type: 'website',
    siteName: site.name,
    locale: site.locale,
    url: site.url,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0c0b0a',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // Never block pinch-zoom on a site whose whole point is photographs.
  maximumScale: 5,
};

/**
 * A single capture-phase listener that marks images as loaded so CSS can fade
 * them in. Inlined in <head> so it is running before the first image decodes,
 * and gated behind a class so photographs are simply visible if it never runs.
 */
const IMAGE_REVEAL = `
document.documentElement.classList.add('js-media');
addEventListener('load',function(e){
  var t=e.target;
  if(t&&t.tagName==='IMG')t.dataset.loaded='1';
},true);
document.addEventListener('DOMContentLoaded',function(){
  document.querySelectorAll('img.media-img').forEach(function(i){
    if(i.complete)i.dataset.loaded='1';
  });
});`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const span = getArchiveSpan();

  return (
    <html lang={site.language} className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: IMAGE_REVEAL }} />
        <link
          rel="preconnect"
          href="https://res.cloudinary.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>

        <LightboxProvider>
          <SiteChrome span={span}>{children}</SiteChrome>
        </LightboxProvider>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript(personJsonLd())}
        />
      </body>
    </html>
  );
}
