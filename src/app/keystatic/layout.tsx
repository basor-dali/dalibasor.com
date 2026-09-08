import { notFound } from 'next/navigation';
import { adminAvailable } from '@/lib/admin/guard';

/**
 * Keystatic is a local tool, not part of the published site.
 *
 * With `storage: { kind: 'local' }` the editor writes to the working tree, so
 * on a deployed build it is at best broken and at worst an unauthenticated
 * window into the repository. This layout makes the whole route disappear in
 * production — the guard sits here rather than in the page so Keystatic's own
 * component keeps its props untouched.
 *
 * If you ever want to edit from a phone, switch storage to `github` and put a
 * real login in front of it. See docs/CMS.md.
 */
export default async function KeystaticLayout({ children }: { children: React.ReactNode }) {
  if (!(await adminAvailable())) notFound();
  return <>{children}</>;
}
