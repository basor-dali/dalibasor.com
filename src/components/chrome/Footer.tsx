import Link from 'next/link';
import { primaryNav, site } from '@/lib/site';

/**
 * The footer. Personal, not corporate: a name, a place, a few links, and an
 * honest line about who maintains it.
 */

export function Footer({ span }: { span?: { from: number; to: number } }) {
  return (
    <footer className="mt-(--spacing-section) border-t border-line">
      <div className="u-page py-14 sm:py-20">
        <div className="grid gap-12 md:grid-cols-12">
          {/* --- identity --- */}
          <div className="md:col-span-5">
            <p className="u-display text-2xl text-ivory">{site.name}</p>
            <p className="u-label mt-3 text-muted">{site.location}</p>
            {span ? (
              <p className="u-label mt-8 text-muted">
                Archive {span.from} <span aria-hidden="true">—</span> {span.to}
                <span className="sr-only"> to </span>
              </p>
            ) : null}
          </div>

          {/* --- pages --- */}
          <nav aria-label="Footer" className="md:col-span-3">
            <h2 className="u-label mb-4 text-muted">Pages</h2>
            <ul className="list-none space-y-2.5 p-0">
              {primaryNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="u-link u-link-reveal text-sm text-soft hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/search"
                  className="u-link u-link-reveal text-sm text-soft hover:text-white"
                >
                  Search
                </Link>
              </li>
            </ul>
          </nav>

          {/* --- elsewhere --- */}
          <div className="md:col-span-4">
            <h2 className="u-label mb-4 text-muted">Elsewhere</h2>
            <ul className="list-none space-y-2.5 p-0">
              {site.social.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="me noreferrer"
                    className="u-link u-link-reveal text-sm text-soft hover:text-white"
                  >
                    {social.label}
                    <span className="u-label ml-2 text-muted">{social.handle}</span>
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${site.author.email}`}
                  className="u-link u-link-reveal text-sm text-soft hover:text-white"
                >
                  Email
                </a>
              </li>
              <li>
                <a
                  href="/writing/rss.xml"
                  className="u-link u-link-reveal text-sm text-soft hover:text-white"
                >
                  RSS
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-line pt-8 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="u-label text-muted">
            © {site.archiveStartYear}–{new Date().getUTCFullYear()} {site.name}
          </p>
          <p className="u-label text-muted">Built and maintained by me.</p>
        </div>
      </div>
    </footer>
  );
}
