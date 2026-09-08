import 'server-only';

import {
  PROJECT_STATUSES,
  type Project,
  type ProjectFrontmatter,
  type ProjectStatus,
  type ProjectSummary,
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

/** Ordering for the index: live things first, dead things last but present. */
export const STATUS_ORDER: ProjectStatus[] = [
  'building',
  'experiment',
  'paused',
  'finished',
  'abandoned',
];

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
    ...rest
  } = project;
  return rest;
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
