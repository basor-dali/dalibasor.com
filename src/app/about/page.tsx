import type { Metadata } from 'next';
import { Timeline } from '@/components/about/Timeline';
import { MdxContent } from '@/components/mdx/MdxContent';
import { Placeholder } from '@/components/mdx/components';
import { CoverImage } from '@/components/media/MediaImage';
import { MetaLine, SectionHeader } from '@/components/primitives';
import { getAboutTimeline, getPage } from '@/lib/content';
import { pageMetadata } from '@/lib/metadata';
import { site } from '@/lib/site';
import { truncate } from '@/lib/utils';

/**
 * /about
 *
 * A portrait held tall on the left, the name knocked out over the bottom of it
 * on a panel of ground, and the writing set off-centre to the right. Facts that
 * are actually fixed — a birth year, a city, the year the archive starts — are
 * the only metadata on the page. Nothing here is a CV.
 */

const PORTRAIT_SIZES = '(min-width: 64rem) 40vw, 100vw';

export function generateMetadata(): Metadata {
  const page = getPage('about');
  const subtitle = page?.subtitle?.trim();
  const plain = page?.plain?.trim();

  return pageMetadata({
    title: 'About',
    description:
      subtitle || (plain ? truncate(plain, 160) : `${site.name} — ${site.descriptor}`),
    path: '/about',
    type: 'profile',
  });
}

export default function AboutPage() {
  const page = getPage('about');
  const timeline = getAboutTimeline();
  const subtitle = page?.subtitle?.trim();
  const body = page?.body?.trim();
  const portrait = page?.coverImage?.trim();
  const portraitAlt = page?.coverAlt?.trim() || site.name;

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Opener                                                            */}
      {/* ---------------------------------------------------------------- */}
      <header className="u-page pt-36 sm:pt-44">
        <hr className="u-rule" />

        <p className="u-label mt-5 text-ember">About</p>

        <div className="u-grid mt-12 items-start sm:mt-16">
          {/* The photograph leads, and the name runs over the foot of it. */}
          <div className="col-span-2 md:col-span-6 lg:col-span-5">
            {portrait ? (
              <CoverImage
                publicId={portrait}
                alt={portraitAlt}
                ratio="4 / 5"
                ladder="feature"
                sizes={PORTRAIT_SIZES}
                priority
              />
            ) : (
              <PortraitPlaceholder />
            )}
          </div>

          <div className="col-span-2 min-w-0 md:col-span-6 lg:col-span-7 lg:pt-28">
            <h1 className="u-display u-display-tight relative z-10 text-5xl text-white lg:-ml-[16%]">
              <span className="block w-fit bg-ground py-1 pr-5 sm:pr-8">Dali</span>
              <span className="block w-fit bg-ground py-1 pr-5 sm:pr-8">Basor</span>
            </h1>

            {subtitle ? (
              <p className="u-serif mt-10 max-w-(--container-text) text-xl text-soft">{subtitle}</p>
            ) : null}

            <MetaLine
              className="mt-10"
              items={[
                `Born ${site.birthYear}`,
                site.location,
                `Archive from ${site.archiveStartYear}`,
              ]}
            />
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* The writing — offset right of centre, no sidebar, nothing else in */}
      {/* the frame with it.                                                */}
      {/* ---------------------------------------------------------------- */}
      <section className="u-page mt-(--spacing-section)" aria-label="About Dali Basor">
        <div className="u-grid">
          <div className="col-span-2 min-w-0 md:col-span-6 lg:col-span-8 lg:col-start-4">
            <span aria-hidden="true" className="mb-10 block h-px w-16 bg-ember-deep" />

            <div className="prose max-w-(--container-text)">
              {body ? (
                <MdxContent source={body} />
              ) : (
                <Placeholder>
                  <p>
                    <strong className="text-ivory">[DALI: WRITE THIS IN YOUR OWN WORDS]</strong>
                  </p>
                  <p>
                    This page renders <code>content/pages/about.mdx</code>. Create it, write the
                    body as ordinary MDX, and add the timeline to the frontmatter as{' '}
                    <code>timeline: [{'{'} when, what, where {'}'}]</code>.
                  </p>
                </Placeholder>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Timeline — only what the content file declares.                   */}
      {/* ---------------------------------------------------------------- */}
      {timeline.length > 0 ? (
        <section className="u-page mt-(--spacing-section)" aria-label="Timeline">
          <SectionHeader eyebrow="Timeline" title="The order of events" />
          <Timeline entries={timeline} className="mt-12 sm:mt-16" />
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Elsewhere — quiet, at the end, where it belongs.                  */}
      {/* ---------------------------------------------------------------- */}
      <section className="u-page mt-(--spacing-section)" aria-label="Elsewhere">
        <hr className="u-rule" />
        <h2 className="u-label mt-5 text-muted">Elsewhere</h2>

        <ul className="mt-10 grid list-none gap-x-(--spacing-gutter) gap-y-0 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {site.social.map((entry) => (
            <li key={entry.label} className="border-t border-line">
              <a
                href={entry.href}
                target="_blank"
                rel="me noreferrer"
                className="group/out block py-5"
              >
                <span className="u-display block text-xl text-ivory transition-colors duration-300 group-hover/out:text-white">
                  {entry.label}
                </span>
                <span className="u-label mt-2 block text-muted transition-colors duration-300 group-hover/out:text-ember">
                  {entry.handle}
                </span>
              </a>
            </li>
          ))}

          <li className="border-t border-line">
            <a href={`mailto:${site.author.email}`} className="group/out block py-5">
              <span className="u-display block text-xl text-ivory transition-colors duration-300 group-hover/out:text-white">
                Email
              </span>
              <span className="u-label mt-2 block break-all text-muted transition-colors duration-300 group-hover/out:text-ember">
                {site.author.email}
              </span>
            </a>
          </li>
        </ul>
      </section>
    </>
  );
}

/* ==========================================================================
   REMOVABLE SCAFFOLD
   ==========================================================================
   There is no portrait in the archive yet. This holds its exact frame so the
   composition — and the name knocked out over the foot of it — is real before
   the photograph exists. Delete this component and its single use above the
   moment `coverImage` is set in content/pages/about.mdx. */

function PortraitPlaceholder() {
  return (
    <div
      aria-hidden="true"
      style={{ aspectRatio: '4 / 5' }}
      className="relative border border-line bg-surface-2"
    >
      <span className="absolute top-5 left-5 block h-px w-8 bg-ember-deep" />
      <span className="u-label absolute right-5 bottom-5 left-5 text-muted">
        Portrait <span className="text-muted">— photograph pending</span>
      </span>
    </div>
  );
}
