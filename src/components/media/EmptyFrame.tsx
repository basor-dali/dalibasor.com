import type { CSSProperties } from 'react';
import { cx } from '@/lib/utils';

/* ==========================================================================
   The plate that stands in for a photograph that does not exist yet
   ==========================================================================

   There used to be five of these — in AlbumCard, Hero, ProjectFeature, NowBody
   and the About page — each with its own idea of what an empty frame looks
   like: a centred label, corner registration marks, two crossed diagonals, an
   ember tick. They were written weeks apart for one page each, and nothing ever
   put them side by side.

   The homepage does. Scrolling it today, before there is any real imagery,
   means passing three different empty-frame designs in about two screens,
   which reads as an unfinished site rather than as an archive waiting to be
   filled. The labels disagreed too — "Photograph", "Photograph — to be
   supplied", "Image — to be supplied", "Cover image — to be supplied",
   "Portrait — to be supplied", "— no cover yet", "— photograph pending".

   So: one plate, one label vocabulary. Registration marks in the corners, the
   way a print is marked for trimming, and the label set as a caption slug in
   the bottom-left rather than floated in the middle — an empty frame in a
   contact sheet, not an error state.

   This is scaffolding and it is meant to be deleted. When there are real
   photographs everywhere, delete this file and the handful of imports the
   compiler will then point at. */

export type EmptyFrameProps = {
  /**
   * e.g. `3 / 2`. Omit when the className already carries an `aspect-*`
   * utility — the hero changes ratio at three breakpoints, which no single
   * value can express.
   */
  ratio?: string;
  /**
   * What is missing, as a short noun phrase.
   *
   * Say the thing, not the absence: "Photograph pending", not "No image
   * found". One is a frame waiting to be filled and the other is a failure.
   */
  label?: string;
  /** Alternate ground, so adjacent plates are not a flat repeated block. */
  tone?: 'surface-2' | 'surface-3';
  /** Registration marks. Turn them off below about 6rem, where they crowd. */
  marks?: boolean;
  className?: string;
};

export function EmptyFrame({
  ratio,
  label = 'Photograph pending',
  tone = 'surface-2',
  marks = true,
  className,
}: EmptyFrameProps) {
  // Deliberately not `u-frame`: that sets aspect-ratio unconditionally, which
  // would fight the responsive `aspect-*` classes the hero needs.
  const style: CSSProperties | undefined = ratio ? { aspectRatio: ratio } : undefined;

  return (
    <div
      // Decorative in every case. Wherever one of these appears, the sentence
      // that carries the actual information — the album title, the year's
      // count line, "The archive starts here" — is already in the markup
      // beside it, so announcing the plate as well only repeats it.
      aria-hidden="true"
      className={cx(
        'border-line relative overflow-hidden border',
        tone === 'surface-3' ? 'bg-surface-3' : 'bg-surface-2',
        className,
      )}
      style={style}
    >
      {marks ? (
        <>
          <span className="border-line-strong pointer-events-none absolute top-3 left-3 h-3 w-3 border-t border-l" />
          <span className="border-line-strong pointer-events-none absolute top-3 right-3 h-3 w-3 border-t border-r" />
          <span className="border-line-strong pointer-events-none absolute bottom-3 left-3 h-3 w-3 border-b border-l" />
          <span className="border-line-strong pointer-events-none absolute right-3 bottom-3 h-3 w-3 border-r border-b" />
        </>
      ) : null}

      {label ? (
        <span
          className={cx(
            'u-label text-muted absolute bottom-3 truncate',
            // Inset past the corner marks, so the label never runs under one.
            marks ? 'right-7 left-7' : 'right-3 left-3',
          )}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
