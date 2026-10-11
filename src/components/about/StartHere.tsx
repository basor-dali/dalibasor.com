import Link from 'next/link';
import type { PostSummary, ProjectSummary } from '@/types/content';
import { formatDate } from '@/lib/utils';

/**
 * Start here: the essays and projects you have marked `featured`.
 *
 * No new flag — `featured` already means "these first" on the homepage and at
 * the head of the writing index; this is the same choice, offered to someone
 * who has just arrived on the About page. Only what is written: a featured
 * placeholder is not something to start with, so until one is real the
 * section is not there at all.
 */
export function StartHere({
  posts,
  projects,
}: {
  posts: PostSummary[];
  projects: ProjectSummary[];
}) {
  if (posts.length + projects.length === 0) return null;

  return (
    <section className="u-page mt-(--spacing-section)" aria-labelledby="about-start">
      <hr className="u-rule" />
      <h2 id="about-start" className="u-label text-muted mt-5">
        Start here
      </h2>

      <ul className="border-line mt-10 list-none border-b p-0">
        {posts.map((post) => (
          <li key={post.slug} className="border-line border-t">
            <Link
              href={post.href}
              className="group grid grid-cols-1 items-baseline gap-x-10 gap-y-2 py-6 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <span className="u-display text-ivory text-2xl transition-colors duration-300 group-hover:text-white">
                {post.title}
                <span className="sr-only">,</span>
              </span>
              <span className="u-label u-nums text-muted">
                Essay <span aria-hidden="true">·</span> {formatDate(post.date)}
              </span>
            </Link>
          </li>
        ))}
        {projects.map((project) => (
          <li key={project.slug} className="border-line border-t">
            <Link
              href={project.href}
              className="group grid grid-cols-1 items-baseline gap-x-10 gap-y-2 py-6 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <span className="u-display text-ivory text-2xl transition-colors duration-300 group-hover:text-white">
                {project.title}
                <span className="sr-only">,</span>
              </span>
              <span className="u-label u-nums text-muted">
                Project <span aria-hidden="true">·</span> {project.period}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
