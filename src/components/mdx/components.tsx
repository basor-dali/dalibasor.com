import Link from 'next/link';
import type { ReactNode } from 'react';
import type { MDXComponents } from 'mdx/types';
import type { MediaItem } from '@/types/content';
import { CoverImage } from '@/components/media/MediaImage';
import { MediaVideo } from '@/components/media/MediaVideo';
import { cx } from '@/lib/utils';

/**
 * What Dali can write inside an .mdx file.
 *
 * Kept small on purpose. The more exotic components exist here, the more a
 * post from 2026 depends on this repository still existing in 2046. Plain
 * markdown carries almost everything; these handle photographs, video and the
 * two or three editorial devices worth having.
 */

/* --- links ---------------------------------------------------------------- */

function Anchor({ href = '', children, ...rest }: React.ComponentProps<'a'>) {
  const isInternal = href.startsWith('/') || href.startsWith('#');
  if (isInternal) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" {...rest}>
      {children}
    </a>
  );
}

/* --- photographs ---------------------------------------------------------- */

/**
 * A single image inside an article.
 *
 *   <Figure src="dalibasor/2026/serbia/img_0042" alt="…" caption="…" bleed />
 */
export function Figure({
  src,
  alt,
  caption,
  ratio = '3 / 2',
  bleed = false,
  fit = 'fill',
}: {
  src: string;
  alt: string;
  caption?: ReactNode;
  ratio?: string;
  /** Break out of the reading measure to the wide container. */
  bleed?: boolean;
  fit?: 'fill' | 'fit';
}) {
  return (
    <figure className={cx(bleed && 'bleed-wide')}>
      <CoverImage
        publicId={src}
        alt={alt}
        ratio={ratio}
        fit={fit}
        ladder={bleed ? 'bleed' : 'feature'}
        sizes={bleed ? 'wide' : 'measure'}
      />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

/** Two or three photographs side by side. Collapses to a stack on mobile. */
export function Row({
  children,
  caption,
  bleed = true,
}: {
  children: ReactNode;
  caption?: ReactNode;
  bleed?: boolean;
}) {
  return (
    <figure className={cx(bleed && 'bleed-wide')}>
      <div className="grid gap-3 sm:grid-cols-2 [&>figure]:m-0 [&_figcaption]:mt-2">{children}</div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

/** Video inside an article. Loads nothing until it is played. */
export function Video({
  src,
  poster,
  caption,
  ratio = '16 / 9',
  width = 1920,
  height = 1080,
  bleed = false,
}: {
  src: string;
  poster?: string;
  caption?: ReactNode;
  ratio?: string;
  width?: number;
  height?: number;
  bleed?: boolean;
}) {
  const item: MediaItem = {
    id: src,
    type: 'video',
    year: 0,
    publicId: src,
    width,
    height,
    orientation: width >= height ? 'landscape' : 'portrait',
    poster,
    caption: typeof caption === 'string' ? caption : undefined,
  };

  return (
    <figure className={cx(bleed && 'bleed-wide')}>
      <MediaVideo item={item} ratio={ratio} cover={false} />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

/* --- editorial devices ---------------------------------------------------- */

/** A pull quote. Larger and more theatrical than a blockquote. */
export function Pull({ children, cite }: { children: ReactNode; cite?: string }) {
  return (
    <aside className="bleed-wide my-16 border-y border-line py-10 sm:py-14">
      <p className="u-serif mx-auto max-w-4xl text-center text-3xl leading-[1.15] text-white">
        {children}
      </p>
      {cite ? <p className="u-label mt-6 text-center text-muted">{cite}</p> : null}
    </aside>
  );
}

/** A short aside in a lighter voice. */
export function Note({ children, label = 'Note' }: { children: ReactNode; label?: string }) {
  return (
    <aside className="my-10 border-l border-line-strong pl-5">
      <p className="u-label mb-2 text-muted">{label}</p>
      <div className="text-sm text-muted [&>*+*]:mt-3">{children}</div>
    </aside>
  );
}

/**
 * Scaffolding marker.
 *
 * Every placeholder on this site is wrapped in one of these. It is deliberately
 * loud: unfinished writing should be embarrassing to leave up, and a global
 * search for "Placeholder" should find all of it.
 */
export function Placeholder({ children }: { children?: ReactNode }) {
  return (
    <div className="my-10 border border-dashed border-ember-deep/70 bg-ember-deep/[0.06] p-5 sm:p-7">
      <p className="u-label mb-3 text-ember">Placeholder — replace this</p>
      <div className="text-sm text-soft [&>*+*]:mt-3">
        {children ?? (
          <p>
            <strong className="text-ivory">[DALI: WRITE THIS IN YOUR OWN WORDS]</strong>
          </p>
        )}
      </div>
    </div>
  );
}

/* --- map ------------------------------------------------------------------ */

export const mdxComponents: MDXComponents = {
  a: Anchor,
  Figure,
  Row,
  Video,
  Pull,
  Note,
  Placeholder,
};
