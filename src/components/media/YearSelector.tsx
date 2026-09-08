import Link from 'next/link';
import { cx } from '@/lib/utils';

/**
 * Moving between years.
 *
 * Two ways at once: a step to the year either side, and the whole run of years
 * as a single line of numerals — which doubles as a picture of how long the
 * archive is. Everything is a real link, so it works from the keyboard for
 * free, and the run wraps instead of scrolling sideways so nothing ever
 * overflows a phone.
 */

export type YearSelectorProps = {
  /** Every year in the archive, newest first. */
  years: number[];
  current: number;
  className?: string;
};

export function YearSelector({ years, current, className }: YearSelectorProps) {
  if (years.length === 0) return null;

  const index = years.indexOf(current);
  // Years run newest first, so the neighbour below is later in time.
  const later = index > 0 ? years[index - 1] : undefined;
  const earlier = index >= 0 ? years[index + 1] : undefined;

  return (
    <nav aria-label="Archive years" className={cx(className)}>
      <hr className="u-rule-strong" />

      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-8 pt-7">
        <StepLink year={earlier} direction="earlier" />
        <StepLink year={later} direction="later" />
      </div>

      <ol className="mt-12 flex list-none flex-wrap items-baseline gap-x-5 gap-y-4 p-0 sm:gap-x-7">
        {years.map((year) => {
          const isCurrent = year === current;
          return (
            <li key={year}>
              <Link
                href={`/photos/${year}`}
                aria-current={isCurrent ? 'page' : undefined}
                className={cx(
                  'u-label-lg u-nums block py-1 transition-colors duration-300',
                  isCurrent
                    ? 'text-ember'
                    : 'text-muted hover:text-ivory focus-visible:text-ivory',
                )}
              >
                {year}
                {isCurrent ? <span className="sr-only"> (current year)</span> : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepLink({
  year,
  direction,
}: {
  year: number | undefined;
  direction: 'earlier' | 'later';
}) {
  const isEarlier = direction === 'earlier';
  const align = isEarlier ? 'text-left' : 'text-right';

  if (!year) {
    return (
      <p className={cx('u-label max-w-[14rem] text-muted', align)}>
        {isEarlier ? 'The earliest year filed' : 'The most recent year'}
      </p>
    );
  }

  return (
    <Link href={`/photos/${year}`} className={cx('group block max-w-[14rem]', align)}>
      <span className="u-label block text-muted transition-colors duration-300 group-hover:text-muted">
        {isEarlier ? 'Earlier' : 'Later'}
      </span>
      <span className="u-display u-nums mt-3 block text-3xl text-ivory transition-colors duration-300 group-hover:text-white">
        {isEarlier ? (
          <span aria-hidden="true" className="mr-3 text-muted">
            &larr;
          </span>
        ) : null}
        {year}
        {isEarlier ? null : (
          <span aria-hidden="true" className="ml-3 text-muted">
            &rarr;
          </span>
        )}
      </span>
    </Link>
  );
}
