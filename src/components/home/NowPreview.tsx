import type { NowEntry } from '@/types/content';
import { ArrowLink } from '@/components/primitives';
import { formatPeriod, truncate } from '@/lib/utils';

/**
 * Currently.
 *
 * Deliberately the quietest section on the page — it comes straight after the
 * archive, which is the loudest. A rail on the left, a few lines on the right,
 * and nothing else.
 */

export function NowPreview({ entry }: { entry?: NowEntry }) {
  const excerpt = entry?.plain ? truncate(entry.plain, 320) : undefined;

  return (
    <section className="u-page py-(--spacing-section)" aria-labelledby="home-now">
      <div className="u-grid">
        {/* --- rail --- */}
        <div className="col-span-2 md:col-span-6 lg:col-span-3">
          <p className="u-label text-ember">Currently</p>
          <hr className="mt-4 mb-6 w-16 border-0 border-t border-ember-deep" />

          <h2 id="home-now" className="u-display u-nums text-2xl text-white">
            {entry ? entry.title : formatPeriod(nowPeriod())}
          </h2>

          {entry?.location ? (
            <p className="u-label mt-4 text-muted">{entry.location}</p>
          ) : null}
        </div>

        {/* --- the entry itself --- */}
        <div className="col-span-2 mt-2 md:col-span-6 lg:col-span-7 lg:col-start-5 lg:mt-0">
          {excerpt ? (
            <p className="u-serif max-w-(--container-text-wide) text-xl text-soft">{excerpt}</p>
          ) : entry ? (
            /* An entry exists but has no body yet. Say so rather than invent one. */
            <div className="max-w-(--container-text) border border-dashed border-ember-deep/70 bg-ember-deep/[0.06] p-5">
              <p className="u-label mb-3 text-ember">Placeholder — replace this</p>
              <p className="text-sm text-soft">
                <strong className="text-ivory">[DALI: WRITE THIS IN YOUR OWN WORDS]</strong>
              </p>
            </div>
          ) : (
            <p className="u-serif max-w-(--container-text) text-xl text-muted">
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
