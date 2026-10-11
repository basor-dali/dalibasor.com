import Link from 'next/link';
import { getMentions, type Mention } from '@/lib/content';
import { formatDate } from '@/lib/utils';

/**
 * "Mentioned in": everything on the site that links here.
 *
 * Time and place connect the archive already; this is the third thread, the
 * one that says a later piece answers an earlier one. Nothing to maintain —
 * it is read from the links you write — and nothing at all when nothing
 * points here, which is most pages for most of their life.
 */

const KIND: Record<Mention['kind'], string> = {
  essay: 'Essay',
  project: 'Project',
  note: 'Note',
  now: 'Now',
};

export function MentionedIn({ href, className }: { href: string; className?: string }) {
  const mentions = getMentions(href);
  if (mentions.length === 0) return null;

  return (
    <section
      className={className ?? 'u-page mt-(--spacing-section)'}
      aria-labelledby="mentioned-in"
    >
      <hr className="u-rule" />
      <h2 id="mentioned-in" className="u-label text-muted mt-5">
        Mentioned in
      </h2>
      <ul className="border-line mt-8 list-none border-b p-0">
        {mentions.map((mention) => (
          <li key={mention.href} className="border-line border-t">
            <Link
              href={mention.href}
              className="group grid grid-cols-1 items-baseline gap-x-10 gap-y-1 py-5 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <span className="u-serif text-ivory text-xl transition-colors duration-300 group-hover:text-white">
                {mention.title}
                <span className="sr-only">,</span>
              </span>
              <span className="u-label u-nums text-muted">
                {KIND[mention.kind]} <span aria-hidden="true">·</span>{' '}
                {formatDate(mention.date)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
