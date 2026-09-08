import Link from 'next/link';
import { StatusDot } from '@/components/primitives';
import { STATUS_LABELS } from '@/lib/content';
import { cx } from '@/lib/utils';
import type { ProjectSummary } from '@/types/content';

/**
 * One line of the index.
 *
 * A hairline-ruled register rather than a card: number, name, what it is and
 * what it was made of, all landing on the same vertical alignments down the
 * page. On a phone it folds into a number gutter and a stacked block.
 *
 * `dimmed` is for abandoned work. It steps the contrast down one notch and
 * changes nothing else — the row keeps its number, its dates and its place in
 * the sequence. A thing that stopped is still a thing that happened.
 */

export type ProjectIndexRowProps = {
  project: ProjectSummary;
  /** `007` — continuous across the whole index, not per status group. */
  ordinal: string;
  dimmed?: boolean;
  /** Keeps the outline honest when the rows sit under a group heading. */
  headingLevel?: 3 | 4;
};

export function ProjectIndexRow({
  project,
  ordinal,
  dimmed = false,
  headingLevel = 3,
}: ProjectIndexRowProps) {
  const Heading = (headingLevel === 4 ? 'h4' : 'h3') as 'h3' | 'h4';

  return (
    <li>
      <Link
        href={project.href}
        className="group grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2.5 border-t border-line py-5 transition-colors duration-500 hover:border-line-strong sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-x-6 sm:py-6 lg:grid-cols-[3rem_minmax(0,1fr)_9rem_minmax(0,11rem)] lg:gap-x-6 xl:gap-x-10"
      >
        <span className={cx('u-label u-nums', dimmed ? 'text-mute' : 'text-muted')}>
          {ordinal}
        </span>

        <div className="min-w-0">
          <Heading
            className={cx(
              'u-display text-xl transition-colors duration-300 sm:text-2xl',
              dimmed ? 'text-soft group-hover:text-ivory' : 'text-ivory group-hover:text-white',
            )}
          >
            {project.title}
          </Heading>
          {project.description ? (
            <p className="mt-2 line-clamp-2 max-w-[54ch] text-sm text-muted">
              {project.description}
            </p>
          ) : null}
        </div>

        <p className="col-start-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 lg:col-start-auto">
          <StatusDot status={project.status} />
          <span className={cx('u-label', dimmed ? 'text-mute' : 'text-muted')}>
            {STATUS_LABELS[project.status]}
          </span>
          {/* The <p> is not itself a u-label, so the divider has to carry the
              mono sizing or it renders at body size next to 11px metadata. */}
          <span aria-hidden="true" className="u-label text-line-strong">
            /
          </span>
          <span className="u-label u-nums text-mute">{project.period}</span>
        </p>

        <div className="col-start-2 flex items-baseline justify-between gap-4 lg:col-start-auto">
          <p className="u-label min-w-0 text-mute">{project.technologies.join('  /  ')}</p>
          <svg
            viewBox="0 0 16 16"
            width="11"
            height="11"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            className="hidden shrink-0 -translate-x-1.5 self-center text-ember opacity-0 transition-all duration-500 ease-[var(--ease-out-expo)] group-hover:translate-x-0 group-hover:opacity-100 lg:block"
          >
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </div>
      </Link>
    </li>
  );
}
