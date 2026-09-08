import { makeRouteHandler } from '@keystatic/next/route-handler';
import config from '../../../../../keystatic.config';
import { adminAvailable, devOnlyResponse } from '@/lib/admin/guard';

/**
 * Keystatic's read/write API.
 *
 * Local storage writes directly to the working tree, so these handlers refuse
 * to answer in production rather than failing halfway through a write against
 * a read-only filesystem.
 */

export const dynamic = 'force-dynamic';

const handlers = makeRouteHandler({ config });

type Handler = (typeof handlers)['GET'];

// async so the guarded branch still satisfies the handler's Promise return type.
export const GET: Handler = async (...args) =>
  (await adminAvailable()) ? handlers.GET(...args) : devOnlyResponse();

export const POST: Handler = async (...args) =>
  (await adminAvailable()) ? handlers.POST(...args) : devOnlyResponse();
