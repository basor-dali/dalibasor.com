/**
 * Tab inside an open modal — the mobile menu, the photo viewer.
 *
 * Moves focus to the next control inside, wrapping at either end, on every
 * press. Both modals used to step in only at the two ends and leave the rest
 * to the browser, which assumed the browser's next stop was the next control
 * inside. Safari, by default, tabs between buttons and fields and skips links
 * — so in the menu, one button among links, its next stop from Close was on
 * the page behind the overlay.
 *
 * One exception: a <video>. Its play button, scrubber and volume live inside
 * it, where only the browser can step between them, so from a video the
 * browser moves focus as usual. The viewer's own buttons come after it, so
 * that stop is still inside.
 */

const CANDIDATES = 'a[href], button, input, select, textarea, video, [tabindex]';

export function trapTab(event: KeyboardEvent, container: HTMLElement | null): void {
  if (event.key !== 'Tab' || !container) return;

  const active = document.activeElement as HTMLElement | null;
  if (active instanceof HTMLVideoElement && container.contains(active)) return;

  // What can actually take focus right now: not disabled, not tabindex=-1 (the
  // viewer's backdrop is a button that must not count), and rendered — a
  // control that is display:none cannot be a stop, let alone a wrap point.
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(CANDIDATES),
  ).filter(
    (el) =>
      !el.hasAttribute('disabled') && el.tabIndex >= 0 && el.getClientRects().length > 0,
  );
  if (focusable.length === 0) return;

  event.preventDefault();
  const index = active ? focusable.indexOf(active) : -1;
  const step = event.shiftKey ? -1 : 1;
  const next =
    index === -1
      ? focusable[event.shiftKey ? focusable.length - 1 : 0]
      : focusable[(index + step + focusable.length) % focusable.length];
  next?.focus();
}
