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
  /**
   * Links shown in the footer and the mobile menu.
   *
   * Only verified accounts belong here — an outbound link under your own name
   * that lands on a stranger's profile is worse than no link at all. Add
   * Instagram and LinkedIn back once the handles are confirmed:
   *
   *   { label: 'Instagram', href: 'https://instagram.com/<handle>', handle: '@<handle>' },
   *   { label: 'LinkedIn',  href: 'https://linkedin.com/in/<handle>', handle: '<handle>' },
   *
   * Nothing else needs changing — the footer and menu render whatever is here.
   */
  social: [
    { label: 'GitHub', href: 'https://github.com/basor-dali', handle: 'basor-dali' },
  ],
} as const;

/**
 * Indexing is opt-in.
 *
 * Every entry currently ships with placeholder prose, and a search engine that
 * caches "[DALI: WRITE THIS IN YOUR OWN WORDS]" under your own name is slow and
 * annoying to undo. Set this in the deployment environment once the writing is
 * yours:
 *
 *   NEXT_PUBLIC_ALLOW_INDEXING=true
 *
 * It drives both robots.txt and the per-page robots meta tag, which have to
 * agree — robots.txt alone does not stop a page being indexed when something
 * else links to it.
 */
export const ALLOW_INDEXING = process.env.NEXT_PUBLIC_ALLOW_INDEXING === 'true';

/**
 * Crawlers that collect pages to train AI models, asked to stay away.
 *
 * The line is drawn by what a crawler is for, not by company. Training copies
 * the writing and the photographs into a model with no way back to the page;
 * search engines, AI search and fetches a person asks for in the moment all
 * point a reader at the page they came from, so those stay allowed. Several
 * companies run one of each — GPTBot trains, OAI-SearchBot searches — which is
 * why the names are listed one by one rather than by vendor.
 *
 * Google-Extended and Applebot-Extended are not crawlers but switches the two
 * search crawlers honour: Google and Apple still index the site, and do not
 * use it for training. The image scrapers (img2dataset, the LAION ones) are
 * here because this is a photo archive.
 *
 * Taken from the ai.robots.txt project's classification ("AI Data
 * Scrapers"), October 2026, keeping the operators that say what they are.
 * robots.txt is a request, not a lock. Review once a year; empty the list to
 * allow training. Only applies once indexing is on — before that, robots.txt
 * turns every crawler away.
 */
export const AI_TRAINING_CRAWLERS = [
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'Google-Extended',
  'Applebot-Extended',
  'Meta-ExternalAgent',
  'FacebookBot',
  'CCBot',
  'Bytespider',
  'TikTokSpider',
  'cohere-training-data-crawler',
  'AI2Bot',
  'Ai2Bot-Dolma',
  'DeepSeekBot',
  'MistralAI-Training',
  'PanguBot',
  'Timpibot',
  'omgili',
  'Webzio-Extended',
  'img2dataset',
  'LAIONDownloader',
  'laion-huggingface-processor',
] as const;

/**
 * Whether search engines may show the photographs themselves in image search.
 *
 * Off: a family archive's photographs should be found through their album,
 * in context, not one by one in Google Images next to strangers' pictures.
 * The pages stay findable; every page asks search engines not to index the
 * images on it (`noimageindex`), and photographs served from this site carry
 * `X-Robots-Tag: noindex`. Photographs on the media CDN need the same header
 * set there — docs/DEPLOY.md, step 4. Set to true to let them in.
 */
export const IMAGES_IN_SEARCH = false;

export type NavItem = {
  label: string;
  href: string;
  /** Longer label for the full-screen mobile menu. */
  note?: string;
};

export const primaryNav: NavItem[] = [
  { href: '/writing', label: 'Writing', note: 'Essays, notes and things I got wrong' },
  {
    href: '/projects',
    label: 'Projects',
    note: 'Things I am building, finished and abandoned',
  },
  { href: '/photos', label: 'Photos + Video', note: 'The archive, year by year' },
  {
    href: '/years',
    label: 'Years',
    note: 'Everything from one year, together',
  },
  { href: '/about', label: 'About', note: 'Where I came from and what I do' },
  { href: '/now', label: 'Now', note: 'What I am doing at this moment in my life' },
];

/**
 * A mailto: for answering one particular thing — an essay, a project, a month.
 * The subject says which, so a reply arrives with its context attached.
 */
export function replyHref(subject: string): string {
  return `mailto:${site.author.email}?subject=${encodeURIComponent(subject)}`;
}

/** Age at a given date — used for the time-as-design-element treatments. */
export function ageAt(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.getUTCFullYear() - site.birthYear;
}
