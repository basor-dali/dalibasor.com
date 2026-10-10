/**
 * "The visitor asked to search" — carried from the keyboard shortcut to the
 * search field across a client-side navigation.
 *
 * Pressing `/` anywhere goes to /search with the field focused. The shortcut
 * lives in the navigation and the field in the search page, and a soft
 * navigation keeps this module's state, so a flag here is all it takes — no
 * query string to clean up afterwards, nothing in the URL that would focus
 * the field again on a reload or a shared link, where nobody pressed a key.
 */

let pending = false;

/** Called by the shortcut just before it navigates to /search. */
export function requestSearchFocus(): void {
  pending = true;
}

/** Called once by the search page on mount. True only once per request. */
export function takeSearchFocusRequest(): boolean {
  const wanted = pending;
  pending = false;
  return wanted;
}
