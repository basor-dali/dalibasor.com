import type { CSSProperties } from 'react';
import type { MediaItem } from '@/types/content';
import {
  mediaAlt,
  responsiveImage,
  type LadderName,
  type SizesPreset,
} from '@/lib/media';
import { cx } from '@/lib/utils';
import { Picture } from './Picture';

/**
 * The only <img> on this site.
 *
 * A server component with no client JavaScript at all. Everything that makes a
 * photo archive fast happens here:
 *
 *   - the box reserves its exact aspect ratio before anything downloads, so a
 *     year of 200 photographs produces zero layout shift;
 *   - a ~400-byte base64 placeholder is painted as a background immediately;
 *   - the browser picks a width from a srcSet trimmed to the source's own
 *     resolution, so a 400px thumbnail never pulls a 6000px original;
 *   - AVIF/WebP are negotiated by the CDN via `f_auto`;
 *   - everything below the fold is `loading="lazy"` and `decoding="async"`.
 *
 * The fade-in is CSS-only, keyed off the `img` finishing decode — no state, no
 * effect, no hydration cost.
 */

export type MediaImageProps = {
  item: MediaItem;
  ladder?: LadderName;
  sizes?: SizesPreset | (string & {});
  /** `fill` crops to the frame; `fit` keeps the photograph's own proportions. */
  fit?: 'fill' | 'fit';
  /** Force the frame's aspect ratio instead of using the photograph's. */
  ratio?: string;
  /** Above-the-fold images only. Adds fetchpriority and disables lazy loading. */
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  alt?: string;
  /** Cap the widths requested. Use for small fixed slots. */
  maxWidth?: number;
  style?: CSSProperties;
};

export function MediaImage({
  item,
  ladder = 'grid',
  sizes = 'full',
  fit = 'fill',
  ratio,
  priority = false,
  className,
  imgClassName,
  alt,
  maxWidth,
  style,
}: MediaImageProps) {
  const image = responsiveImage(item, {
    ladder,
    sizes,
    fit,
    alt: alt ?? mediaAlt(item),
    maxWidth,
  });

  const frameStyle: CSSProperties = {
    ...style,
    // `--ar` drives the aspect-ratio in .u-frame.
    ['--ar' as string]: ratio ?? image.aspectRatio,
    backgroundColor: image.color ?? undefined,
    backgroundImage: image.lqip ? `url(${image.lqip})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };

  return (
    <div
      className={cx('u-frame', fit === 'fit' && 'u-frame-contain', className)}
      style={frameStyle}
    >
      <Picture image={image} priority={priority} className={imgClassName} />
    </div>
  );
}

/**
 * A cover image referenced from frontmatter by id or public id.
 *
 * Pass `item` whenever the manifest entry is known — the loaders resolve it
 * onto `coverItem`. That is the difference between a responsive `<picture>`
 * and a single 1024px JPEG: a provider serving pre-generated files can only
 * offer the widths and formats the manifest records, so an unresolved
 * reference has no ladder at all, on a page where the hero is usually the LCP
 * element.
 *
 * Without it the image still renders, from the frame's ratio and the fallback
 * file. That is correct for a cover pointing outside the photo archive.
 */
export function CoverImage({
  publicId,
  item: known,
  alt,
  ratio = '16 / 9',
  ladder = 'feature',
  sizes = 'full',
  priority = false,
  className,
  fit = 'fill',
}: {
  publicId: string;
  /**
   * The manifest entry for this reference, when the caller could resolve it.
   *
   * Resolved by the content loaders rather than here: this component is
   * reachable from a client component (WritingArchive → ArticlePreview), so it
   * cannot read the manifest itself.
   */
  item?: MediaItem;
  alt: string;
  ratio?: string;
  ladder?: LadderName;
  sizes?: SizesPreset | (string & {});
  priority?: boolean;
  className?: string;
  fit?: 'fill' | 'fit';
}) {
  const [w, h] = ratio.split('/').map((part) => Number(part.trim()));

  const item: MediaItem = known
    ? { ...known, alt: alt || known.alt }
    : {
        id: publicId,
        type: 'image',
        year: 0,
        publicId,
        // No manifest entry: assume a generous source so the full ladder stays
        // available. Nothing upscales past the original either way.
        width: 3000,
        height: Math.round((3000 * (h || 9)) / (w || 16)),
        orientation: 'landscape',
        alt,
      };

  return (
    <MediaImage
      item={item}
      ladder={ladder}
      sizes={sizes}
      fit={fit}
      ratio={ratio}
      priority={priority}
      className={className}
      alt={alt}
    />
  );
}
