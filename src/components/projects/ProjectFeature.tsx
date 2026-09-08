import Link from 'next/link';
import type { CSSProperties } from 'react';
import { CoverImage } from '@/components/media/MediaImage';
import { StatusDot } from '@/components/primitives';
import { STATUS_LABELS } from '@/lib/content';
import { cx, ordinalLabel } from '@/lib/utils';
import type { ProjectSummary } from '@/types/content';

/**
 * A project at full volume.
 *
 * Three compositions, chosen by position rather than configured per project,
 * so the top of the index never settles into a repeating card rhythm:
 *
 *   lead   — the image takes the full page width, the title sits under it and
 *            the description hangs off to the right.
 *   right  — image on the left across eight columns, a solid ground panel of
 *            text notched into its right edge.
 *   left   — mirrored.
 *
 * Everything is one link. The photograph and the words go to the same place.
 */

type Variant = 'lead' | 'right' | 'left';

export type ProjectFeatureProps = {
  project: ProjectSummary;
  /** Position in the featured run — decides the composition. */
  index: number;
  priority?: boolean;
  /** Keeps the document outline honest wherever the feature is dropped in. */
  headingLevel?: 2 | 3;
  className?: string;
};

/* `sizes` capped at the 108rem page container. Without the cap a 2560px screen
   asks for a 2560px file to fill a 1616px box, and twice that at DPR 2. */
const LEAD_SIZES = '(min-width: 108rem) 101rem, 100vw';
const PANEL_SIZES = '(min-width: 108rem) 66rem, (min-width: 64rem) 63vw, 100vw';

export function ProjectFeature({
  project,
  index,
  priority = false,
  headingLevel = 2,
  className,
}: ProjectFeatureProps) {
  const variant: Variant = index === 0 ? 'lead' : index % 2 === 1 ? 'right' : 'left';
  const ordinal = ordinalLabel(index);
  const Heading = (headingLevel === 3 ? 'h3' : 'h2') as 'h2' | 'h3';

  const cover =
    variant === 'lead' ? (
      <Frame
        project={project}
        ratio="16 / 9"
        ladder="bleed"
        sizes={LEAD_SIZES}
        priority={priority}
      />
    ) : (
      <Frame
        project={project}
        ratio={variant === 'right' ? '3 / 2' : '4 / 3'}
        ladder="feature"
        sizes={PANEL_SIZES}
        priority={priority}
      />
    );

  if (variant === 'lead') {
    return (
      <article className={cx('group', className)}>
        <Link href={project.href} className="block">
          <Stamp project={project} ordinal={ordinal} className="mb-5 sm:mb-7" />
          {cover}
          <div className="u-grid mt-7 sm:mt-9">
            <Heading className="u-display u-display-tight col-span-2 text-3xl text-white transition-colors duration-500 group-hover:text-ivory md:col-span-6 lg:col-span-7">
              {project.title}
            </Heading>
            <div className="col-span-2 md:col-span-6 lg:col-span-4 lg:col-start-9">
              <Body project={project} />
            </div>
          </div>
        </Link>
      </article>
    );
  }

  const imageFirst = variant === 'right';

  return (
    <article className={cx('group', className)}>
      <Link href={project.href} className="u-grid">
        <div
          className={cx(
            'col-span-2 md:col-span-6 lg:col-span-8 lg:row-start-1 lg:self-start',
            imageFirst ? 'lg:col-start-1' : 'lg:col-start-5',
          )}
        >
          {cover}
        </div>

        {/* On wide screens this panel is notched two columns into the
            photograph. Solid ground behind it, so it stays legible over
            anything. */}
        <div
          className={cx(
            'col-span-2 md:col-span-6 lg:col-span-6 lg:row-start-1 lg:self-end lg:bg-ground lg:pt-7',
            imageFirst ? 'lg:col-start-7 lg:pl-7' : 'lg:col-start-1 lg:pr-7',
          )}
        >
          <Stamp project={project} ordinal={ordinal} className="mb-4" />
          <Heading className="u-display u-display-tight text-2xl text-white transition-colors duration-500 group-hover:text-ivory">
            {project.title}
          </Heading>
          <Body project={project} className="mt-4" />
        </div>
      </Link>
    </article>
  );
}

