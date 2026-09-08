import { notFound } from 'next/navigation';
import { MediaAdmin } from '@/components/admin/MediaAdmin';
import { IS_DEV } from '@/lib/admin/guard';

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

export default function MediaAdminPage() {
  if (!IS_DEV) notFound();

  // Public cloud name only — the API key and secret never reach the browser.
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || null;

  return <MediaAdmin cloudName={cloudName} />;
}
