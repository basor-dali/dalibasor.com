import 'server-only';

import { headers } from 'next/headers';

/**
 * Who is allowed to reach the admin tools.
 *
 * Two conditions, and both must hold.
 *
 * 1. NOT PRODUCTION. These routes write to the working tree and hold the
 *    storage API secret. On a deployed site they would be an unauthenticated
 *    remote-write endpoint, so they refuse to exist there at all.
 *
 * 2. THE REQUEST CAME FROM THIS MACHINE. `next dev` can bind to every
 *    interface, and when it does, everyone on the same Wi-Fi can reach it.
 *    Without this check, sitting in a cafe means anyone on that network can
 *    open /admin/media and upload to your bucket.
 *
 * There is deliberately no password. Anyone who can reach localhost on this
 * machine can already open content/ in a text editor, so a login there would
 * protect nothing — it would just be something to lose. The real boundary is
 * "this machine", and that is what is enforced.
 *
 * If you ever want to edit from somewhere else, do not poke a hole here. Use
 * Keystatic's GitHub storage, which puts a real identity provider in front of
 * it. See docs/CMS.md.
 */

export const IS_DEV = process.env.NODE_ENV !== 'production';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export class AdminDisabledError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'AdminDisabledError';
  }
}

/** The hostname the client asked for, without the port. */
function hostnameOf(host: string | null): string | null {
  if (!host) return null;
  // IPv6 literals arrive bracketed: [::1]:3000
  if (host.startsWith('[')) {
    const close = host.indexOf(']');
    return close === -1 ? host : host.slice(0, close + 1);
  }
  const colon = host.lastIndexOf(':');
  return colon === -1 ? host : host.slice(0, colon);
}

const LOOPBACK = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/;

/**
 * True when this request looks like it came from this machine.
 *
 * READ THIS BEFORE TRUSTING IT. Every signal available here is a request
 * header, and headers are whatever the client says they are — Next's dev
 * server passes a client-supplied `x-forwarded-for` and `Host` straight
 * through, so anyone on the network can forge both with one curl flag. This
 * was verified, not assumed.
 *
 * So this is a speed bump, not a lock. It stops a browser: type
 * http://192.168.0.131:3000/admin on a phone and it 404s, because a browser
 * sends the host you typed. It does not stop someone deliberately trying.
 *
 * The actual boundary is the network bind. `npm run dev` listens on 127.0.0.1
 * only, so nothing on the network can open a socket at all, and no header can
 * change that. `npm run dev:lan` deliberately trades that away so the site can
 * be opened on a phone — and this check is what keeps the admin tools closed in
 * that mode against everything short of a deliberate attempt.
 */
export async function isLocalRequest(): Promise<boolean> {
  const list = await headers();

  // The leftmost entry is the original client. In dev, Next fills this in from
  // the connection when the client did not send one.
  const forwarded = list.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded && !LOOPBACK.test(forwarded)) return false;

  const hostname = hostnameOf(list.get('x-forwarded-host') ?? list.get('host'));
  return hostname !== null && LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}

/** Throws unless this is a development request from this machine. */
export async function assertLocalAdmin(): Promise<void> {
  if (!IS_DEV) {
    throw new AdminDisabledError('Admin tools do not exist in production.');
  }
  if (!(await isLocalRequest())) {
    throw new AdminDisabledError('Admin tools only answer to this machine.');
  }
}

/** True when the admin tools should be reachable for this request. */
export async function adminAvailable(): Promise<boolean> {
  return IS_DEV && (await isLocalRequest());
}

/**
 * The response a blocked request gets: an ordinary 404.
 *
 * Deliberately indistinguishable from a route that was never built. Someone
 * scanning a network learns nothing about what is running here.
 */
export function devOnlyResponse(): Response {
  return Response.json(
    { error: 'Not found.' },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  );
}
