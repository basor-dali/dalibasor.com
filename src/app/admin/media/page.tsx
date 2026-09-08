import { notFound } from 'next/navigation';
import { MediaAdmin } from '@/components/admin/MediaAdmin';
import { adminAvailable } from '@/lib/admin/guard';

/**
 * /admin/media — the drag-and-drop importer.
 *
 * Development only. In a production build this route renders a 404 and its
 * API routes refuse to respond, because they write to disk and hold the
 * Cloudinary API secret.
 */

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Media',
  robots: { index: false, follow: false },
};

export default async function MediaAdminPage() {
  if (!(await adminAvailable())) notFound();

  // Which backend photographs go to, and whether it is actually usable. Only
  // the public identifier crosses to the browser; no key ever does.
  const provider = (process.env.NEXT_PUBLIC_MEDIA_PROVIDER || '').toLowerCase();

  const destination =
    provider === 'r2'
      ? {
          name: 'r2' as const,
          label: process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || null,
          ready: Boolean(
            process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL &&
              process.env.R2_BUCKET &&
              process.env.R2_ACCESS_KEY_ID &&
              process.env.R2_SECRET_ACCESS_KEY &&
              (process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT),
          ),
          missingHint: 'R2 credentials are missing — see docs/MEDIA.md, then restart the dev server.',
        }
      : provider === 'cloudinary'
        ? {
            name: 'cloudinary' as const,
            label: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || null,
            ready: Boolean(
              process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
                process.env.CLOUDINARY_API_KEY &&
                process.env.CLOUDINARY_API_SECRET,
            ),
            missingHint:
              'Cloudinary credentials are missing — add them to .env.local and restart the dev server.',
          }
        : {
            name: 'none' as const,
            label: null,
            ready: false,
            missingHint:
              'NEXT_PUBLIC_MEDIA_PROVIDER is not set, so there is nowhere to upload to. Set it to r2 or cloudinary in .env.local.',
          };

  return <MediaAdmin destination={destination} />;
}
