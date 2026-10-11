import type { ReactNode } from 'react';
import { ArrowLink } from '@/components/primitives';

/**
 * One section of a year or a place: a sticky rubric on the left with the
 * section's name, its count and the way out to the full list; the rows on the
 * right.
 */
export function Rubric({
  id,
  title,
  count,
  link,
  children,
}: {
  id: string;
  title: string;
  count: string;
  link?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="u-page mt-(--spacing-section)" aria-labelledby={id}>
      <hr className="u-rule-strong" />
      <div className="u-grid pt-8">
        <div className="col-span-2 md:col-span-6 lg:sticky lg:top-[calc(var(--nav-height)+2.5rem)] lg:col-span-3 lg:self-start">
          <h2 id={id} className="u-display text-2xl text-white">
            {title}
          </h2>
          <p className="u-label text-muted mt-3">{count}</p>
          {link ? (
            <ArrowLink href={link.href} className="mt-6 inline-block">
              {link.label}
            </ArrowLink>
          ) : null}
        </div>
        <div className="col-span-2 mt-8 min-w-0 md:col-span-6 lg:col-span-9 lg:mt-0">
          {children}
        </div>
      </div>
    </section>
  );
}
