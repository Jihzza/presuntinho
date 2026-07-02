// Server-side load for /aulas.
//
// Aggregates every lesson JSON under static/lessons/<course>/*.json into
// a single timeline. We intentionally do NOT duplicate content: only
// metadata (id, title, courseSlug, description hint, audio refs, course
// icon/color, quizSlug hint) is returned to the client. Full lesson
// content continues to live in /static/lessons/ and is fetched on
// demand when the user opens a lesson at /escola/licao/....
//
// The course/unit registry (icon / color / display title) is sourced from
// src/lib/escola/catalog.ts so /aulas no longer maintains its own duplicate
// course metadata. If a static lesson directory is not in the catalogue we
// still list its lessons using the directory slug as the fallback label.
//
// Runs in Node (SvelteKit server hook) — `fs` is safe here.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { schoolLessonDirectoryOrder, schoolMetaForSlug } from '../../lib/escola/catalog';

export interface CourseMeta {
  slug: string;
  title: string;
  icon: string;
  color: string;
}

export interface LessonMeta {
  /** Unique id across the entire app: "<courseSlug>/<lessonId>". */
  id: string;
  /** Slug of the parent course. */
  courseSlug: string;
  /** Display title (from the lesson JSON, or a slug→Title fallback). */
  title: string;
  /** First ~140 chars of the lesson's lead text — used as card description. */
  description: string;
  /** Path to the lesson audio (empty string when none). */
  audio: string;
  /** Human-friendly label for the audio ("Audio walkthrough (PT)" etc). */
  audioLabel: string;
  /** Stable order within the parent course (alphabetical, matches repo layout). */
  order: number;
}

export interface CourseBucket {
  meta: CourseMeta;
  lessons: LessonMeta[];
}

const LESSONS_DIR = 'static/lessons';

// /aulas now reads course/unit display metadata from src/lib/escola/catalog.ts.
// Unknown static lesson folders still render with a humanised fallback label.
/** Turn "blue-ocean-strategy" → "Blue Ocean Strategy". */
function humanise(slug: string): string {
  return slug
    .replace(/\.json$/, '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Extract a short description from the lesson's sections. */
function extractDescription(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const sections = (raw as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return '';
  for (const section of sections) {
    if (!section || typeof section !== 'object') continue;
    const s = section as Record<string, unknown>;
    const content = typeof s.content === 'string' ? s.content : '';
    const text = typeof s.text === 'string' ? s.text : '';
    const body = (content || text).trim();
    if (body.length > 0) {
      // Trim to a sentence-ish chunk for card previews.
      const flat = body.replace(/\s+/g, ' ');
      if (flat.length <= 140) return flat;
      const cut = flat.slice(0, 140);
      const lastSpace = cut.lastIndexOf(' ');
      return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
    }
  }
  return '';
}

function loadCourse(courseDir: string, courseSlug: string): CourseBucket | null {
  let entries: string[];
  try {
    entries = readdirSync(courseDir);
  } catch {
    return null;
  }
  // Exclude `course.json` — those are *course metadata* (slug, icon,
  // description, lesson index), not lessons. They live next to the
  // lesson files so `/escola/curso/[slug]/` can fetch them via a single
  // read, but they must NOT show up in /aulas as #N "<Course Name>".
  // gap-128: 23 fake "#5 <CourseName>" entries were rendering as
  // empty placeholder cards before this filter.
  const jsonFiles = entries
    .filter((f) => f.endsWith('.json') && f !== 'course.json')
    .sort();
  if (jsonFiles.length === 0) return null;

  const lessons: LessonMeta[] = [];
  for (let i = 0; i < jsonFiles.length; i++) {
    const file = jsonFiles[i];
    const path = join(courseDir, file);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      // Skip corrupt / non-JSON files rather than blowing up the whole
      // page — the aggregator is best-effort across 70 files.
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const lessonId = typeof obj.id === 'string' && obj.id.length > 0 ? obj.id : file.replace(/\.json$/, '');
    const title = typeof obj.title === 'string' && obj.title.length > 0 ? obj.title : humanise(lessonId);
    lessons.push({
      id: `${courseSlug}/${lessonId}`,
      courseSlug,
      title,
      description: extractDescription(obj),
      audio: typeof obj.audio === 'string' ? obj.audio : '',
      audioLabel: typeof obj.audioLabel === 'string' ? obj.audioLabel : '',
      order: i
    });
  }

  const meta: CourseMeta =
    schoolMetaForSlug(courseSlug) ?? {
      slug: courseSlug,
      title: humanise(courseSlug),
      icon: '📘',
      color: '#64748b'
    };

  return { meta, lessons };
}

export const load = () => {
  let courseDirs: string[];
  try {
    courseDirs = readdirSync(LESSONS_DIR);
  } catch {
    return { courses: [] as CourseBucket[] };
  }

  // Stable order: keep the IA catalogue order first, then append
  // unknown legacy/static courses alphabetically so old content still
  // shows up predictably.
  const knownOrder = schoolLessonDirectoryOrder();
  const knownSet = new Set(knownOrder);
  const sorted = [
    ...knownOrder.filter((s) => courseDirs.includes(s)),
    ...courseDirs.filter((s) => !knownSet.has(s)).sort()
  ];

  const courses: CourseBucket[] = [];
  for (const slug of sorted) {
    const bucket = loadCourse(join(LESSONS_DIR, slug), slug);
    if (bucket) courses.push(bucket);
  }

  return { courses };
};
