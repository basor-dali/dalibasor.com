import 'server-only';

/**
 * The admin tools are development-only, and that is a security boundary, not a
 * convenience.
 *
 * These routes write to the working tree and upload to Cloudinary with the
 * account's API secret. On a deployed site they would be an unauthenticated
 * remote-write endpoint, so they refuse to exist there at all: every admin
 * route calls this first, and in production it throws before doing anything.
 *
 * If you ever want to edit from a phone, the answer is GitHub-backed Keystatic
 * storage (see docs/CMS.md) — not opening these up.
 */

export const IS_DEV = process.env.NODE_ENV !== 'production';

export class AdminDisabledError extends Error {
  constructor() {
    super('Admin tools are only available in development.');
    this.name = 'AdminDisabledError';
  }
}

export function assertDev(): void {
  if (!IS_DEV) throw new AdminDisabledError();
}

/** JSON 404 for a production request. Looks like the route simply is not there. */
export function devOnlyResponse(): Response {
  return Response.json(
    { error: 'Not found.' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}
