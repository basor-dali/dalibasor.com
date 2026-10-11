import 'server-only';

import {
  PROJECT_STATUSES,
  type Project,
  type ProjectFrontmatter,
  type ProjectStatus,
  type ProjectSummary,
  type ProjectUpdate,
} from '@/types/content';
import { slugify, toDateString, toPlainText, yearOf } from '@/lib/utils';
import { contentPath, once, readMdx, showDrafts, walk } from './fs';
import { findMediaByRef } from './media';

/* ==========================================================================
   Status vocabulary
   ==========================================================================
   Abandoned is a first-class status, not a failure state to be hidden. */

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  building: 'Building',
  experiment: 'Experiment',
  finished: 'Finished',
  paused: 'Paused',
  abandoned: 'Abandoned',
};

/**
 * What each status means, in a line.
 *
 * A status vocabulary without definitions drifts: one personal site studied
 * for the 2026 audit had grown "Completed", "Complete", "Completeish" and
 * "Completed (sorta)" for the same thing. These are shown on /projects and
 * beside the status on each project, so the words keep their meaning.
 */
export const STATUS_DEFINITIONS: Record<ProjectStatus, string> = {
  building: 'Being worked on now',
  experiment: 'Testing an idea that may go nowhere',
  paused: 'Stopped for now, meant to resume',
  finished: 'Done, and it does what it was for',
  abandoned: 'Stopped for good, and kept here anyway',
};

/** Ordering for the index: live things first, dead things last but present. */
export const STATUS_ORDER: ProjectStatus[] = [
  'building',
  'experiment',
  'paused',
  'finished',
  'abandoned',
];

/* ==========================================================================
   The log
   ==========================================================================
   The content guide has always said to write a project's progress as dated
   `##` sections, newest at the top, "so the page reads as a log rather than a
   pitch" — and nothing ever read them. A heading that starts with a date is
   an update:

     ## 2026-03-14 — Wheel encoders
     ## 2026-03
     ## 2025-11-02: First full run

   Anything else is an ordinary heading. The updates give a project a "last
   worked on" date, a count, and a place in each year it was worked on. */

const UPDATE_HEADING = /^##[ \t]+(\d{4}-\d{2}(?:-\d{2})?)\b[ \t]*(?:[—–:-][ \t]*)?(.*)$/;

export function parseUpdates(body: string): ProjectUpdate[] {
  const updates: ProjectUpdate[] = [];
  let current: ProjectUpdate | undefined;
  const lines: string[] = [];

  const close = () => {
    if (current) updates.push({ ...current, body: lines.join('\n').trim() });
    lines.length = 0;
  };

  for (const line of body.split('\n')) {
    const match = UPDATE_HEADING.exec(line);
    if (match) {
      close();
      current = { date: match[1]!, title: match[2]?.trim() || undefined, body: '' };
    } else if (/^##[ \t]/.test(line)) {
      // An undated `##` ends the current update without starting one.
      close();
      current = undefined;
    } else if (current) {
      lines.push(line);
    }
  }
  close();

  // Newest first, however they were written.
  return updates.sort((a, b) => b.date.localeCompare(a.date));
}

function isStatus(value: unknown): value is ProjectStatus {
  return PROJECT_STATUSES.includes(value as ProjectStatus);
}

/** `2024 —` while active, `2022 — 2024` once it stopped. */
function formatPeriod(start: string, end?: string): string {
  const startYear = yearOf(start);
  if (!end) return `${startYear} —`;
  const endYear = yearOf(end);
  return startYear === endYear ? `${startYear}` : `${startYear} — ${endYear}`;
}

/* ==========================================================================
   Loading
   ========================================================================== */

