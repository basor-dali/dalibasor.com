import type { Metadata } from 'next';
import { EmptyState, MetaLine, PageHeader, SectionHeader, StatusDot } from '@/components/primitives';
import { ProjectFeature } from '@/components/projects/ProjectFeature';
import { ProjectIndexRow } from '@/components/projects/ProjectIndexRow';
import {
  getFeaturedProjects,
  getProjects,
  getProjectsGroupedByStatus,
  STATUS_LABELS,
  STATUS_ORDER,
} from '@/lib/content';
import { pageMetadata } from '@/lib/metadata';
import { primaryNav } from '@/lib/site';
import { cx, ordinalLabel, pluralize, yearOf } from '@/lib/utils';

/**
 * /projects
 *
 * Two registers on one page. The top few things get a full visual feature; the
 * rest fall into a numbered index grouped by status, with abandoned work sitting
 * in the same list as everything else — one contrast step quieter, never hidden.
 * Numbering runs continuously from the features into the index, so the page
 * reads as a single sequence rather than two stacked sections.
 *
 * Nothing here assumes content exists. With an empty /content/projects the page
 * still has to look composed rather than broken, so the empty state is a real
 * layout: the vocabulary of statuses on the right, waiting to be filled.
 */

export const metadata: Metadata = pageMetadata({
  title: 'Projects',
  description:
    'Robotics, electronics, IoT, software and hardware — things being built, things finished, and things abandoned.',
  path: '/projects',
});

const NAV_NOTE = primaryNav.find((item) => item.href === '/projects')?.note;

export default function ProjectsPage() {
  const projects = getProjects();
  const total = projects.length;

  // Features only earn their space once there is a list behind them.
  const features = total >= 4 ? getFeaturedProjects(3) : [];
  const featured = new Set(features.map((project) => project.slug));

  const groups = getProjectsGroupedByStatus()
    .map((group) => ({
      ...group,
      projects: group.projects.filter((project) => !featured.has(project.slug)),
    }))
    .filter((group) => group.projects.length > 0);

  // One continuous run of numbers: the features are 001–003, the index carries on.
  const ordinals = new Map<string, string>();
  let counter = features.length;
  for (const group of groups) {
    for (const project of group.projects) {
      ordinals.set(project.slug, ordinalLabel(counter));
      counter += 1;
    }
  }

  const building = projects.filter((project) => project.status === 'building').length;
  const abandoned = projects.filter((project) => project.status === 'abandoned').length;
  const earliest = total > 0 ? Math.min(...projects.map((p) => yearOf(p.startDate))) : undefined;

  return (
    <>
      <PageHeader
        eyebrow={earliest ? `From ${earliest}` : undefined}
        title="Projects"
        lede={NAV_NOTE}
        meta={
          total > 0 ? (
            <MetaLine
              items={[
                pluralize(total, 'project'),
                building > 0 ? `${building} building` : null,
                abandoned > 0 ? `${abandoned} abandoned` : null,
              ]}
            />
          ) : null
        }
      />

      {total === 0 ? <EmptyIndex /> : null}

      {features.length > 0 ? (
        <section
          aria-label="Featured projects"
          className="u-page flex flex-col gap-(--spacing-section) pb-(--spacing-section)"
        >
          {features.map((project, index) => (
            <ProjectFeature
              key={project.slug}
              project={project}
              index={index}
              priority={index === 0}
            />
          ))}
        </section>
      ) : null}

      {groups.length > 0 ? (
        <section className="u-page pb-(--spacing-section)">
          <SectionHeader
            eyebrow="Index"
            title={features.length > 0 ? 'Everything else' : 'Everything'}
            headingLevel={2}
          />

          <div className="mt-(--spacing-section-sm) flex flex-col gap-(--spacing-section-sm)">
            {groups.map((group) => {
              const dimmed = group.status === 'abandoned';

              return (
                <section key={group.status} className="u-grid">
                  {/* The status is a rubric, not another title: mono at label
                      size, with the count carrying the visual weight. It holds
                      its own narrow column and stays put while the rows scroll
                      past it. */}
                  <header className="col-span-2 md:col-span-6 lg:col-span-3 lg:sticky lg:top-28 lg:self-start">
                    <div className="flex items-baseline justify-between gap-5 lg:block">
                      <h3
                        className={cx(
                          'u-label-lg flex items-center gap-2.5',
                          dimmed ? 'text-soft' : 'text-ivory',
                        )}
                      >
                        <StatusDot status={group.status} />
                        {group.label}
                      </h3>
                      <p
                        aria-hidden="true"
                        className={cx(
                          'u-display u-nums shrink-0 text-3xl lg:mt-5',
                          dimmed ? 'text-line-strong' : 'text-muted',
                        )}
                      >
                        {String(group.projects.length).padStart(2, '0')}
                      </p>
                    </div>
                    <p className="sr-only">{pluralize(group.projects.length, 'project')}</p>
                  </header>

                  <ul className="col-span-2 list-none p-0 md:col-span-6 lg:col-span-9">
                    {group.projects.map((project) => (
                      <ProjectIndexRow
                        key={project.slug}
                        project={project}
                        ordinal={ordinals.get(project.slug) ?? '000'}
                        dimmed={dimmed}
                        headingLevel={4}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}

/* --- nothing here yet ----------------------------------------------------- */

/**
 * The launch state. An empty page still has to be a designed page, so the
 * status vocabulary sits beside the notice: the shape of the index is visible
 * before any entry is in it.
 */
function EmptyIndex() {
  return (
    <section className="u-page pb-(--spacing-section)">
      <div className="u-grid">
        <div className="col-span-2 md:col-span-6 lg:col-span-7">
          <EmptyState title="Nothing written up yet.">
            <p>
              Robotics, electronics, IoT, software and hardware. Entries land here as they get
              recorded — including the ones that stopped.
            </p>
          </EmptyState>
        </div>

        <div className="col-span-2 md:col-span-6 lg:col-span-4 lg:col-start-9">
          <h2 className="u-label text-muted">Statuses</h2>
          <ul className="mt-5 list-none p-0">
            {STATUS_ORDER.map((status) => (
              <li
                key={status}
                className="flex items-center justify-between gap-4 border-t border-line py-3.5"
              >
                <span className="u-label-lg flex items-center gap-2.5 text-soft">
                  <StatusDot status={status} />
                  {STATUS_LABELS[status]}
                </span>
                <span className="u-label u-nums text-line-strong">00</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
