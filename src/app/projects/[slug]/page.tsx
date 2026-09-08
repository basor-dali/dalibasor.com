import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MdxContent } from '@/components/mdx/MdxContent';
import { Placeholder } from '@/components/mdx/components';
import { CoverImage } from '@/components/media/MediaImage';
import { Label, StatusDot, TimeStamp } from '@/components/primitives';
import { EmptyFrame } from '@/components/media/EmptyFrame';
import { ProjectGallery } from '@/components/projects/ProjectGallery';
import { ProjectMeta } from '@/components/projects/ProjectMeta';
import {
  getPost,
  getProject,
  getProjectNeighbours,
  getProjectSlugs,
  STATUS_LABELS,
} from '@/lib/content';
import { breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/metadata';
import { cx, isoDate, pluralize, yearOf } from '@/lib/utils';
import type { Post, ProjectSummary } from '@/types/content';

/**
 * /projects/[slug]
 *
 * A record of a thing being made: name at display scale, a spec block instead
 * of a row of chips, the write-up at reading measure, then the gallery at full
 * page width. Everything a project has is optional — no cover, no gallery, no
 * body, no links — and the page has to hold its shape in every one of those
 * cases, because most entries start life as three lines of frontmatter.
 */

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams(): { slug: string }[] {
  return getProjectSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);

  if (!project) {
    return pageMetadata({
      title: 'Project not found',
      path: `/projects/${slug}`,
      noIndex: true,
    });
  }

  return pageMetadata({
    title: project.title,
    description:
      project.description ??
      `${STATUS_LABELS[project.status]} — ${project.period}. A project by Dali Basor.`,
    path: project.href,
    type: 'article',
    publishedTime: isoDate(project.startDate),
    tags: project.technologies,
    /* Scaffolding is not indexable. Everything is noindex today because
       NEXT_PUBLIC_ALLOW_INDEXING is unset, which makes this look redundant —
       it is the opposite. Setting that one variable is how the site goes
       public, and without this line it would take every unwritten placeholder
       with it, handing search engines notes-to-self as the first thing they
       ever saw at these URLs. */
    noIndex: project.placeholder,
  });
}

