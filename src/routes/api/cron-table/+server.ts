import type { RequestHandler } from './$types';
import { getCronTable } from '$lib/config/cron-table';

/**
 * GET /api/cron-table — task-064
 *
 * Returns the four operational crons that drive the presuntinho / Hermes
 * cadência so the CEO (or any auditor) can answer the question
 * "o que está a fazer?" without jargon.
 *
 * Shape:
 *   {
 *     ok: true,
 *     generatedAt: <epoch ms>,
 *     crons: [
 *       { name, schedule, intervalMinutes, output,
 *         lastStatus, lastRun, lastOutputBytes, nextRun },
 *       ... (4 entries total)
 *     ]
 *   }
 *
 * No auth. The data is non-sensitive operational metadata — knowing the
 * cadence of the four crons that touch static/*.html does not leak any
 * personal data. The dev-auth-bypass helper is only needed for the
 * authenticated UI sections; this endpoint is open by design.
 *
 * Prerendered at build time so it ships as a static JSON file under
 * `build/api/cron-table`. The static export requires a constant `prerender`
 * flag at build time, but the runtime view still reflects the latest
 * `.state/cron-history.json` because the build is the latest snapshot.
 * Refresh after each cron write (or call `npm run build` again).
 */
export const prerender = true;

export const GET: RequestHandler = () => {
	const crons = getCronTable();
	const body = JSON.stringify(
		{
			ok: true,
			generatedAt: Date.now(),
			count: crons.length,
			crons
		},
		null,
		2
	);

	return new Response(body, {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			// Short cache: the file is regenerated at build time anyway, and
			// during dev the SPA fallback serves this directly.
			'cache-control': 'public, max-age=60'
		}
	});
};