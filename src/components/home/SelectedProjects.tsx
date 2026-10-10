import Link from 'next/link';
import type { ProjectSummary } from '@/types/content';
import { EmptyState, SectionHeader, StatusDot } from '@/components/primitives';
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
        <SectionHeader
          size="display"
          rule="strong"
          eyebrow="Selected work"
          title={<span id="home-projects">Projects</span>}
          link={{ href: '/projects', label: 'All projects' }}
        />
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

/**
 * Where a project with no photograph sits, by position — so a run of them
 * still walks across the page instead of stacking down one edge.
 */
const TYPE_PLACEMENT = [
  'lg:col-span-8 lg:col-start-1',
  'lg:col-span-8 lg:col-start-5',
  'lg:col-span-8 lg:col-start-3',
];

function Feature({ project, index }: { project: ProjectSummary; index: number }) {
  const layout = LAYOUTS[index % LAYOUTS.length]!;
  const technologies = project.technologies.slice(0, 6);
  const overflow = project.technologies.length - technologies.length;

  // A project with no photograph is drawn as type rather than as an empty
  // frame labelled "Cover pending" — some projects (software, a trading bot)
  // will never have one, and a frame says something is missing.
  const hasCover = Boolean(project.coverImage);

  const text = (
    <>
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

      <h3 className={cx('u-display mt-4 text-white', hasCover ? 'text-3xl' : 'text-4xl')}>
        {/* The title is the link; its ::after stretches over the whole
            article, so the photograph and the words go to the same place
            without the entry's accessible name becoming a paragraph. */}
        <Link
          href={project.href}
          className="after:absolute after:inset-0 after:content-['']"
        >
          <span className="u-link u-link-reveal group-hover:[background-size:100%_1px]">
            {project.title}
          </span>
        </Link>
      </h3>

      {project.description ? (
        <p
          className={cx(
            'mt-5 max-w-(--container-text)',
            hasCover ? 'text-soft' : 'u-serif text-soft text-xl',
          )}
        >
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
    </>
  );

  return (
    <article
      className={cx(
        'group u-page relative',
        index === 0
          ? 'mt-14 sm:mt-20'
          : 'mt-(--spacing-section-sm) sm:mt-(--spacing-section)',
      )}
    >
      {hasCover ? (
        <div className={cx('u-grid', layout.align)}>
          <div className={cx('col-span-2 md:col-span-6', layout.media)}>
            <CoverFrame
              publicId={project.coverImage}
              item={project.coverItem}
              alt={project.coverAlt ?? project.title}
              ratio={layout.ratio}
              ladder="feature"
              sizes={layout.sizes}
              placeholderLabel="Cover pending"
              className="transition-opacity duration-700 group-hover:opacity-90"
            />
          </div>

          <div className={cx('col-span-2 md:col-span-6', layout.text)}>{text}</div>
        </div>
      ) : (
        <div className="u-grid">
          <div
            className={cx(
              'col-span-2 md:col-span-6',
              TYPE_PLACEMENT[index % TYPE_PLACEMENT.length],
            )}
          >
            {text}
          </div>
        </div>
      )}
    </article>
  );
}
