import type { TimelineEntry } from '@/lib/content';
import { cx } from '@/lib/utils';

/**
 * The About timeline.
 *
 * An editorial vertical sequence, not a résumé. The `when` carries the weight —
 * set large in mono so a run of years reads as a column of dates you can scan
 * in one pass — and the `what` sits beside it in plain sentence case.
 *
 * Renders exactly what `content/pages/about.mdx` declares in its frontmatter
 * and nothing else. No entries, no component.
 */

export function Timeline({
  entries,
  className,
}: {
  entries: TimelineEntry[];
  className?: string;
}) {
  if (entries.length === 0) return null;

  return (
    <ol className={cx('m-0 list-none border-b border-line p-0', className)}>
      {entries.map((entry, index) => (
        <li
          key={`${entry.when}-${index}`}
          className="grid gap-x-(--spacing-gutter) gap-y-2 border-t border-line py-7 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] sm:py-9 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]"
        >
          <p className="u-nums font-mono text-xl leading-tight tracking-tight text-white">
            {entry.when}
          </p>

          <div className="min-w-0">
            <p className="text-lg text-ivory">{entry.what}</p>
            {entry.where ? <p className="u-label mt-2.5 text-muted">{entry.where}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