const loadAll = once((): Project[] => {
  const files = walk(contentPath('projects'), ['.mdx', '.md']);

  const projects = files.map((file): Project => {
    const { data, body, sourcePath, basename } = readMdx<ProjectFrontmatter>(file);

    if (!data?.title) throw new Error(`Missing "title" in frontmatter: ${sourcePath}`);
    if (!data?.startDate) throw new Error(`Missing "startDate" in frontmatter: ${sourcePath}`);
    if (!isStatus(data.status)) {
      throw new Error(
        `Invalid "status" in ${sourcePath}. Expected one of: ${PROJECT_STATUSES.join(', ')}.`,
      );
    }

    const slug = data.slug?.trim() || slugify(basename);
    const startDate = toDateString(data.startDate);
    const endDate = data.endDate ? toDateString(data.endDate) : undefined;
    const updates = parseUpdates(body);

    return {
      slug,
      href: `/projects/${slug}`,
      title: data.title,
      status: data.status,
      startDate,
      endDate,
      period: formatPeriod(startDate, endDate),
      description: data.description,
      technologies: toStringArray(data.technologies),
      collaborators: toStringArray(data.collaborators),
      coverImage: data.coverImage,
      coverAlt: data.coverAlt,
      coverItem: findMediaByRef(data.coverImage),
      gallery: Array.isArray(data.gallery) ? data.gallery : [],
      links: Array.isArray(data.links) ? data.links : [],
      relatedWriting: toStringArray(data.relatedWriting),
      featured: Boolean(data.featured),
      draft: Boolean(data.draft),
      order: typeof data.order === 'number' ? data.order : 0,
      placeholder: Boolean(data.placeholder),
      resurface: data.resurface !== false,
      noindex: data.noindex === true,
      updates,
      updateDates: updates.map((update) => update.date),
      body,
      plain: toPlainText(body),
      sourcePath,
    };
  });

  const seen = new Map<string, string>();
  for (const project of projects) {
    const existing = seen.get(project.slug);
    if (existing) {
      throw new Error(
        `Duplicate project slug "${project.slug}" in ${project.sourcePath} and ${existing}.`,
      );
    }
    seen.set(project.slug, project.sourcePath);
  }

  return projects.sort(compareProjects);
});

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

/**
 * Manual `order` wins, then active status, then most recent activity. The
 * result is that the things Dali currently cares about sit at the top without
 * him having to renumber anything.
 */
function compareProjects(a: Project, b: Project): number {
  if (a.order !== b.order) return b.order - a.order;

  const statusDelta = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  if (statusDelta !== 0) return statusDelta;

  const aDate = a.endDate ?? a.startDate;
  const bDate = b.endDate ?? b.startDate;
  return bDate.localeCompare(aDate) || a.slug.localeCompare(b.slug);
}

function visible(projects: Project[]): Project[] {
  return showDrafts ? projects : projects.filter((project) => !project.draft);
}

export function summarizeProject(project: Project): ProjectSummary {
  const {
    body: _body,
    plain: _plain,
    sourcePath: _sourcePath,
    gallery: _gallery,
    updates: _updates,
    ...rest
  } = project;
  return rest;
}

/**
 * The projects an essay belongs to, read backwards from each project's
 * `relatedWriting`. A project already links to its essays; this lets an
 * essay say "part of ReMow" without anyone writing that twice.
 */
const projectsByPost = once((): Map<string, ProjectSummary[]> => {
  const index = new Map<string, ProjectSummary[]>();
  for (const project of visible(loadAll())) {
    for (const postSlug of project.relatedWriting) {
      const list = index.get(postSlug) ?? [];
      list.push(summarizeProject(project));
      index.set(postSlug, list);
    }
  }
  return index;
});

export function getProjectsForPost(postSlug: string): ProjectSummary[] {
  return projectsByPost().get(postSlug) ?? [];
}

/* ==========================================================================
   Public API
   ========================================================================== */

export function getProjects(): ProjectSummary[] {
  return visible(loadAll()).map(summarizeProject);
}

export function getProject(slug: string): Project | undefined {
  return visible(loadAll()).find((project) => project.slug === slug);
}

export function getProjectSlugs(): string[] {
  return visible(loadAll()).map((project) => project.slug);
}

export function getFeaturedProjects(limit = 3): ProjectSummary[] {
  const projects = visible(loadAll());
  const featured = projects.filter((project) => project.featured);
  const pool = featured.length > 0 ? featured : projects;
  return pool.slice(0, limit).map(summarizeProject);
}

export type ProjectsByStatus = { status: ProjectStatus; label: string; projects: ProjectSummary[] };

export function getProjectsGroupedByStatus(): ProjectsByStatus[] {
  const projects = getProjects();
  return STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    projects: projects.filter((project) => project.status === status),
  })).filter((group) => group.projects.length > 0);
}

export function getProjectNeighbours(slug: string): {
  previous?: ProjectSummary;
  next?: ProjectSummary;
} {
  const projects = getProjects();
  const index = projects.findIndex((project) => project.slug === slug);
  if (index === -1) return {};
  return {
    previous: index > 0 ? projects[index - 1] : undefined,
    next: index < projects.length - 1 ? projects[index + 1] : undefined,
  };
}

export function getAllProjectsWithBodies(): Project[] {
  return visible(loadAll());
}
