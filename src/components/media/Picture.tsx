import type { CSSProperties } from 'react';
import type { ResponsiveImage } from '@/lib/media';
import { cx } from '@/lib/utils';

/**
 * The one place an <img> is emitted.
 *
 * When the provider serves pre-generated files it hands back a `sources` list —
 * one entry per format, best first — and this renders a <picture> so the
 * browser does the format negotiation itself. That replaces Cloudinary's
 * server-side `f_auto`: it costs nothing, cannot mis-detect a browser, and the
 * files are static.
 *
 * When the provider transforms on demand there are no sources, and a plain
 * <img> with a single srcSet is exactly right. Both paths produce the same
 * element for CSS to style, so nothing downstream cares which is in use.
 */

export type PictureProps = {
  image: ResponsiveImage;
  /** Above-the-fold only. One per page at most. */
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Overrides the alt text already resolved onto the image. */
  alt?: string;
};

export function Picture({ image, priority = false, className, style, alt }: PictureProps) {
  const img = (
    <img
      src={image.src}
      srcSet={image.srcSet || undefined}
      sizes={image.srcSet ? image.sizes : undefined}
      width={image.width}
      height={image.height}
      alt={alt ?? image.alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      fetchPriority={priority ? 'high' : 'auto'}
      className={cx('media-img', className)}
      style={style}
    />
  );

  if (image.sources.length === 0) return img;

  return (
    <picture>
      {image.sources.map((source) => (
        <source
          key={source.type}
          type={source.type}
          srcSet={source.srcSet}
          sizes={image.sizes}
        />
      ))}
      {img}
    </picture>
  );
}
