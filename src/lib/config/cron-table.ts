/**
 * cron-table.ts — task-064
 *
 * Single source of truth describing the four operational crons that keep
 * the presuntinho / Hermes cadência running. The CEO asked (msg 45617):
 * "o que está a fazer?" → reply with a clear table:
 *
 *   name | schedule | output | state
 *
 * No jargon, just the four crons and where their artefacts land.
 *
 * This module is consumed by:
 *   - src/routes/api/cron-table/+server.ts   (JSON endpoint for audits)
 *   - any future UI dashboard that needs to surface the cadence.
 *
 * IMPORTANT — DO NOT hardcode `.state/cron-history.json` reads in callers.
 * Use `getCronTable()` (the function, not the const) so the runtime can
 * inject lastRun / lastStatus / lastOutputBytes from the history file when
 * it exists. The const `CRON_TABLE` is a *base* snapshot — the function is
 * the live, possibly-enriched view.
 *
 * The four crons (canonical naming — must match scripts/*.mjs and Hermes
 * registry entries):
 *
 *   1. brain-dump   — every 10 min   → writes static/brain-dump.html
 *   2. plan         — every 30 min   → writes static/plan.html
 *   3. tasks        — every 15 min   → writes static/tasks.html
 *   4. execute      — every 20 min   → patches local source (no static output)
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Allowed last-run statuses. Mirror scripts/watchdog-tick.mjs vocabulary. */
export type CronStatus = 'idle' | 'running' | 'done' | 'blocked';

/** One row of the cron table — what the CEO and `+server.ts` see. */
export interface CronEntry {
	/** Stable identifier — also the filename stem of the output artefact. */
	name: 'brain-dump' | 'plan' | 'tasks' | 'execute';
	/** Human-readable cadence, e.g. "every 10 min". */
	schedule: string;
	/** Cadence expressed as a minutes number — handy for nextRun math. */
	intervalMinutes: number;
	/** Absolute filesystem path the cron writes to. */
	output: string;
	/**
	 * Last observed runtime status. Populated from .state/cron-history.json
	 * when present; otherwise "idle" (best-effort default).
	 */
	lastStatus: CronStatus;
	/**
	 * Epoch ms of the most recent run. null when the history file is absent
	 * or has no entry for this cron.
	 */
	lastRun: number | null;
	/**
	 * Size of the output artefact in bytes at lastRun, or null when the
	 * artefact does not exist on disk yet. `execute` is always null because
	 * it patches source — there is no single output file.
	 */
	lastOutputBytes: number | null;
	/**
	 * Best-effort next scheduled run, computed from lastRun + intervalMinutes
	 * (or "now + intervalMinutes" when lastRun is null). Epoch ms.
	 */
	nextRun: number;
}

/** Shape of `.state/cron-history.json` — best-effort, defensive. */
interface CronHistoryFile {
	cron?: string;
	timestamp?: number;
	status?: CronStatus;
	outputBytes?: number;
	runs?: Partial<Record<CronEntry['name'], CronHistoryRun>>;
}

interface CronHistoryRun {
	lastRun?: number;
	lastStatus?: CronStatus;
	lastOutputBytes?: number | null;
}

// ---------------------------------------------------------------------------
// Static base table
// ---------------------------------------------------------------------------

/**
 * Absolute paths are resolved relative to `process.cwd()` at module load
 * time. Under `vite dev` / `vite build` cwd is the repo root, so
 * `static/brain-dump.html` resolves to `static/brain-dump.html` inside
 * the repo — exactly where the crons write.
 */
const REPO_ROOT = process.cwd();

