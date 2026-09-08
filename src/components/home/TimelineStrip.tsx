import Link from 'next/link';
import type { TimelineYear } from '@/lib/content';
import { Label } from '@/components/primitives';
import { cx } from '@/lib/utils';

/**
 * The timeline strip.
 *
 * `2016 ——— 2020 ——— 2024 ——— 2026`. Only years the archive actually knows
 * about appear, so the gaps are real gaps. Years with a photo archive are
 * links; years that only hold writing or projects are marks on the line.
 *
 * It scrolls horizontally inside itself on small screens and never pushes the
 * page sideways.
 */

export function TimelineStrip({ years }: { years: TimelineYear[] }) {
  // getTimeline() hands them back newest first; a timeline reads left to right.
  const ordered = [...years].sort((a, b) => a.year - b.year);
  if (ordered.length === 0) return null;

  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  const latest = last.year;

  return (
    <section className="u-page py-(--spacing-section-sm)" aria-labelledby="home-timeline">
      <div className="border-line flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 border-t pt-6">
        <Label as="h2">
          <span id="home-timeline">Timeline</span>
        </Label>
        <p className="u-label u-nums text-muted">
          {first.year} <span aria-hidden="true">—</span> {last.year}
        </p>
      </div>

      <nav aria-label="Archive timeline" className="mt-10 overflow-x-auto pb-3 sm:mt-12">
        <ol className="flex min-w-max list-none items-start p-0 lg:min-w-full">
          {ordered.map((year, index) => (
            <li
              key={year.year}
              className={cx('flex items-start', index > 0 && 'lg:flex-1')}
            >
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className="bg-line mt-[3px] h-px w-10 sm:w-16 lg:w-auto lg:min-w-6 lg:flex-1"
                />
              ) : null}
              <YearNode year={year} isLatest={year.year === latest} />
            </li>
          ))}
        </ol>
      </nav>
    </section>
  );
}

function YearNode({ year, isLatest }: { year: TimelineYear; isLatest: boolean }) {
  const hasContent = year.total > 0;

  const inner = (
    <>
      <span
        aria-hidden="true"
        className={cx(
          'block h-1.5 w-1.5 transition-colors duration-300',
          hasContent ? 'bg-ember' : 'bg-line-strong',
        )}
      />
      <span
        className={cx(
          'u-label u-nums mt-3 block transition-colors duration-300',
          isLatest ? 'text-ivory' : 'text-muted',
          year.href && 'group-hover:text-white',
        )}
      >
        {year.year}
      </span>
      <span className="u-label u-nums text-muted mt-1.5 block">
        {hasContent ? year.total : <span aria-hidden="true">—</span>}
      </span>
    </>
  );

  const classes = 'flex w-16 shrink-0 flex-col items-center px-1 text-center sm:w-20';

  if (year.href) {
    return (
      <Link
        href={year.href}
        className={cx('group', classes)}
        aria-label={`${year.year} — ${year.total} entries`}
      >
        {inner}
      </Link>
    );
  }

  return <span className={classes}>{inner}</span>;
}
