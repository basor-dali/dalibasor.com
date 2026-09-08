import Link from 'next/link';
import { primaryNav, site } from '@/lib/site';

/**
 * The footer. Personal, not corporate: a name, a place, a few links, and an
 * honest line about who maintains it.
 */

export function Footer({ span }: { span?: { from: number; to: number } }) {
  return (
    <footer className="border-line mt-(--spacing-section) border-t">
      <div className="u-page py-14 sm:py-20">
        <div className="grid gap-12 md:grid-cols-12">
          {/* --- identity --- */}
          <div className="md:col-span-5">
            <p className="u-display text-ivory text-2xl">{site.name}</p>
            <p className="u-label text-muted mt-3">{site.location}</p>
            {span ? (
              <p className="u-label text-muted mt-8">
                {/* "to" belongs between the years, not after them — the old
                    order read aloud as "Archive 2016 2026 to". */}
                Archive {span.from}
                <span aria-hidden="true"> — </span>
                <span className="sr-only"> to </span>
                {span.to}
              </p>
            ) : null}
          </div>

          {/* --- pages --- */}
          <nav aria-label="Footer" className="md:col-span-3">
            <h2 className="u-label text-muted mb-4">Pages</h2>
            <ul className="list-none space-y-2.5 p-0">
              {primaryNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="u-link u-link-reveal text-soft text-sm hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/search"
                  className="u-link u-link-reveal text-soft text-sm hover:text-white"
                >
                  Search
                </Link>
              </li>
            </ul>
          </nav>

          {/* --- elsewhere --- */}
          <div className="md:col-span-4">
            <h2 className="u-label text-muted mb-4">Elsewhere</h2>
            <ul className="list-none space-y-2.5 p-0">
              {site.social.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="me noreferrer"
                    className="u-link u-link-reveal text-soft text-sm hover:text-white"
                  >
                    {social.label}
                    <span className="u-label text-muted ml-2">{social.handle}</span>
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${site.author.email}`}
                  className="u-link u-link-reveal text-soft text-sm hover:text-white"
                >
                  Email
                </a>
              </li>
              <li>
                <a
                  href="/writing/rss.xml"
                  className="u-link u-link-reveal text-soft text-sm hover:text-white"
                >
                  RSS
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-line mt-16 flex flex-col gap-3 border-t pt-8 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="u-label text-muted">
            © {site.archiveStartYear}–{new Date().getUTCFullYear()} {site.name}
          </p>
          <p className="u-label text-muted">Built and maintained by me.</p>
        </div>
      </div>
    </footer>
  );
}
