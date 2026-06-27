// Assignment data layer. Reads from /data/assignments/*.json (fetched at runtime).
// Writes user status to localStorage (no schema changes to Dexie).

import { browser } from '$app/environment';

const STATUS_KEY = 'fat-assignments-status';

export interface Assignment {
  id: string;
  slug: string;
  title: string;
  weight: number;
  lessonSlug?: string;
  audioSlug?: string;
  whatToDo: string;
  howToDo: string;
  hint: string;
  estimatedMinutes: number;
}

export interface AssignmentPack {
  courseSlug: string;
  title: string;
  deadline: string;
  weight: string;
  assignments: Assignment[];
}

export async function loadAssignments(
  courseSlug: string
): Promise<AssignmentPack | null> {
  if (!browser) return null;
  try {
    const r = await fetch(`/data/assignments/${courseSlug}.json`);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export function getAssignmentStatus(
  assignmentId: string
): 'open' | 'in_progress' | 'done' {
  if (!browser) return 'open';
  try {
    const all = JSON.parse(localStorage.getItem(STATUS_KEY) || '{}');
    return all[assignmentId] || 'open';
  } catch {
    return 'open';
  }
}

export function setAssignmentStatus(
  assignmentId: string,
  status: 'open' | 'in_progress' | 'done'
): void {
  if (!browser) return;
  try {
    const all = JSON.parse(localStorage.getItem(STATUS_KEY) || '{}');
    all[assignmentId] = status;
    localStorage.setItem(STATUS_KEY, JSON.stringify(all));
    // Dispatch event for reactive UI
    window.dispatchEvent(
      new CustomEvent('presuntinho:assignment-status', {
        detail: { assignmentId, status }
      })
    );
  } catch {
    /* quota or disabled — ignore */
  }
}

export function getAllAssignmentStatuses(): Record<
  string,
  'open' | 'in_progress' | 'done'
> {
  if (!browser) return {};
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}');
  } catch {
    return {};
  }
}
