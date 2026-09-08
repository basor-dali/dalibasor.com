import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IS_DEV } from '@/lib/admin/guard';

/** The two admin tools. Development only. */

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

const TOOLS = [
  {
    href: '/keystatic',
    title: 'Writing, projects and Now',
    body: 'Edit the words. Saves straight into content/ as MDX — same files, nicer form.',
  },
  {
    href: '/admin/media',
    title: 'Photographs and video',
    body: 'Drop a folder in, pick a year and album, then write captions. Strips GPS before upload.',
  },
];

export default function AdminPage() {
  if (!IS_DEV) notFound();

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px' }}>
      <h1 style={{ fontSize: 30, fontWeight: 650, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
        Admin
      </h1>
      <p style={{ fontSize: 14, opacity: 0.7, margin: '0 0 32px', lineHeight: 1.6 }}>
        Local tools. They do not exist on the deployed site.
      </p>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <Link
              href={tool.href}
              style={{
                display: 'block',
                border: '1px solid #e2ddd6',
                borderRadius: 6,
                padding: 20,
                textDecoration: 'none',
                color: 'inherit',
                background: '#fff',
              }}
            >
              <strong style={{ display: 'block', fontSize: 16, marginBottom: 4 }}>
                {tool.title}
              </strong>
              <span style={{ fontSize: 13.5, opacity: 0.7, lineHeight: 1.6 }}>{tool.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