export default async function ProjectPage({ params }: PageProps) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const { previous, next } = getProjectNeighbours(project.slug);

  const related = project.relatedWriting
    .map((postSlug) => getPost(postSlug))
    .filter((post): post is Post => Boolean(post));

  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Projects', path: '/projects' },
    { name: project.title, path: project.href },
  ]);

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(breadcrumbs)}
      />

      {/* --- header ------------------------------------------------------ */}
      <header className="u-page pt-36 sm:pt-44">
        <div className="border-line flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b pb-4">
          <Link
            href="/projects"
            className="u-label text-muted hover:text-ivory transition-colors duration-300"
          >
            <span aria-hidden="true">←</span> All projects
          </Link>
          <p className="u-label text-muted flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <StatusDot status={project.status} />
            {STATUS_LABELS[project.status]}
            <span aria-hidden="true" className="text-line-strong">
              /
            </span>
            <span className="u-nums text-muted">{project.period}</span>
          </p>
        </div>

        <h1 className="u-display u-display-tight mt-10 max-w-[15ch] text-4xl text-white sm:mt-14">
          {project.title}
        </h1>
      </header>

      {/* --- opening image ------------------------------------------------ */}
      <div className="u-page mt-10 sm:mt-14">
        {project.coverImage ? (
          <CoverImage
            publicId={project.coverImage}
            item={project.coverItem}
            alt={project.coverAlt ?? project.title}
            ratio="16 / 9"
            ladder="bleed"
            sizes="full"
            priority
          />
        ) : (
          <EmptyFrame ratio="16 / 9" label="Cover pending" />
        )}
      </div>

      {/* --- the spec block ----------------------------------------------- */}
      <div className="u-page mt-(--spacing-section-sm)">
        <div className="u-grid">
          {project.description ? (
            <p className="u-serif text-ivory col-span-2 text-2xl leading-[1.2] md:col-span-6 lg:col-span-5">
              {project.description}
            </p>
          ) : null}
          <div
            className={cx(
              'col-span-2 md:col-span-6',
              project.description
                ? 'lg:col-span-6 lg:col-start-7'
                : 'lg:col-span-7 lg:col-start-1',
            )}
          >
            <ProjectMeta project={project} />
          </div>
        </div>
      </div>

      {/* --- write-up ----------------------------------------------------- */}
      {project.placeholder || project.body ? (
        <div className="u-page mt-(--spacing-section)">
          <div className="u-measure">
            {project.placeholder ? (
              <Placeholder>
                <p>
                  This project record is scaffolding — status, dates and technologies are
                  in place, the account of it is not.
                </p>
                <p>
                  <strong className="text-ivory">
                    [DALI: WRITE THIS IN YOUR OWN WORDS]
                  </strong>
                </p>
              </Placeholder>
            ) : null}

            {project.body ? (
              <div className={cx('prose', project.placeholder && 'mt-10')}>
                <MdxContent source={project.body} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* --- gallery ------------------------------------------------------ */}
      {project.gallery.length > 0 ? (
        <section
          className="u-page mt-(--spacing-section)"
          aria-labelledby="project-gallery"
        >
          <hr className="u-rule mb-6" />
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
            <h2 id="project-gallery" className="u-display text-2xl text-white">
              Gallery
            </h2>
            <Label>{pluralize(project.gallery.length, 'frame')}</Label>
          </div>
          <ProjectGallery
            items={project.gallery}
            title={project.title}
            slug={project.slug}
            year={yearOf(project.startDate)}
            className="mt-8 sm:mt-12"
          />
        </section>
      ) : null}

      {/* --- related writing ---------------------------------------------- */}
      {related.length > 0 ? (
        <section
          className="u-page mt-(--spacing-section)"
          aria-labelledby="related-writing"
        >
          <hr className="u-rule mb-6" />
          <h2 id="related-writing" className="u-display text-2xl text-white">
            Related writing
          </h2>
          <ul className="mt-8 list-none p-0">
            {related.map((post) => (
              <li key={post.slug}>
                <Link
                  href={post.href}
                  className="group border-line hover:border-line-strong grid grid-cols-1 items-baseline gap-x-8 gap-y-2 border-t py-5 transition-colors duration-500 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <span className="u-display text-ivory text-lg transition-colors duration-300 group-hover:text-white sm:text-xl">
                    {post.title}
                  </span>
                  <TimeStamp date={post.date} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* --- neighbours --------------------------------------------------- */}
      {previous || next ? (
        <nav
          aria-label="More projects"
          className="u-page mt-(--spacing-section) pb-(--spacing-section)"
        >
          <hr className="u-rule-strong mb-8" />
          <div className="grid gap-10 sm:grid-cols-2 sm:gap-(--spacing-gutter)">
            {previous ? (
              <Neighbour project={previous} direction="previous" />
            ) : (
              <span className="hidden sm:block" />
            )}
            {next ? <Neighbour project={next} direction="next" /> : null}
          </div>
        </nav>
      ) : null}
    </article>
  );
}

/* --- previous / next ------------------------------------------------------ */

function Neighbour({
  project,
  direction,
}: {
  project: ProjectSummary;
  direction: 'previous' | 'next';
}) {
  const isNext = direction === 'next';

  return (
    <Link href={project.href} className={cx('group block', isNext && 'sm:text-right')}>
      <Label className="block">
        {isNext ? (
          <>
            Next <span aria-hidden="true">→</span>
          </>
        ) : (
          <>
            <span aria-hidden="true">←</span> Previous
          </>
        )}
      </Label>
      <p className="u-display text-ivory mt-3 text-2xl transition-colors duration-300 group-hover:text-white">
        {project.title}
      </p>
      <p
        className={cx(
          'u-label text-muted mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1',
          isNext && 'sm:justify-end',
        )}
      >
        <StatusDot status={project.status} />
        {STATUS_LABELS[project.status]}
        <span aria-hidden="true" className="text-line-strong">
          /
        </span>
        <span className="u-nums">{project.period}</span>
      </p>
    </Link>
  );
}
