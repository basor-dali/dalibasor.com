import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { albumCountLabel } from '@/components/media/AlbumCard';
import { MediaImage } from '@/components/media/MediaImage';
import { YearSelector } from '@/components/media/YearSelector';
import { ArrowLink, Label, MetaLine, StatusDot, YearMark } from '@/components/primitives';
import { ArticlePreview } from '@/components/writing/ArticlePreview';
import {
  getRecordedYears,
  getYearRecord,
  STATUS_LABELS,
  type YearRecord,
} from '@/lib/content';
import { mediaAlt, mediaProvider, providerCanResize } from '@/lib/media';
import { breadcrumbJsonLd, jsonLdScript, pageMetadata } from '@/lib/metadata';
import { cx, formatPeriod, pluralize, truncate } from '@/lib/utils';
import type { MediaItem, ProjectSummary } from '@/types/content';

/**
 * /years/[year] — everything from one year.
 *
 * The writing, the projects that started, ended or carried on, the
 * photographs and the Now entries, on one page, in the order the year went.
 * Each section is the same register used elsewhere on the site — a sticky
 * rubric on the left, the rows on the right — so a year reads as one document
 * rather than four widgets.
 *
 * Nothing here is written for the page. Every line comes from a file that
 * already exists; the only words about the year as a whole are the note in
 * its photo manifest, when there is one.
 */

type Params = { year: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getRecordedYears().map((year) => ({ year: String(year) }));
}

function recordFor(raw: string): YearRecord | undefined {
  if (!/^\d{4}$/.test(raw)) return undefined;
  return getYearRecord(Number.parseInt(raw, 10));
}

/** "Turned 26", or "Born" in the year of birth. */
function turnedLabel(turned: number | undefined): string | undefined {
  if (turned === undefined) return undefined;
  return turned === 0 ? 'Born' : `Turned ${turned}`;
}

function countLine(record: YearRecord): string[] {
  const { posts, projects, now, photographs } = record;
  const started = projects.started.length;
  return [
    posts.length > 0 ? pluralize(posts.length, 'essay') : undefined,
    started > 0 ? pluralize(started, 'project started', 'projects started') : undefined,
    photographs && photographs.photoCount > 0
      ? pluralize(photographs.photoCount, 'photograph')
      : undefined,
    photographs && photographs.videoCount > 0
      ? pluralize(photographs.videoCount, 'video')
      : undefined,
    now.length > 0 ? pluralize(now.length, 'Now entry', 'Now entries') : undefined,
  ].filter((part): part is string => Boolean(part));
}

