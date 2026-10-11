import Link from 'next/link';
import type { AboutEra } from '@/lib/content';

/**
 * The eras of a life, each a way into its years.
 *
 * Only what `content/pages/about.mdx` declares — the names, the spans and the
 * notes are all yours, and with none written the section is not there. Under
 * each era, every year inside it that has a page of its own is a link to it,
 * so "the Belgrade years" leads to what was written, built and photographed
 * then.
 */
export function Eras({ eras, years }: { eras: AboutEra[]; years: number[] }) {
  if (eras.length === 0) return null;

  return (
    <section className="u-page mt-(--spacing-section)" aria-labelledby="about-eras">
      <hr className="u-rule" />
      <h2 id="about-eras" className="u-label text-muted mt-5">
        Eras
      </h2>

      <ol className="border-line mt-10 list-none border-b p-0">
        {eras.map((era) => {
          const inside = years
            .filter(
              (year) => year >= era.from && year <= (era.to ?? Number.POSITIVE_INFINITY),
            )
            .sort((a, b) => a - b);
          return (
            <li
              key={`${era.from}-${era.name}`}
              className="border-line grid gap-x-(--spacing-gutter) gap-y-4 border-t py-8 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:py-10"
            >
              <div>
                <h3 className="u-display text-2xl text-white">{era.name}</h3>
                <p className="u-label u-nums text-muted mt-3">
                  {era.from}
                  <span aria-hidden="true"> — </span>
                  <span className="sr-only"> to </span>
                  {era.to ?? 'now'}
                </p>
              </div>
              <div className="min-w-0">
                {era.note ? (
                  <p className="u-serif text-soft max-w-(--container-text) text-xl">
                    {era.note}
                  </p>
                ) : null}
                {inside.length > 0 ? (
                  <ul className="mt-5 flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
                    {inside.map((year) => (
                      <li key={year}>
                        <Link
                          href={`/years/${year}`}
                          className="u-label u-nums u-link u-link-reveal text-muted hover:text-ivory"
                        >
                          {year}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
