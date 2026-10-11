import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/primitives';
import { mediaProvider } from '@/lib/media';
import { pageMetadata } from '@/lib/metadata';
import { AI_TRAINING_CRAWLERS } from '@/lib/site';
import { formatDate } from '@/lib/utils';

/**
 * /colophon — how the site is made, and what it does not do.
 *
 * The site keeps promises nobody could see: no cookies, no analytics, GPS
 * stripped from every photograph before it leaves the machine. Practised and
 * never stated, they were worth nothing as trust. This page states them, as a
 * spec sheet in the same register as a project's — facts only, nothing in
 * anyone's voice.
 *
 * The facts that depend on configuration are read from it at build time
 * rather than written down, so the page cannot claim a host or a store the
 * build did not use.
 */

export const metadata: Metadata = pageMetadata({
  title: 'Colophon',
  description:
    'How this site is made: plain files, static pages, no cookies, no analytics, and photographs with their location removed before upload.',
  path: '/colophon',
});

const STORES: Record<string, string> = {
  r2: 'Cloudflare R2, every size generated once when the photograph is imported',
  cloudinary: 'Cloudinary',
  local: 'this site itself',
};

export default function ColophonPage() {
  const built = new Date().toISOString();
  const store = STORES[mediaProvider().name] ?? mediaProvider().name;
  // Vercel sets VERCEL=1 in its build environment.
  const host = process.env.VERCEL === '1' ? 'Vercel' : undefined;

  const rows: { label: string; value: ReactNode }[] = [
    {
      label: 'Privacy',
      value:
        'No cookies. No analytics, counters or tracking scripts. No third-party scripts or embeds; the typefaces are served from this site.',
    },
    {
      label: 'Photographs',
      value:
        'Location and camera serial numbers are removed before a photograph is uploaded. Places are written by hand, and kept broad. No faces are detected, recognised or tagged.',
    },
    {
      label: 'Words',
      value:
        'Plain MDX and YAML files in a Git repository — readable in any text editor, with nothing in a database.',
    },
    // Read from the list robots.txt is built from: empty it, and the claim goes.
    ...(AI_TRAINING_CRAWLERS.length > 0
      ? [
          {
            label: 'AI training',
            value:
              'robots.txt asks the crawlers that collect pages for training AI models to stay away from the writing and the photographs. Search engines, AI search and pages a person asks an assistant to open are allowed.',
          },
        ]
      : []),
    {
      label: 'Built with',
      value:
        'Next.js, React, TypeScript and Tailwind CSS. Every page is generated ahead of time; nothing runs when you open one.',
    },
    { label: 'Photographs served from', value: store },
    ...(host ? [{ label: 'Hosted on', value: host }] : []),
    {
      label: 'Typefaces',
      value:
        'Archivo, Instrument Serif and IBM Plex Mono, all under the SIL Open Font License.',
    },
    {
      label: 'Feeds',
      value: (
        <Link href="/feeds" className="u-link u-link-reveal text-ivory hover:text-white">
          Writing and Now, as RSS and JSON Feed
        </Link>
      ),
    },
    {
      label: 'This version',
      value: (
        <time dateTime={built.slice(0, 10)} className="u-nums">
          Built {formatDate(built)}
        </time>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="This site"
        title="Colophon"
        lede="How this site is made, and the things it deliberately does not do."
      />

      <section className="u-page pb-(--spacing-section)" aria-label="Colophon">
        <dl className="border-line m-0 max-w-(--container-text-wide) border-t">
          {rows.map((row) => (
            <div
              key={row.label}
              className="border-line grid grid-cols-1 gap-x-8 gap-y-2 border-b py-5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:py-6"
            >
              <dt className="u-label text-muted sm:pt-1">{row.label}</dt>
              <dd className="text-soft m-0 min-w-0">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