export const CRON_TABLE: ReadonlyArray<CronEntry> = Object.freeze([
	Object.freeze({
		name: 'brain-dump',
		schedule: 'every 10 min',
		intervalMinutes: 10,
		output: resolve(REPO_ROOT, 'static/brain-dump.html'),
		lastStatus: 'idle',
		lastRun: null,
		lastOutputBytes: null,
		nextRun: Date.now() + 10 * 60_000
	}) as CronEntry,
	Object.freeze({
		name: 'plan',
		schedule: 'every 30 min',
		intervalMinutes: 30,
		output: resolve(REPO_ROOT, 'static/plan.html'),
		lastStatus: 'idle',
		lastRun: null,
		lastOutputBytes: null,
		nextRun: Date.now() + 30 * 60_000
	}) as CronEntry,
	Object.freeze({
		name: 'tasks',
		schedule: 'every 15 min',
		intervalMinutes: 15,
		output: resolve(REPO_ROOT, 'static/tasks.html'),
		lastStatus: 'idle',
		lastRun: null,
		lastOutputBytes: null,
		nextRun: Date.now() + 15 * 60_000
	}) as CronEntry,
	Object.freeze({
		name: 'execute',
		schedule: 'every 20 min',
		intervalMinutes: 20,
		// `execute` patches local source files — there is no single output
		// artefact. We still set the path to the tasks board it touches most
		// often so the table row has something to render.
		output: resolve(REPO_ROOT, '.state/cron-execute.log'),
		lastStatus: 'idle',
		lastRun: null,
		lastOutputBytes: null,
		nextRun: Date.now() + 20 * 60_000
	}) as CronEntry
]);

// ---------------------------------------------------------------------------
// History enrichment — best-effort, never throws
// ---------------------------------------------------------------------------

/** Location of the runtime-written history file. May not exist. */
const HISTORY_PATH = resolve(REPO_ROOT, '.state/cron-history.json');

/**
 * Read the history file if present. Returns null on any failure so the
 * caller can fall back to the static table without a try/catch.
 */
function readHistory(): CronHistoryFile | null {
	try {
		if (!existsSync(HISTORY_PATH)) return null;
		const raw = readFileSync(HISTORY_PATH, 'utf8');
		const parsed = JSON.parse(raw) as CronHistoryFile;
		return parsed;
	} catch {
		// Corrupt JSON, permission error, etc. — never throw from a
		// best-effort enrichment layer.
		return null;
	}
}

/**
 * Probe the size of an output artefact if it exists. Returns null on any
 * failure (execute's log path often does not exist yet).
 */
function probeOutputBytes(path: string): number | null {
	try {
		if (!existsSync(path)) return null;
		return statSync(path).size;
	} catch {
		return null;
	}
}

/**
 * Live view of the cron table. Same shape as `CRON_TABLE` but with the
 * runtime-injected fields populated when `.state/cron-history.json` exists.
 *
 * Algorithm:
 *   1. Clone each static entry.
 *   2. If the history file is missing/corrupt, return the static clone
 *      verbatim — the table still renders and shows "idle" everywhere.
 *   3. Otherwise, merge the history entry for that cron and refresh
 *      `lastOutputBytes` from disk so a freshly-written artefact shows the
 *      current size, not the size at the last run.
 *   4. Recompute `nextRun` from `lastRun + intervalMinutes` when we have a
 *      real lastRun; otherwise keep the static "now + interval" estimate.
 */
export function getCronTable(): CronEntry[] {
	const history = readHistory();
	const now = Date.now();

	return CRON_TABLE.map((entry) => {
		const run: CronHistoryRun | undefined = history?.runs?.[entry.name];
		const lastRun = run?.lastRun ?? entry.lastRun;
		const lastStatus: CronStatus = run?.lastStatus ?? entry.lastStatus;
		const lastOutputBytes =
			run?.lastOutputBytes !== undefined
				? run.lastOutputBytes
				: probeOutputBytes(entry.output);
		const nextRun = lastRun
			? lastRun + entry.intervalMinutes * 60_000
			: now + entry.intervalMinutes * 60_000;

		return {
			name: entry.name,
			schedule: entry.schedule,
			intervalMinutes: entry.intervalMinutes,
			output: entry.output,
			lastStatus,
			lastRun,
			lastOutputBytes,
			nextRun
		} satisfies CronEntry;
	});
}