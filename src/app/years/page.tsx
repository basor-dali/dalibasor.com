import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState, MetaLine, PageHeader } from '@/components/primitives';
import { getYearRecords, type YearRecord } from '@/lib/content';
import { breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/metadata';
import { site } from '@/lib/site';
import { pluralize } from '@/lib/utils';

/**
 * /years — every year that has something in it, newest first.
 *
 * A table of contents for a life, set as a register: the year large on the
 * left, what it holds in small mono beside it, a few of its titles under
 * that. The gaps stay in. A run of years with nothing filed is one quiet line
 * rather than nothing at all, because "nothing from 2017" is also a fact the
 * archive knows.
 */

export const metadata: Metadata = pageMetadata({
  title: 'Years',
  description:
    'Every year on the site — the writing, the projects, the photographs and the Now entries — filed under the year it happened.',
  path: '/years',
});

/** What the year holds, in the order a visitor would want it. */
function holds(record: YearRecord): string[] {
  const started = record.projects.started.length;
  const photos = record.photographs?.photoCount ?? 0;
  const videos = record.photographs?.videoCount ?? 0;
  return [
    record.posts.length > 0 ? pluralize(record.posts.length, 'essay') : undefined,
    started > 0 ? pluralize(started, 'project', 'projects') : undefined,
    photos > 0 ? pluralize(photos, 'photograph') : undefined,
    videos > 0 ? pluralize(videos, 'video') : undefined,
    record.now.length > 0
      ? pluralize(record.now.length, 'Now entry', 'Now entries')
      : undefined,
  ].filter((part): part is string => Boolean(part));
}

/** A few of the year's own titles, so a row says what the year was, not only how much. */
function highlights(record: YearRecord): string[] {
  return [
    ...record.posts.map((post) => post.title),
    ...(record.photographs?.albums ?? []).map((album) => album.title),
    ...record.projects.started.map((project) => project.title),
  ].slice(0, 3);
}

type Row =
  | { kind: 'year'; record: YearRecord }
  | { kind: 'gap'; from: number; to: number }
  | { kind: 'start'; year: number };

export default function YearsPage() {
  const records = getYearRecords();

  // Interleave the gaps: newest first, so a gap sits between a year and the
  // next older one.
  const rows: Row[] = [];
  records.forEach((record, index) => {
    rows.push({ kind: 'year', record });
    const older = records[index + 1];
    if (older && record.year - older.year > 1) {
      rows.push({ kind: 'gap', from: older.year + 1, to: record.year - 1 });
    }
  });

  // The archive's declared start, when nothing has been filed that far back.
  const oldest = records[records.length - 1];
  if (oldest && site.archiveStartYear < oldest.year) {
    if (oldest.year - site.archiveStartYear > 1) {
      rows.push({ kind: 'gap', from: site.archiveStartYear + 1, to: oldest.year - 1 });
    }
    rows.push({ kind: 'start', year: site.archiveStartYear });
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Years', path: '/years' },
          ]),
        )}
      />

      <PageHeader
        eyebrow="The archive"
        title="Year by year"
        lede="Everything on the site, filed under the year it happened: the writing, the projects, the photographs and the Now entries, together."
        meta={
          records.length > 0 ? (
            <MetaLine
              items={[
                pluralize(records.length, 'year'),
                `${records[records.length - 1]!.year} — ${records[0]!.year}`,
              ]}
            />
          ) : null
        }
      />

      <section className="u-page pb-(--spacing-section)" aria-label="Years">
        {records.length === 0 ? (
          <EmptyState title="Nothing filed yet">
            A year appears here as soon as anything is dated to it.
          </EmptyState>
        ) : (
          <ol className="border-line m-0 list-none border-b p-0">
            {rows.map((row) =>
              row.kind === 'year' ? (
                <li key={row.record.year} className="border-line border-t">
                  <YearRow record={row.record} />
                </li>
              ) : row.kind === 'gap' ? (
                <li key={`gap-${row.from}`} className="border-line border-t py-4">
                  <p className="u-label u-nums text-muted">
                    {row.from === row.to ? row.from : `${row.from} — ${row.to}`}
                    <span aria-hidden="true"> · </span>
                    <span className="sr-only">: </span>
                    Nothing filed
                  </p>
                </li>
              ) : (
                <li key={`start-${row.year}`} className="border-line border-t py-4">
                  <p className="u-label u-nums text-muted">
                    {row.year}
                    <span aria-hidden="true"> · </span>
                    <span className="sr-only">: </span>
                    The archive starts here
                  </p>
                </li>
              ),
            )}
          </ol>
        )}
      </section>
    </>
  );
}

function YearRow({ record }: { record: YearRecord }) {
  const titles = highlights(record);
  const turned =
    record.turned === undefined
      ? undefined
      : record.turned === 0
        ? 'Born'
        : `Turned ${record.turned}`;

  // No aria-label: the row's name is everything it shows — the year, the
  // age, the counts and the titles — so nothing on screen is withheld from a
  // screen reader, and a voice command for the year finds it.
  return (
    <Link
      href={record.href}
      className="group grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-baseline gap-x-6 gap-y-2 py-7 sm:gap-x-10 sm:py-9 lg:grid-cols-[14rem_minmax(0,1fr)_auto]"
    >
      <span className="u-display u-display-tight u-nums text-ivory text-4xl transition-colors duration-300 group-hover:text-white">
        {record.year}
        <span className="sr-only">,</span>
      </span>

      <span className="min-w-0">
        <span className="u-label text-muted block">
          {[turned, ...holds(record)].filter(Boolean).join('  ·  ')}
        </span>
        {titles.length > 0 ? (
          <span className="u-serif text-soft mt-2 block text-lg">
            <span className="sr-only">. </span>
            {titles.join(' · ')}
          </span>
        ) : null}
      </span>

      <span
        aria-hidden="true"
        className="text-line-strong group-hover:text-ember hidden transition-colors duration-500 lg:block"
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </span>
    </Link>
  );
}
