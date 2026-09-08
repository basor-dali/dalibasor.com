/**
 * Site-wide configuration. One place for the handful of facts that appear in
 * metadata, feeds, the footer and structured data.
 */

export const site = {
  name: 'Dali Basor',
  /** Used in <title> suffixes and feed titles. */
  shortName: 'Dali Basor',
  domain: 'dalibasor.com',
  url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://dalibasor.com').replace(/\/$/, ''),
  /** The restrained descriptor. Not a tagline, not a positioning statement. */
  descriptor: 'Technology, projects, places, people and thoughts I want to remember.',
  description:
    'The personal site and archive of Dali Basor — writing, projects, photography and a record of the years.',
  locale: 'en_US',
  language: 'en',
  location: 'Wichita, Kansas',
  /** The year the archive begins. Drives the timeline and empty-state copy. */
  archiveStartYear: 2016,
  /** Born year — used for the "33 years old" style time treatments. */
  birthYear: 1993,
  author: {
    name: 'Dali Basor',
    email: 'hello@dalibasor.com',
  },
  social: [
    { label: 'Instagram', href: 'https://instagram.com/dalibasor', handle: '@dalibasor' },
    { label: 'LinkedIn', href: 'https://linkedin.com/in/dalibasor', handle: 'dalibasor' },
    { label: 'GitHub', href: 'https://github.com/dalibasor', handle: 'dalibasor' },
  ],
} as const;

export type NavItem = {
  label: string;
  href: string;
  /** Longer label for the full-screen mobile menu. */
  note?: string;
};

export const primaryNav: NavItem[] = [
  { href: '/writing', label: 'Writing', note: 'Essays, notes and things I got wrong' },
  { href: '/projects', label: 'Projects', note: 'Things I am building, finished and abandoned' },
  { href: '/photos', label: 'Photos + Video', note: 'The archive, year by year' },
  { href: '/about', label: 'About', note: 'Where I came from and what I do' },
  { href: '/now', label: 'Now', note: 'What I am doing at this moment in my life' },
];

/** Age at a given date — used for the time-as-design-element treatments. */
export function ageAt(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.getUTCFullYear() - site.birthYear;
}
