import type { Metadata } from 'next';
import { ArrowLink, Label, PageHeader } from '@/components/primitives';
import { NOTES_FEED, NOW_FEED, WRITING_FEED } from '@/lib/feeds/entries';
import { absoluteUrl, pageMetadata } from '@/lib/metadata';
import { site } from '@/lib/site';

/**
 * /feeds — how to follow the site without a newsletter.
 *
 * The feeds were linked from the footer as one word, "RSS", and nothing said
 * what they carried or what to do with one. This page says it once, plainly:
 * which feeds exist, what is in each, and the addresses to paste into a
 * reader — written out in full, because that is the part people copy.
 */

export const metadata: Metadata = pageMetadata({
  title: 'Feeds',
  description: `Follow ${site.name}'s writing, notes and Now entries in a feed reader. No newsletter, no account, nothing tracked.`,
  path: '/feeds',
});

const FEEDS = [
  {
    channel: WRITING_FEED,
    name: 'Writing',
    carries: 'Every essay, in full, as it is published.',
  },
  {
    channel: NOTES_FEED,
    name: 'Notes',
    carries: 'The short entries — a sentence, a photograph, a link — each one whole.',
  },
  {
    channel: NOW_FEED,
    name: 'Now',
    carries: 'One entry a month, in full — what I am doing at the time.',
  },
];

export default function FeedsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Follow"
        title="Feeds"
        lede="New writing and each month's Now entry, delivered to a feed reader. No newsletter, no account, nothing tracked."
      />

      <section className="u-page" aria-label="Feeds">
        <ul className="border-line m-0 list-none border-b p-0">
          {FEEDS.map(({ channel, name, carries }) => (
            <li
              key={name}
              className="border-line grid gap-x-(--spacing-gutter) gap-y-4 border-t py-8 sm:py-10 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]"
            >
              <div>
                <h2 className="u-display text-2xl text-white">{name}</h2>
                <p className="text-soft mt-3 max-w-[34ch] text-sm">{carries}</p>
              </div>

              <dl className="m-0 grid min-w-0 gap-y-4 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-x-6">
                <dt className="u-label text-muted sm:pt-1">RSS</dt>
                <dd className="m-0 min-w-0">
                  <a
                    href={channel.rss}
                    className="u-link u-link-reveal text-ivory font-mono text-sm break-all hover:text-white"
                  >
                    {absoluteUrl(channel.rss)}
                  </a>
                </dd>
                <dt className="u-label text-muted sm:pt-1">JSON Feed</dt>
                <dd className="m-0 min-w-0">
                  <a
                    href={channel.json}
                    className="u-link u-link-reveal text-ivory font-mono text-sm break-all hover:text-white"
                  >
                    {absoluteUrl(channel.json)}
                  </a>
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section className="u-page mt-(--spacing-section-sm) pb-(--spacing-section)">
        <div className="u-grid">
          <div className="col-span-2 md:col-span-3 lg:col-span-5">
            <Label as="h2" className="block">
              What is a feed?
            </Label>
            <p className="text-soft mt-4 max-w-(--container-text)">
              A feed reader collects new posts from the sites you choose and shows them in
              one place, in the order they were written — no algorithm deciding what you
              see. Paste one of the addresses above into any reader.
            </p>
            <ArrowLink
              href="https://aboutfeeds.com"
              external
              className="mt-6 inline-block"
            >
              A longer explanation at aboutfeeds.com
            </ArrowLink>
          </div>

          <div className="col-span-2 mt-10 md:col-span-3 md:mt-0 lg:col-span-5 lg:col-start-8">
            <Label as="h2" className="block">
              Or write
            </Label>
            <p className="text-soft mt-4 max-w-(--container-text)">
              Feeds go one way. For the other there is email:{' '}
              <a
                href={`mailto:${site.author.email}`}
                className="u-link u-link-reveal text-ivory hover:text-white"
              >
                {site.author.email}
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
