import type { ReactNode } from 'react';
import { ArrowLink, StatusDot } from '@/components/primitives';
import { STATUS_LABELS } from '@/lib/content';
import { cx } from '@/lib/utils';
import type { ProjectSummary } from '@/types/content';

/**
 * The project spec block.
 *
 * Deliberately not a row of pills. This is the plate on the back of the thing:
 * mono labels in a fixed left column, values in a wider right column, hairline
 * rules between. It reads like an engineering data sheet, which is what a
 * project record actually is.
 */

export function ProjectMeta({
  project,
  className,
}: {
  project: ProjectSummary;
  className?: string;
}) {
  const rows: { label: string; value: ReactNode }[] = [
    {
      label: 'Status',
      value: (
        <span className="flex items-center gap-2">
          <StatusDot status={project.status} />
          <span className="u-label-lg text-ivory">{STATUS_LABELS[project.status]}</span>
        </span>
      ),
    },
    {
      label: 'Period',
      value: <span className="u-label-lg u-nums text-ivory">{project.period}</span>,
    },
  ];

  if (project.technologies.length > 0) {
    rows.push({
      label: 'Built with',
      value: <Slashed items={project.technologies} />,
    });
  }

  if (project.collaborators.length > 0) {
    rows.push({
      label: 'With',
      value: <Slashed items={project.collaborators} />,
    });
  }

  if (project.links.length > 0) {
    rows.push({
      label: 'Elsewhere',
      value: (
        <span className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          {project.links.map((link) => (
            <ArrowLink key={link.href} href={link.href} external>
              {link.label}
            </ArrowLink>
          ))}
        </span>
      ),
    });
  }

  if (project.placeholder) {
    rows.push({
      label: 'Record',
      value: <span className="u-label-lg text-ember">Scaffold — write-up pending</span>,
    });
  }

  return (
    <dl className={cx('border-line border-t', className)}>
      {rows.map((row) => (
        <div
          key={row.label}
          className="border-line grid grid-cols-1 gap-x-6 gap-y-1.5 border-b py-4 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:py-5"
        >
          <dt className="u-label text-muted pt-0.5">{row.label}</dt>
          <dd className="m-0 min-w-0">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A wrapped run of values divided by hairline slashes. Never a chip. */
function Slashed({ items }: { items: string[] }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
      {items.map((item, index) => (
        <span key={item} className="flex items-baseline gap-2.5">
          {index > 0 ? (
            <span aria-hidden="true" className="u-label text-line-strong">
              /
            </span>
          ) : null}
          <span className="u-label-lg text-soft">{item}</span>
        </span>
      ))}
    </span>
  );
}
