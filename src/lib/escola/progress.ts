// Escola progress engine — V8.
//
// Single domain-helper module that joins three data sources:
//   1. The static course catalog (catalog.ts) — which lessons/quizzes exist.
//   2. Dexie `visited` rows — 'lesson:<unit>:<lesson>' (written by
//      LessonRunner on open) and 'lesson-done:<unit>:<lesson>' (written
//      here, exactly once, when a lesson is completed).
//   3. Dexie `quizScores` rows — extended (non-indexed extra fields, so
//      no db.ts schema change is needed) with `total`, `best`,
//      `attempts` and `lastCorrect` so we can show mastery over time.
//
// All Dexie access for the Escola UI goes through this module —
// components never touch db() directly.  Every helper is browser-only;
// callers run them from onMount.

import { db } from '$lib/state/db';
import type { AssignmentRow, QuizScoreRow } from '$lib/state/db';
import { awardXP } from '$lib/state/xp-actions';
import { schoolCourses, type SchoolCourse, type SchoolUnit } from './catalog';
import { legacyCourseDetails } from './legacy-course-details';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProgressStat {
  done: number;
  total: number;
  percent: number; // 0..100, rounded
}

export interface UnitProgress extends ProgressStat {
  slug: string;
  title: string;
  icon: string;
  color: string;
}

export interface CourseProgress extends ProgressStat {
  slug: string;
  title: string;
  icon: string;
  units: UnitProgress[];
}

/** Deep-link target for "continue where you left off". */
export interface NextLessonTarget {
  unitSlug: string;
  unitTitle: string;
  unitIcon: string;
  courseSlug: string;
  lessonSlug: string;
  lessonTitle: string;
  href: string;
}

/** Quiz attempt history derived from the extended QuizScoreRow. */
export interface QuizHistory {
  quizId: string;
  /** Best correct-answer count across attempts. */
  best: number;
  /** Question count captured at submit time; null for pre-V8 rows. */
  total: number | null;
  attempts: number;
  lastCorrect: number;
  /** Best score in percent (null when total is unknown). */
  percent: number | null;
  perfect: boolean;
  updatedAt: number;
}

export interface SchoolSummary {
  /** Catalog lessons completed (visited) / catalog lessons total. */
  lessonsDone: number;
  lessonsTotal: number;
  /** Distinct quizzes with at least one submission. */
  quizzesTaken: number;
  /** Quizzes where the best attempt was 100%. */
  quizzesPerfect: number;
}

// Extra fields live alongside QuizScoreRow — Dexie stores them fine and
// old readers (backup, hub counters) simply ignore them.
type QuizScoreRowExt = QuizScoreRow & {
  total?: number;
  best?: number;
  attempts?: number;
  lastCorrect?: number;
};

// ---------------------------------------------------------------------------
// Visited keys
// ---------------------------------------------------------------------------

export function lessonVisitedId(unitSlug: string, lessonSlug: string): string {
  return `lesson:${unitSlug}:${lessonSlug}`;
}

function lessonDoneId(unitSlug: string, lessonSlug: string): string {
  return `lesson-done:${unitSlug}:${lessonSlug}`;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** All visited lesson ids ('lesson:*') mapped to their visitedAt stamp. */
export async function loadVisitedLessons(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!hasIndexedDb()) return map;
  const rows = await db().visited.toArray();
  for (const row of rows) {
    if (typeof row.id === 'string' && row.id.startsWith('lesson:') && row.visited) {
      map.set(row.id, row.visitedAt || 0);
    }
  }
  return map;
}

/** Set of lesson slugs of a single unit that have been opened. */
export async function visitedLessonsForUnit(unitSlug: string): Promise<Set<string>> {
  const visited = await loadVisitedLessons();
  const set = new Set<string>();
  const prefix = `lesson:${unitSlug}:`;
  for (const id of visited.keys()) {
    if (id.startsWith(prefix)) set.add(id.slice(prefix.length));
  }
  return set;
}

// ---------------------------------------------------------------------------
// Per-unit / per-course progress
// ---------------------------------------------------------------------------

function statFor(done: number, total: number): ProgressStat {
  return {
    done,
    total,
    percent: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  };
}

function unitProgressFromVisited(unit: SchoolUnit, visited: Map<string, number>): UnitProgress {
  const done = unit.lessons.filter((lesson) => visited.has(lessonVisitedId(unit.slug, lesson.slug))).length;
  return {
    slug: unit.slug,
    title: unit.title,
    icon: unit.icon,
    color: unit.color,
    ...statFor(done, unit.lessons.length)
  };
}

function allUnits(course: SchoolCourse): SchoolUnit[] {
  return [...course.units, ...(course.extras ?? [])];
}

function courseProgressFromVisited(course: SchoolCourse, visited: Map<string, number>): CourseProgress {
  const units = allUnits(course).map((unit) => unitProgressFromVisited(unit, visited));
  const done = units.reduce((sum, u) => sum + u.done, 0);
  const total = units.reduce((sum, u) => sum + u.total, 0);
  return {
    slug: course.slug,
    title: course.title,
    icon: course.icon,
    units,
    ...statFor(done, total)
  };
}