/* --- pieces --------------------------------------------------------------- */

function Stamp({
  project,
  ordinal,
  className,
}: {
  project: ProjectSummary;
  ordinal: string;
  className?: string;
}) {
  return (
    <p
      className={cx(
        'u-label flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3.5 text-muted',
        className,
      )}
    >
      <span className="u-nums text-muted">{ordinal}</span>
      <span aria-hidden="true" className="text-line-strong">
        /
      </span>
      <span className="flex items-center gap-2">
        <StatusDot status={project.status} />
        {STATUS_LABELS[project.status]}
      </span>
      <span aria-hidden="true" className="text-line-strong">
        /
      </span>
      <span className="u-nums text-muted">{project.period}</span>
    </p>
  );
}

function Body({ project, className }: { project: ProjectSummary; className?: string }) {
  return (
    <div className={className}>
      {project.description ? (
        <p className="max-w-[46ch] text-soft">{project.description}</p>
      ) : null}
      {project.technologies.length > 0 ? (
        <p className="u-label mt-5 text-muted">{project.technologies.join('  /  ')}</p>
      ) : null}
      <span className="u-label mt-6 inline-flex items-baseline gap-2 text-ember">
        {/* The whole feature is the link, so the underline is driven by the
            card's hover rather than the span's own. */}
        <span className="u-link u-link-reveal group-hover:[background-size:100%_1px]">
          Open project
        </span>
        <svg
          viewBox="0 0 16 16"
          width="11"
          height="11"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          className="translate-y-px transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:translate-x-1 motion-reduce:transform-none"
        >
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </span>
    </div>
  );
}

function Frame({
  project,
  ratio,
  ladder,
  sizes,
  priority,
}: {
  project: ProjectSummary;
  ratio: string;
  ladder: 'feature' | 'bleed';
  sizes: string;
  priority: boolean;
}) {
  return (
    <div className="overflow-hidden [&_img]:transition-transform [&_img]:duration-[1100ms] [&_img]:ease-[var(--ease-out-expo)] group-hover:[&_img]:scale-[1.03] motion-reduce:[&_img]:transform-none">
      {project.coverImage ? (
        <CoverImage
          publicId={project.coverImage}
          alt={project.coverAlt ?? project.title}
          ratio={ratio}
          ladder={ladder}
          sizes={sizes}
          priority={priority}
        />
      ) : (
        <PlaceholderFrame ratio={ratio} />
      )}
    </div>
  );
}

/* ==========================================================================
   TEMPORARY — delete once real project imagery exists
   ==========================================================================
   No photographs have been shot or imported yet. Rather than hotlink stock or
   collapse the layout, a project with no cover gets a correctly proportioned
   empty plate: surface ground, hairline border, two faint diagonals, one mono
   label. It holds the composition honestly and is trivial to find later —
   search the repo for "PlaceholderFrame". */

export function PlaceholderFrame({
  ratio = '3 / 2',
  label = 'Image — to be supplied',
  className,
}: {
  ratio?: string;
  label?: string;
  className?: string;
}) {
  const style: CSSProperties = { ['--ar' as string]: ratio };

  return (
    <div className={cx('u-frame border border-line bg-surface-2', className)} style={style}>
      <svg
        aria-hidden="true"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full text-line"
      >
        <line x1="0" y1="0" x2="100" y2="100" stroke="currentColor" strokeWidth="0.25" />
        <line x1="100" y1="0" x2="0" y2="100" stroke="currentColor" strokeWidth="0.25" />
      </svg>
      <span className="u-label absolute bottom-3 left-3 text-muted sm:bottom-4 sm:left-4">
        {label}
      </span>
    </div>
  );
}
