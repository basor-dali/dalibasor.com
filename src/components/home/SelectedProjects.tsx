import Link from 'next/link';
import type { ProjectSummary } from '@/types/content';
import { ArrowLink, EmptyState, Label, StatusDot } from '@/components/primitives';
import { STATUS_LABELS } from '@/lib/content';
import { cx, ordinalLabel, truncate } from '@/lib/utils';
import { CoverFrame, LinkCue } from './Hero';

/**
 * Selected projects.
 *
 * Three features, each given real estate. The photograph changes side and size
 * every time so the section reads as three separate moments rather than a
 * repeating template. Nothing here is a case study — these are things being
 * built, paused or abandoned in public.
 */

type Layout = {
  media: string;
  text: string;
  ratio: string;
  sizes: string;
  align: string;
};

const LAYOUTS: Layout[] = [
  {
    media: 'lg:col-start-1 lg:col-span-8 lg:row-start-1',
    text: 'lg:col-start-9 lg:col-span-4 lg:row-start-1',
    ratio: '4 / 3',
    sizes: '(min-width: 64rem) 62vw, 100vw',
    align: 'lg:items-end',
  },
  {
    media: 'lg:col-start-6 lg:col-span-7 lg:row-start-1',
    text: 'lg:col-start-1 lg:col-span-5 lg:row-start-1',
    ratio: '3 / 2',
    sizes: '(min-width: 64rem) 55vw, 100vw',
    align: 'lg:items-center',
  },
  {
    media: 'lg:col-start-1 lg:col-span-6 lg:row-start-1',
    text: 'lg:col-start-8 lg:col-span-5 lg:row-start-1',
    ratio: '1 / 1',
    sizes: '(min-width: 64rem) 46vw, 100vw',
    align: 'lg:items-center',
  },
];

export function SelectedProjects({ projects }: { projects: ProjectSummary[] }) {
  return (
    <section className="py-(--spacing-section)" aria-labelledby="home-projects">
      {/* --- header: rule above, title and link on one baseline ------------- */}
      <div className="u-page">
        <hr className="u-rule-strong" />
        <div className="mt-7 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div>
            <Label className="mb-5 block">Selected work</Label>
            <h2
              id="home-projects"
              className="u-display u-display-tight text-4xl text-white"
            >
              Projects
            </h2>
          </div>
          <ArrowLink href="/projects" className="pb-2">
            All projects
          </ArrowLink>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="u-page mt-14">
          <EmptyState title="Nothing here yet">
            Projects appear here as they get written up — the ones that worked and the
            ones that did not.{' '}
            <Link href="/projects" className="u-link u-link-reveal text-ivory">
              Projects
            </Link>
          </EmptyState>
        </div>
      ) : (
        <ol className="list-none p-0">
          {projects.map((project, index) => (
            <li key={project.slug}>
              <Feature project={project} index={index} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Feature({ project, index }: { project: ProjectSummary; index: number }) {
  const layout = LAYOUTS[index % LAYOUTS.length]!;
  const technologies = project.technologies.slice(0, 6);
  const overflow = project.technologies.length - technologies.length;

  return (
    <article
      className={cx(
        'u-page',
        index === 0
          ? 'mt-14 sm:mt-20'
          : 'mt-(--spacing-section-sm) sm:mt-(--spacing-section)',
      )}
    >
      <Link href={project.href} className="group block">
        <div className={cx('u-grid', layout.align)}>
          <div className={cx('col-span-2 md:col-span-6', layout.media)}>
            <CoverFrame
              publicId={project.coverImage}
              alt={project.coverAlt ?? project.title}
              ratio={layout.ratio}
              ladder="feature"
              sizes={layout.sizes}
              placeholderLabel="Project photograph — to be supplied"
              className="transition-opacity duration-700 group-hover:opacity-90"
            />
          </div>

          <div className={cx('col-span-2 md:col-span-6', layout.text)}>
            <div className="flex items-baseline gap-4">
              <span className="u-label u-nums text-ember">{ordinalLabel(index)}</span>
              <hr className="u-rule flex-1" />
            </div>

            <p className="u-label text-muted mt-6 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-2">
                <StatusDot status={project.status} />
                {STATUS_LABELS[project.status]}
              </span>
              <span aria-hidden="true" className="text-line-strong">
                ·
              </span>
              <span className="u-nums">{project.period}</span>
            </p>

            <h3 className="u-display mt-4 text-3xl text-white">
              <span className="u-link u-link-reveal">{project.title}</span>
            </h3>

            {project.description ? (
              <p className="text-soft mt-5 max-w-(--container-text)">
                {truncate(project.description, 200)}
              </p>
            ) : null}

            {technologies.length > 0 ? (
              <p className="u-label text-muted mt-7">
                {technologies.join('  /  ')}
                {overflow > 0 ? `  /  +${overflow}` : ''}
              </p>
            ) : null}

            <LinkCue className="mt-8">Open</LinkCue>
          </div>
        </div>
      </Link>
    </article>
  );
}