/** Progress for one catalog course (by course slug). */
export async function courseProgress(courseSlug: string): Promise<CourseProgress | null> {
  const course = schoolCourses.find((c) => c.slug === courseSlug);
  if (!course) return null;
  const visited = await loadVisitedLessons();
  return courseProgressFromVisited(course, visited);
}

/** Progress for every catalog course (one Dexie read). */
export async function allCourseProgress(): Promise<CourseProgress[]> {
  const visited = await loadVisitedLessons();
  return schoolCourses.map((course) => courseProgressFromVisited(course, visited));
}

// ---------------------------------------------------------------------------
// Next lesson / resume
// ---------------------------------------------------------------------------

function targetFor(course: SchoolCourse, unit: SchoolUnit, lessonSlug: string, lessonTitle: string): NextLessonTarget {
  return {
    unitSlug: unit.slug,
    unitTitle: unit.title,
    unitIcon: unit.icon,
    courseSlug: course.slug,
    lessonSlug,
    lessonTitle,
    href: `/escola/licao/${unit.slug}/${lessonSlug}/`
  };
}

function nextLessonFromVisited(course: SchoolCourse, visited: Map<string, number>): NextLessonTarget | null {
  for (const unit of allUnits(course)) {
    for (const lesson of unit.lessons) {
      if (!visited.has(lessonVisitedId(unit.slug, lesson.slug))) {
        return targetFor(course, unit, lesson.slug, lesson.title);
      }
    }
  }
  return null;
}

/** First not-yet-opened lesson of a course, in catalog order. */
export async function nextLesson(courseSlug: string): Promise<NextLessonTarget | null> {
  const course = schoolCourses.find((c) => c.slug === courseSlug);
  if (!course) return null;
  const visited = await loadVisitedLessons();
  return nextLessonFromVisited(course, visited);
}

/**
 * "Continue where you left off": looks at the most recently opened
 * lesson, then suggests the next unopened lesson in that unit (then in
 * that course).  Falls back to the first unopened lesson anywhere.
 * Returns null only when every catalog lesson has been opened.
 */