function ogImage(item: MediaItem | undefined): string | undefined {
  if (!item || item.type !== 'image' || !providerCanResize()) return undefined;
  return mediaProvider().imageUrl(item.publicId, {
    width: 1200,
    height: 630,
    fit: 'fill',
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { year } = await params;
  const record = recordFor(year);
  if (!record)
    return pageMetadata({
      title: 'Year not found',
      path: `/years/${year}`,
      noIndex: true,
    });

  const counts = countLine(record);
  return pageMetadata({
    title: String(record.year),
    description:
      record.note?.replace(/\s+/g, ' ').trim().slice(0, 180) ||
      (counts.length > 0
        ? `${counts.join(', ')} — everything on the site from ${record.year}.`
        : `Everything on the site from ${record.year}.`),
    path: record.href,
    // A year made only of scaffolding is linked, but not advertised.
    noIndex: record.written === 0,
    image:
      ogImage(record.photographs?.preview.find((item) => item.type === 'image')) ??
      '/opengraph-image',
  });
}

export default async function YearPage({ params }: { params: Promise<Params> }) {
  const { year } = await params;
  const record = recordFor(year);
  if (!record) notFound();

  const years = getRecordedYears();
  const position = years.length - years.indexOf(record.year);
  const counts = countLine(record);
  const turned = turnedLabel(record.turned);

  const noteParagraphs = record.note
    ? record.note
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];

  const { started, ended, ongoing } = record.projects;
  const activity = { updates: record.projects.updates, year: record.year };
  const hasProjects = started.length + ended.length + ongoing.length > 0;

  return (
    <article className="pb-(--spacing-section)">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Years', path: '/years' },
            { name: String(record.year), path: record.href },
          ]),
        )}
      />

      {/* --- opening ----------------------------------------------------- */}
      <header className="u-page pt-32 sm:pt-40">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
          <Link
            href="/years"
            className="u-label text-muted hover:text-ivory transition-colors duration-300"
          >
            <span aria-hidden="true">&larr;</span> Every year
          </Link>
          <Label as="p">
            {/* Counted from the first year, so a year's number never changes
                when a newer one arrives. */}
            Year {position} of {years.length}
            {turned ? (
              <>
                {' '}
                <span aria-hidden="true">·</span> {turned}
              </>
            ) : null}
          </Label>
        </div>

        <h1 className="mt-10 sm:mt-14">
          <span className="sr-only">Everything from {record.year}</span>
          <YearMark year={record.year} className="text-white" aria-hidden="true" />
        </h1>

        <MetaLine className="mt-10" items={counts} />

        {noteParagraphs.length > 0 ? (
          <div className="mt-(--spacing-section-sm) max-w-(--container-text-wide) lg:pl-[16.6%]">
            {noteParagraphs.map((paragraph, index) => (
              <p
                key={index}
                className={cx(
                  'u-serif text-ivory text-2xl leading-[1.32]',
                  index > 0 && 'mt-7',
                )}
              >
                {paragraph}
              </p>
            ))}
          </div>
        ) : null}
      </header>

      {/* --- photographs ---------------------------------------------------- */}
      {record.photographs ? (
        <Rubric
          id="year-photographs"
          title="Photographs"
          count={albumCountLabel(
            record.photographs.photoCount,
            record.photographs.videoCount,
          )}
          link={{
            href: record.photographs.href,
            label: `Open ${record.year} in photographs`,
          }}
        >
          <Contact items={record.photographs.preview} year={record.year} />

          {record.photographs.albums.length > 0 ? (
            <ul className="border-line mt-10 list-none border-b p-0">
              {record.photographs.albums.map((album) => (
                <li key={album.slug} className="border-line border-t">
                  <Link
                    href={album.href}
                    className="group flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 py-5"
                  >
                    <span className="u-display text-ivory text-xl transition-colors duration-300 group-hover:text-white">
                      {album.title}
                      {album.subtitle ? (
                        <span className="u-serif text-muted ml-3 text-lg">
                          {album.subtitle}
                        </span>
                      ) : null}
                    </span>
                    <span className="u-label text-muted">
                      {[
                        albumCountLabel(album.photoCount, album.videoCount),
                        album.location,
                      ]
                        .filter(Boolean)
                        .join('  ·  ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </Rubric>
      ) : null}

      {/* --- writing ---------------------------------------------------------- */}
      {record.posts.length > 0 ? (
        <Rubric
          id="year-writing"
          title="Writing"
          count={pluralize(record.posts.length, 'essay')}
          link={{
            href: `/writing?year=${record.year}#index`,
            label: `Writing from ${record.year}`,
          }}
        >
          <ol className="m-0 list-none p-0">
            {record.posts.map((post) => (
              <li key={post.slug}>
                <ArticlePreview post={post} variant="row" headingLevel={3} />
              </li>
            ))}
          </ol>
        </Rubric>
      ) : null}

      {/* --- projects ----------------------------------------------------------- */}
      {hasProjects ? (
        <Rubric
          id="year-projects"
          title="Projects"
          count={
            started.length > 0
              ? pluralize(started.length, 'started', 'started')
              : pluralize(ongoing.length + ended.length, 'carried over', 'carried over')
          }
          link={{ href: '/projects', label: 'All projects' }}
        >
          <div className="flex flex-col gap-10">
            <ProjectGroup label="Started" projects={started} {...activity} />
            <ProjectGroup label="Finished or stopped" projects={ended} {...activity} />
            <ProjectGroup label="Still going" projects={ongoing} {...activity} />
          </div>
        </Rubric>
      ) : null}

      {/* --- now ---------------------------------------------------------------- */}
      {record.now.length > 0 ? (
        <Rubric
          id="year-now"
          title="Now"
          count={pluralize(record.now.length, 'entry', 'entries')}
          link={{ href: '/now', label: 'The whole record' }}
        >
          <ul className="border-line m-0 list-none border-b p-0">
            {record.now.map((entry) => (
              <li key={entry.period} className="border-line border-t">
                <Link
                  href={entry.href}
                  className="group/row grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-8 py-5"
                >
                  <span className="u-display text-ivory text-xl transition-colors duration-300 group-hover/row:text-white">
                    {monthOf(entry.period, entry.title, record.year)}
                  </span>
                  <span className="u-label text-muted">{entry.location}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Rubric>
      ) : null}

      {/* --- moving between years ------------------------------------------- */}
      <YearSelector
        years={years}
        current={record.year}
        basePath="/years"
        label="Years"
        className="u-page mt-(--spacing-section)"
      />
    </article>
  );
}

/* ==========================================================================
   Pieces
   ========================================================================== */

/**
 * One section of the year: a sticky rubric on the left with the section's
 * name, its count and the way out to the full list; the rows on the right.
 */
function Rubric({
  id,
  title,
  count,
  link,
  children,
}: {
  id: string;
  title: string;
  count: string;
  link: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="u-page mt-(--spacing-section)" aria-labelledby={id}>
      <hr className="u-rule-strong" />
      <div className="u-grid pt-8">
        <div className="col-span-2 md:col-span-6 lg:sticky lg:top-[calc(var(--nav-height)+2.5rem)] lg:col-span-3 lg:self-start">
          <h2 id={id} className="u-display text-2xl text-white">
            {title}
          </h2>
          <p className="u-label text-muted mt-3">{count}</p>
          <ArrowLink href={link.href} className="mt-6 inline-block">
            {link.label}
          </ArrowLink>
        </div>
        <div className="col-span-2 mt-8 min-w-0 md:col-span-6 lg:col-span-9 lg:mt-0">
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * A strip of the year's photographs. Each opens in the viewer, in its own
 * album or year, rather than this page growing a second lightbox.
 */
function Contact({ items, year }: { items: MediaItem[]; year: number }) {
  const frames = items.filter((item) => item.type === 'image').slice(0, 4);
  if (frames.length === 0) return null;

  return (
    <ul className="grid list-none grid-cols-2 gap-2 p-0 sm:gap-3 md:grid-cols-4">
      {frames.map((item) => {
        const home = item.album ? `/photos/${year}/${item.album}` : `/photos/${year}`;
        return (
          <li key={item.id}>
            <Link
              href={`${home}?photo=${encodeURIComponent(item.id)}`}
              className="group block"
              aria-label={`Open photograph: ${mediaAlt(item)}`}
            >
              <MediaImage
                item={item}
                ladder="grid"
                ratio="4 / 5"
                sizes="(min-width: 64rem) 17vw, (min-width: 48rem) 23vw, 46vw"
                imgClassName="transition-transform duration-[1100ms] ease-[var(--ease-out-expo)] group-hover:scale-[1.03] motion-reduce:transform-none"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ProjectGroup({
  label,
  projects,
  updates,
  year,
}: {
  label: string;
  projects: ProjectSummary[];
  /** Dated log entries per project in this year. */
  updates: Record<string, number>;
  year: number;
}) {
  if (projects.length === 0) return null;

  return (
    <div>
      <Label as="h3" className="block">
        {label}
      </Label>
      <ul className="border-line mt-4 list-none border-b p-0">
        {projects.map((project) => (
          <li key={project.slug} className="border-line border-t">
            <Link
              href={project.href}
              className="group grid grid-cols-1 items-baseline gap-x-8 gap-y-2 py-5 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <span className="min-w-0">
                <span className="u-display text-ivory block text-xl transition-colors duration-300 group-hover:text-white">
                  {project.title}
                </span>
                {project.description ? (
                  <span className="text-muted mt-1.5 block max-w-[54ch] text-sm">
                    {truncate(project.description, 140)}
                  </span>
                ) : null}
                {/* What happened to it this year, from its own log. */}
                {updates[project.slug] ? (
                  <span className="u-label text-muted mt-2.5 block">
                    {pluralize(updates[project.slug]!, 'update')} in {year}
                  </span>
                ) : null}
              </span>
              <span className="u-label text-muted flex items-center gap-2.5">
                <StatusDot status={project.status} />
                {STATUS_LABELS[project.status]}
                <span aria-hidden="true" className="text-line-strong">
                  /
                </span>
                <span className="u-nums">{project.period}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "March" for `2026-03` on the 2026 page; a hand-written title keeps its words. */
function monthOf(period: string, title: string, year: number): string {
  const label = formatPeriod(period);
  if (title !== label) return title;
  return label.replace(new RegExp(`\\s${year}$`), '');
}
