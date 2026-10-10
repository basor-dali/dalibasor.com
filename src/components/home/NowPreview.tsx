import type { NowEntry } from '@/types/content';
import { ArrowLink } from '@/components/primitives';
import { nowSections } from '@/lib/content';
import { formatPeriod, truncate } from '@/lib/utils';

/**
 * Currently.
 *
 * Deliberately the quietest section on the page — it comes straight after the
 * archive, which is the loudest. A rail on the left, a few lines on the right,
 * and nothing else.
 *
 * The lines are the entry's own sections, a label beside the opening of each,
 * because that is the shape a Now entry is written in. Flattened into one
 * paragraph it read "Working Shipping firmware… Building ReMow, slowly…", and
 * while the entry was still scaffolding it printed the template's instructions
 * on the homepage as though they were the month.
 */

/** Enough to say what each part of the month is, not to reproduce it. */
const SECTION_LIMIT = 4;
const LINE_LIMIT = 150;

export function NowPreview({ entry }: { entry?: NowEntry }) {
  const sections = entry && !entry.placeholder ? nowSections(entry).slice(0, SECTION_LIMIT) : [];
  const excerpt =
    entry && !entry.placeholder && sections.length === 0 && entry.plain
      ? truncate(entry.plain, 320)
      : undefined;

  return (
    <section className="u-page py-(--spacing-section)" aria-labelledby="home-now">
      <div className="u-grid">
        {/* --- rail --- */}
        <div className="col-span-2 md:col-span-6 lg:col-span-3">
          <p className="u-label text-ember">Currently</p>
          <hr className="border-ember-deep mt-4 mb-6 w-16 border-0 border-t" />

          <h2 id="home-now" className="u-display u-nums text-2xl text-white">
            {entry ? entry.title : formatPeriod(nowPeriod())}
          </h2>

          {entry?.location ? (
            <p className="u-label text-muted mt-4">{entry.location}</p>
          ) : null}
        </div>

        {/* --- the entry itself --- */}
        <div className="col-span-2 mt-2 md:col-span-6 lg:col-span-7 lg:col-start-5 lg:mt-0">
          {sections.length > 0 ? (
            <dl className="m-0 max-w-(--container-text-wide)">
              {sections.map((section) => (
                <div
                  key={section.heading}
                  className="border-line grid grid-cols-1 gap-x-8 gap-y-1.5 border-t py-4 first:border-t-0 first:pt-0 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:py-5"
                >
                  <dt className="u-label text-muted sm:pt-1.5">{section.heading}</dt>
                  <dd className="u-serif text-soft m-0 text-xl leading-[1.35]">
                    {truncate(section.text, LINE_LIMIT)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : excerpt ? (
            <p className="u-serif text-soft max-w-(--container-text-wide) text-xl">
              {excerpt}
            </p>
          ) : entry ? (
            /* The entry exists but is still scaffolding, or has nothing written
               in it yet. Say so rather than invent a month — or print the
               template's notes-to-self as though they were one. */
            <div className="border-ember-deep/70 bg-ember-deep/[0.06] max-w-(--container-text) border border-dashed p-5">
              <p className="u-label text-ember mb-3">Placeholder — replace this</p>
              <p className="text-soft text-sm">
                <strong className="text-ivory">[DALI: WRITE THIS IN YOUR OWN WORDS]</strong>
              </p>
            </div>
          ) : (
            <p className="u-serif text-muted max-w-(--container-text) text-xl">
              Nothing written for this month yet.
            </p>
          )}

          <div className="mt-8">
            <ArrowLink href="/now">{entry ? 'Read the current entry' : 'Now'}</ArrowLink>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The current month, used only as a heading when nothing is written yet. */
function nowPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