export async function resumeTarget(): Promise<NextLessonTarget | null> {
  const visited = await loadVisitedLessons();

  // Find the most recent catalog lesson visit.
  let lastUnit: SchoolUnit | null = null;
  let lastCourse: SchoolCourse | null = null;
  let lastAt = -1;
  for (const course of schoolCourses) {
    for (const unit of allUnits(course)) {
      for (const lesson of unit.lessons) {
        const at = visited.get(lessonVisitedId(unit.slug, lesson.slug));
        if (at !== undefined && at > lastAt) {
          lastAt = at;
          lastUnit = unit;
          lastCourse = course;
        }
      }
    }
  }

  if (lastUnit && lastCourse) {
    for (const lesson of lastUnit.lessons) {
      if (!visited.has(lessonVisitedId(lastUnit.slug, lesson.slug))) {
        return targetFor(lastCourse, lastUnit, lesson.slug, lesson.title);
      }
    }
    const inCourse = nextLessonFromVisited(lastCourse, visited);
    if (inCourse) return inCourse;
  }

  for (const course of schoolCourses) {
    const target = nextLessonFromVisited(course, visited);
    if (target) return target;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lesson completion XP (idempotent)
// ---------------------------------------------------------------------------

/**
 * Award `lesson_complete` XP exactly once per lesson.  A separate
 * 'lesson-done:' visited row is the idempotency marker (the plain
 * 'lesson:' row is written on OPEN, so it can't gate completion).
 * Returns true when XP was awarded on this call.
 */
export async function completeLessonOnce(unitSlug: string, lessonSlug: string): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  const d = db();
  const id = lessonDoneId(unitSlug, lessonSlug);
  const existing = await d.visited.get(id);
  if (existing?.visited) return false;
  await d.visited.put({ id, visited: true, visitedAt: Date.now() });
  await awardXP('lesson_complete');
  return true;
}

// ---------------------------------------------------------------------------
// Quiz history
// ---------------------------------------------------------------------------

function historyFromRow(row: QuizScoreRowExt): QuizHistory {
  const best = typeof row.best === 'number' ? Math.max(row.best, row.score) : row.score;
  const total = typeof row.total === 'number' && row.total > 0 ? row.total : null;
  return {
    quizId: row.id,
    best,
    total,
    attempts: typeof row.attempts === 'number' && row.attempts > 0 ? row.attempts : 1,
    lastCorrect: typeof row.lastCorrect === 'number' ? row.lastCorrect : row.score,
    percent: total ? Math.min(100, Math.round((best / total) * 100)) : null,
    perfect: total !== null && best >= total,
    updatedAt: row.updatedAt
  };
}

/** History for a single quiz; null when never attempted. */
export async function getQuizHistory(quizId: string): Promise<QuizHistory | null> {
  if (!hasIndexedDb() || !quizId) return null;
  const row = (await db().quizScores.get(quizId)) as QuizScoreRowExt | undefined;
  return row ? historyFromRow(row) : null;
}

/** History for every attempted quiz, keyed by quiz id. */
export async function quizHistoryMap(): Promise<Map<string, QuizHistory>> {
  const map = new Map<string, QuizHistory>();
  if (!hasIndexedDb()) return map;
  const rows = (await db().quizScores.toArray()) as QuizScoreRowExt[];
  for (const row of rows) map.set(row.id, historyFromRow(row));
  return map;
}

/**
 * Persist a quiz submission.  Single write path for QuizRunner: keeps
 * the V3-compatible `score`/`answered` shape AND the V8 history fields
 * (`total`, `best`, `attempts`, `lastCorrect`) in one put, so nothing
 * overwrites the history afterwards.
 */
export async function recordQuizResult(
  quizId: string,
  correct: number,
  total: number,
  answeredIndices: number[]
): Promise<QuizHistory> {
  const d = db();
  const prev = (await d.quizScores.get(quizId)) as QuizScoreRowExt | undefined;
  const prevBest = prev ? (typeof prev.best === 'number' ? Math.max(prev.best, prev.score) : prev.score) : 0;
  const next: QuizScoreRowExt = {
    id: quizId,
    score: correct,
    answered: answeredIndices,
    updatedAt: Date.now(),
    total,
    best: Math.max(prevBest, correct),
    attempts: (typeof prev?.attempts === 'number' && prev.attempts > 0 ? prev.attempts : prev ? 1 : 0) + 1,
    lastCorrect: correct
  };
  await d.quizScores.put(next);
  return historyFromRow(next);
}

// ---------------------------------------------------------------------------
// Summaries (dashboard hero + hub card)
// ---------------------------------------------------------------------------

/** Distinct quiz slugs referenced by the catalog. */
export function catalogQuizSlugs(): Set<string> {
  const set = new Set<string>();
  for (const course of schoolCourses) {
    for (const unit of allUnits(course)) {
      for (const lesson of unit.lessons) {
        if (lesson.quizSlug) set.add(lesson.quizSlug);
      }
    }
  }
  return set;
}

/** Real numbers for the /escola hero: lessons opened, quizzes taken, perfect quizzes. */
export async function schoolSummary(): Promise<SchoolSummary> {
  if (!hasIndexedDb()) {
    return { lessonsDone: 0, lessonsTotal: catalogLessonTotal(), quizzesTaken: 0, quizzesPerfect: 0 };
  }
  const [visited, quizzes] = await Promise.all([loadVisitedLessons(), quizHistoryMap()]);
  let lessonsDone = 0;
  for (const course of schoolCourses) {
    for (const unit of allUnits(course)) {
      for (const lesson of unit.lessons) {
        if (visited.has(lessonVisitedId(unit.slug, lesson.slug))) lessonsDone++;
      }
    }
  }
  let quizzesPerfect = 0;
  for (const history of quizzes.values()) {
    if (history.perfect) quizzesPerfect++;
  }
  return {
    lessonsDone,
    lessonsTotal: catalogLessonTotal(),
    quizzesTaken: quizzes.size,
    quizzesPerfect
  };
}

function catalogLessonTotal(): number {
  return schoolCourses.reduce(
    (sum, course) => sum + allUnits(course).reduce((s, unit) => s + unit.lessons.length, 0),
    0
  );
}

// ---------------------------------------------------------------------------
// Assignments (deadlines shown on /escola; rows live in the Dexie
// `assignments` table owned by the trabalhos helpers)
// ---------------------------------------------------------------------------

/** Next open assignments by deadline (pending / in_progress only). */
export async function upcomingAssignments(limit = 3): Promise<AssignmentRow[]> {
  if (!hasIndexedDb()) return [];
  const rows = await db().assignments.orderBy('deadline').toArray();
  return rows.filter((row) => row.status === 'pending' || row.status === 'in_progress').slice(0, limit);
}

// ---------------------------------------------------------------------------
// Legacy course directory (/escola — makes the 180+ archived lessons reachable)
// ---------------------------------------------------------------------------

export interface LegacyCourseEntry {
  slug: string;
  title: string;
  icon: string;
  color: string;
  tagline: string;
  lessonCount: number;
  quizCount: number;
  href: string;
}

/**
 * Every legacy course that is NOT already reachable as a catalog unit.
 * Sorted alphabetically by title so the directory scans well.
 */
export function legacyCourseDirectory(): LegacyCourseEntry[] {
  const catalogSlugs = new Set<string>();
  for (const course of schoolCourses) {
    catalogSlugs.add(course.slug);
    for (const unit of allUnits(course)) catalogSlugs.add(unit.slug);
  }
  return Object.values(legacyCourseDetails)
    .filter((detail) => !catalogSlugs.has(detail.slug))
    .map((detail) => ({
      slug: detail.slug,
      title: detail.title,
      icon: detail.icon,
      color: detail.color,
      tagline: detail.tagline,
      lessonCount: detail.lessons.length,
      quizCount: new Set(detail.lessons.map((l) => l.quizSlug).filter(Boolean)).size,
      href: `/escola/curso/${detail.slug}/`
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'pt'));
}
