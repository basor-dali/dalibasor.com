import Link from 'next/link';
import { placeHref } from '@/lib/content';
import { cx } from '@/lib/utils';

/**
 * A written location, linked to its place when it has a page.
 *
 * Only where a location stands on its own — never inside a card that is
 * already a link. A location with no page (a placeholder's, say) stays text.
 */
export function PlaceLink({
  location,
  className,
}: {
  location: string | undefined;
  className?: string;
}) {
  if (!location) return null;
  const href = placeHref(location);
  if (!href) return <>{location}</>;
  return (
    <Link href={href} className={cx('u-link u-link-reveal hover:text-ivory', className)}>
      {location}
    </Link>
  );
}
