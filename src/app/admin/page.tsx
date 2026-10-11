import Link from 'next/link';
import { notFound } from 'next/navigation';
import { launchChecklist } from '@/lib/admin/checklist';
import { adminAvailable } from '@/lib/admin/guard';

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

export default async function AdminPage() {
  if (!(await adminAvailable())) notFound();

  const checklist = launchChecklist();
  const all = checklist.flatMap((group) => group.items);
  const remaining = all.filter((item) => !item.done).length;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px' }}>
      <h1
        style={{
          fontSize: 30,
          fontWeight: 650,
          letterSpacing: '-0.02em',
          margin: '0 0 8px',
        }}
      >
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
              <span style={{ fontSize: 13.5, opacity: 0.7, lineHeight: 1.6 }}>
                {tool.body}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* --- what is left ----------------------------------------------- */}
      <h2
        style={{
          fontSize: 20,
          fontWeight: 650,
          letterSpacing: '-0.01em',
          margin: '56px 0 4px',
        }}
      >
        Before launch
      </h2>
      <p style={{ fontSize: 14, opacity: 0.7, margin: '0 0 24px', lineHeight: 1.6 }}>
        {remaining === 0
          ? 'Nothing left on the list.'
          : `${remaining} of ${all.length} still to do. Read from the files on every visit, so this is always current.`}
      </p>

      {checklist.map((group) => (
        <section key={group.title} style={{ margin: '0 0 24px' }}>
          <h3
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              opacity: 0.6,
              margin: '0 0 8px',
            }}
          >
            {group.title}
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {group.items.map((item) => (
              <li
                key={`${item.label}-${item.where.join()}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 1fr',
                  gap: 8,
                  padding: '8px 0',
                  borderTop: '1px solid #e2ddd6',
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                <span aria-hidden="true">{item.done ? '✓' : '○'}</span>
                <span>
                  <span
                    style={{
                      textDecoration: item.done ? 'line-through' : 'none',
                      opacity: item.done ? 0.55 : 1,
                    }}
                  >
                    {item.label}
                  </span>
                  {item.done ? <span className="sr-only"> — done</span> : null}
                  {!item.done ? (
                    <code
                      style={{
                        display: 'block',
                        fontSize: 12,
                        opacity: 0.65,
                        marginTop: 2,
                        wordBreak: 'break-all',
                      }}
                    >
                      {item.where.join('  ·  ')}
                    </code>
                  ) : null}
                  {!item.done && item.note ? (
                    <span
                      style={{
                        display: 'block',
                        fontSize: 12.5,
                        opacity: 0.65,
                        marginTop: 2,
                      }}
                    >
                      {item.note}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
