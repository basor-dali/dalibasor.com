import type { LadderName } from '@/lib/media';
import type { ResolvedAlbum } from '@/types/content';
import { cx } from '@/lib/utils';
import { AlbumCard } from './AlbumCard';

/**
 * Albums, laid out as an offset editorial grid rather than a row of equal
 * cards.
 *
 * Placement runs on a six-position cycle against the 12-column grid, so a page
 * of albums staircases down the screen: a wide opener, a smaller one dropped
 * low beside it, then a different split, and so on. Every position is a
 * literal class string — Tailwind has to see them to generate them.
 *
 * On tablet the cycle collapses to a full-width opener plus 2-up rows; on a
 * phone every album is full width, which is the right answer for photographs.
 */

type Placement = {
  className: string;
  sizes: string;
  ladder: LadderName;
  variant: 'feature' | 'standard';
};

const PLACEMENTS: Placement[] = [
  {
    className: 'col-span-2 md:col-span-6 lg:col-span-7 lg:col-start-1',
    sizes: '(min-width: 64rem) 56vw, 92vw',
    ladder: 'feature',
    variant: 'feature',
  },
  {
    className: 'col-span-2 md:col-span-3 lg:col-span-4 lg:col-start-9 lg:mt-28',
    sizes: '(min-width: 64rem) 32vw, (min-width: 48rem) 46vw, 92vw',
    ladder: 'grid',
    variant: 'standard',
  },
  {
    className: 'col-span-2 md:col-span-3 lg:col-span-5 lg:col-start-1',
    sizes: '(min-width: 64rem) 40vw, (min-width: 48rem) 46vw, 92vw',
    ladder: 'feature',
    variant: 'standard',
  },
  {
    className: 'col-span-2 md:col-span-6 lg:col-span-6 lg:col-start-7 lg:mt-20',
    sizes: '(min-width: 64rem) 48vw, 92vw',
    ladder: 'feature',
    variant: 'standard',
  },
  {
    className: 'col-span-2 md:col-span-3 lg:col-span-6 lg:col-start-2',
    sizes: '(min-width: 64rem) 48vw, (min-width: 48rem) 46vw, 92vw',
    ladder: 'feature',
    variant: 'standard',
  },
  {
    className: 'col-span-2 md:col-span-3 lg:col-span-4 lg:col-start-9 lg:mt-16',
    sizes: '(min-width: 64rem) 32vw, (min-width: 48rem) 46vw, 92vw',
    ladder: 'grid',
    variant: 'standard',
  },
];

export type AlbumGridProps = {
  albums: ResolvedAlbum[];
  /** Editorial numbering starts here — pass 0 to number from 001. */
  numberFrom?: number;
  /** The first cover is the page's LCP only when nothing above it is. */
  priorityFirst?: boolean;
  headingLevel?: 2 | 3 | 4;
  className?: string;
};

export function AlbumGrid({
  albums,
  numberFrom,
  priorityFirst = false,
  headingLevel = 3,
  className,
}: AlbumGridProps) {
  if (albums.length === 0) return null;

  // A single album has no grid to be irregular against — give it the full
  // width and let it be a proper opening image.
  const solo = albums.length === 1;

  return (
    <ol className={cx('u-grid list-none p-0', className)}>
      {albums.map((album, index) => {
        const placement = solo
          ? {
              className: 'col-span-2 md:col-span-6 lg:col-span-12',
              sizes: '(min-width: 112rem) 100rem, 92vw',
              ladder: 'bleed' as LadderName,
              variant: 'feature' as const,
            }
          : PLACEMENTS[index % PLACEMENTS.length]!;

        return (
          <li key={album.slug} className={cx('min-w-0 self-start', placement.className)}>
            <AlbumCard
              album={album}
              index={typeof numberFrom === 'number' ? numberFrom + index : undefined}
              variant={placement.variant}
              ladder={placement.ladder}
              sizes={placement.sizes}
              priority={priorityFirst && index === 0}
              headingLevel={headingLevel}
            />
          </li>
        );
      })}
    </ol>
  );
}
