import { expect, test, type Page } from '@playwright/test';

const CALL_ID = '44444444-4444-4444-8444-444444444444';
const CONVERSATION = '33333333-3333-4333-8333-333333333333';
const CALLER = '11111111-1111-4111-8111-111111111111';
const CALLEE = '22222222-2222-4222-8222-222222222222';
const DEVICE = '55555555-5555-4555-8555-555555555555.66666666-6666-4666-8666-666666666666';
const FIRST_ROUTE_RENDER_TIMEOUT_MS = 30_000;

async function openLocalApp(page: Page): Promise<void> {
	await page.addInitScript(() => {
		localStorage.setItem('fat-pref-lang', 'pt-PT');
		sessionStorage.setItem('presuntinho-session-daniel', JSON.stringify({
			unlocked: true,
			profile: 'daniel',
			method: 'daniel',
			unlockedAt: Date.now()
		}));
	});
	await page.goto('/mensagens/', { waitUntil: 'load', timeout: FIRST_ROUTE_RENDER_TIMEOUT_MS });
	// The legacy visual profile can earn its first local XP during boot. Close
	// that unrelated achievement dialog so this harness isolates CallLayer.
	const achievement = page.locator('.badge-overlay');
	await achievement.waitFor({ state: 'visible', timeout: 1_500 }).catch(() => undefined);
	if (await achievement.isVisible().catch(() => false)) {
		await achievement.locator('button').click();
		await expect(achievement).toBeHidden();
	}
	// The first Vite development render can still finish client-side module
	// compilation after the HTML `load` event. This budget applies only to that
	// route bootstrap; every call-state assertion below keeps its normal timeout.
	await expect(page.locator('main')).toBeVisible({ timeout: FIRST_ROUTE_RENDER_TIMEOUT_MS });
	// Mark-visited can asynchronously queue legacy streak/level celebrations.
	// Dismiss every unrelated dialog before mutating the isolated call store.
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const unrelated = page.locator('[role="dialog"]:not(.call-layer):visible').first();
		if ((await unrelated.count()) === 0) break;
		const action = unrelated.getByRole('button').last();
		if ((await action.count()) === 0) break;
		await action.click({ force: true, timeout: 2_000 }).catch(() => page.keyboard.press('Escape'));
		await unrelated.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => undefined);
	}
}

async function showCall(
	page: Page,
	state: {
		phase: string;
		kind?: 'audio' | 'video';
		deliveryStage?: string | null;
		error?: string | null;
		outcome?: string | null;
		incoming?: boolean;
		withTools?: boolean;
	}
): Promise<void> {
	await page.evaluate(async ({ next, ids }) => {
		const loadStore = Function('return import("/src/lib/calls/call-store.svelte.ts")');
		const { callStore } = await loadStore();
		const now = Date.now();
		callStore.requestedKind = next.kind ?? 'audio';
		callStore.peerProfile = {
			id: next.incoming ? ids.caller : ids.callee,
			label: next.incoming ? 'Rafael' : 'Fatma',
			emoji: next.incoming ? '🐷' : '💞',
			avatarUrl: null
		};
		callStore.session = ['preparing', 'creating', 'error'].includes(next.phase)
			? null
			: {
				id: ids.callId,
				conversationId: ids.conversation,
				caller: ids.caller,
				callee: ids.callee,
				callerDevice: ids.device,
				calleeDevice: next.phase === 'connecting' || next.phase === 'active' ? `${ids.device}.callee` : null,
				kind: next.kind ?? 'audio',
				status: next.phase === 'connecting' || next.phase === 'active' ? 'accepted' : 'ringing',
				createdAt: new Date(now).toISOString(),
				expiresAt: new Date(now + 60_000).toISOString(),
				callerHeartbeatAt: new Date(now).toISOString(),
				calleeHeartbeatAt: next.phase === 'connecting' || next.phase === 'active' ? new Date(now).toISOString() : null,
				callerLeaseExpiresAt: new Date(now + 120_000).toISOString(),
				calleeLeaseExpiresAt: next.phase === 'connecting' || next.phase === 'active' ? new Date(now + 120_000).toISOString() : null,
				pushSentAt: null,
				answeredAt: next.phase === 'connecting' || next.phase === 'active' ? new Date(now).toISOString() : null,
				endedAt: null
			};
		callStore.deliveryStage = next.deliveryStage ?? null;
		callStore.error = next.error ?? null;
		callStore.outcome = next.outcome ?? null;
		callStore.localStream = next.withTools ? new MediaStream() : null;
		callStore.remoteStream = null;
		callStore.connectedAt = next.phase === 'active' || next.phase === 'reconnecting' ? now - 72_000 : null;
		callStore.mediaDevices = next.withTools ? [
			{ deviceId: 'mic-built-in', kind: 'audioinput', label: 'Microfone integrado', fallbackOrdinal: 1, selectable: true },
			{ deviceId: 'camera-front', kind: 'videoinput', label: 'Câmara frontal', fallbackOrdinal: 1, selectable: true },
			{ deviceId: 'speaker-main', kind: 'audiooutput', label: 'Altifalante principal', fallbackOrdinal: 1, selectable: true }
		] : [];
		callStore.selectedMicrophoneId = next.withTools ? 'mic-built-in' : null;
		callStore.selectedCameraId = next.withTools ? 'camera-front' : null;
		callStore.selectedSpeakerId = null;
		callStore.mediaAction = null;
		callStore.mediaError = null;
		callStore.screenShareSupported = false;
		callStore.screenSharing = false;
		callStore.connectionQuality = next.withTools ? {
			sampledAt: now,
			rating: 'poor',
			reasons: ['high-rtt', 'packet-loss'],
			metrics: {
				rttMs: 486,
				jitterMs: 58,
				packetLossPercent: 8.4,
				inboundBitrateKbps: 312,
				outboundBitrateKbps: 196,
				totalBitrateKbps: 508
			},
			baseline: {
				sampledAt: now,
				inboundBytes: 1200,
				outboundBytes: 900,
				inboundPacketsReceived: 240,
				inboundPacketsLost: 21,
				remotePacketsReceived: 180,
				remotePacketsLost: 12
			}
		} : null;
		callStore.minimized = false;
		callStore.followupAction = null;
		callStore.followupStatus = 'idle';
		callStore.phase = next.phase;
	}, {
		next: state,
		ids: { callId: CALL_ID, conversation: CONVERSATION, caller: CALLER, callee: CALLEE, device: DEVICE }
	});
	await expect(page.locator(`.call-layer[data-phase="${state.phase}"]`)).toBeVisible();
}

test('caller sees immediate and factual progress instead of a silent click', async ({ page }, testInfo) => {
	await openLocalApp(page);
	await showCall(page, { phase: 'preparing', kind: 'audio' });
	await expect(page.getByText(/preparar microfone/i)).toBeVisible();
	await expect(page.locator('.call-timeline')).toBeVisible();

	await showCall(page, { phase: 'contacting', kind: 'audio', deliveryStage: 'presented' });
	await expect(page.getByText(/aviso apresentado/i)).toBeVisible();
	await expect(page.getByText(/a tocar no telemóvel/i)).toHaveCount(0);

	await showCall(page, { phase: 'ringing', kind: 'audio', deliveryStage: 'ringing' });
	await expect(page.getByText(/a tocar no telemóvel de Fatma/i)).toBeVisible();
	await page.screenshot({ path: testInfo.outputPath('caller-ringing.png'), fullPage: true });
});

test('callee gets a prominent mobile incoming dialog with accept and decline', async ({ page }, testInfo) => {
	await openLocalApp(page);
	await showCall(page, { phase: 'incoming', kind: 'video', incoming: true });
	const dialog = page.locator('.call-layer[role="dialog"]');
	await expect(dialog).toBeVisible();
	await expect(page.getByText(/Rafael está a ligar por vídeo/i)).toBeVisible();
	await expect(page.getByRole('button', { name: /recusar|decline/i })).toBeVisible();
	await expect(page.getByRole('button', { name: /atender|answer/i })).toBeVisible();
	const box = await dialog.boundingBox();
	expect(box).not.toBeNull();
	expect(box!.x).toBeGreaterThanOrEqual(0);
	expect(box!.y).toBeGreaterThanOrEqual(0);
	expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
	expect(box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
	await page.screenshot({ path: testInfo.outputPath('callee-incoming.png'), fullPage: true });
});

test('errors and cross-device outcomes remain actionable and explicit', async ({ page }) => {
	await openLocalApp(page);
	await showCall(page, { phase: 'error', kind: 'video', error: 'media_denied' });
	await expect(page.getByText(/permite o acesso ao microfone e à câmara/i)).toBeVisible();
	await expect(page.getByRole('button', { name: /tentar novamente/i })).toBeVisible();
	await expect(page.getByRole('button', { name: /fechar|close/i })).toBeVisible();

	await showCall(page, { phase: 'ended', kind: 'audio', outcome: 'answered_elsewhere', incoming: true });
	await expect(page.getByText(/atendida noutro dispositivo/i)).toBeVisible();

	await showCall(page, { phase: 'ended', kind: 'audio', outcome: 'unreachable' });
	const openChat = page.getByRole('link', { name: /abrir conversa/i });
	await expect(openChat).toBeVisible();
	await expect(openChat).toHaveAttribute('href', new RegExp(`conversation=${CONVERSATION}`));

});

test('active call exposes quality and device controls without overflowing mobile', async ({ page }, testInfo) => {
	await page.addInitScript(() => {
		try {
			Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
				configurable: true,
				value: undefined
			});
		} catch {
			/* The test still validates whichever factual capability UI the browser exposes. */
		}
	});
	await openLocalApp(page);
	await showCall(page, { phase: 'active', kind: 'video', withTools: true });

	const quality = page.locator('.quality-pill[data-quality="poor"]');
	await expect(quality).toContainText(/ligação fraca/i);
	await quality.click();
	const details = page.locator('#call-quality-details');
	await expect(details).toBeVisible();
	await expect(details.getByText(/resposta da rede está lenta/i)).toBeVisible();
	await expect(details.getByText(/rede está a perder dados/i)).toBeVisible();
	await expect(details).toContainText('486 ms');
	await expect(details).toContainText(/8[,.]4 %/);

	await page.locator('.tools-toggle').click();
	const tools = page.locator('#call-media-tools');
	await expect(tools).toBeVisible();
	await expect(tools.getByRole('combobox')).toHaveCount(2);
	await expect(tools.getByRole('option', { name: 'Microfone integrado' })).toHaveCount(1);
	await expect(tools.getByRole('option', { name: 'Câmara frontal' })).toHaveCount(1);
	await expect(tools.getByText(/não permite escolher o altifalante na app/i)).toBeVisible();
	await expect(tools.getByRole('button', { name: /partilhar ecrã/i })).toHaveCount(0);
	await expect(tools.getByRole('button', { name: /janela flutuante/i })).toHaveCount(0);
	await expect(tools.getByRole('button', { name: /atualizar dispositivos/i })).toBeVisible();

	const dialog = page.locator('.call-layer[role="dialog"]');
	const dialogBox = await dialog.boundingBox();
	const toolsBox = await tools.boundingBox();
	const viewport = page.viewportSize();
	expect(dialogBox).not.toBeNull();
	expect(toolsBox).not.toBeNull();
	expect(viewport).not.toBeNull();
	expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
	expect(dialogBox!.width).toBeLessThanOrEqual(viewport!.width);
	expect(toolsBox!.x).toBeGreaterThanOrEqual(0);
	expect(toolsBox!.x + toolsBox!.width).toBeLessThanOrEqual(viewport!.width);
	await page.screenshot({ path: testInfo.outputPath('active-call-tools.png'), fullPage: true });

	await page.getByRole('button', { name: /minimizar chamada/i }).click();
	const mini = page.locator('.call-mini');
	await expect(mini).toBeVisible();
	await expect(page.locator('.call-layer')).toHaveCount(0);
	await expect(mini).toContainText(/Fatma/);
	await expect(mini).toContainText(/ligação fraca/i);
	expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
	const miniBox = await mini.boundingBox();
	expect(miniBox).not.toBeNull();
	expect(miniBox!.x).toBeGreaterThanOrEqual(0);
	expect(miniBox!.x + miniBox!.width).toBeLessThanOrEqual(viewport!.width);
	expect(miniBox!.y + miniBox!.height).toBeLessThanOrEqual(viewport!.height);

	const miniMute = mini.getByRole('button', { name: /silenciar microfone/i });
	await miniMute.click();
	await expect(mini.getByRole('button', { name: /ativar microfone/i })).toHaveAttribute('aria-pressed', 'true');
	await mini.getByRole('button', { name: /voltar à chamada/i }).last().click();
	await expect(page.locator('.call-layer[data-phase="active"]')).toBeVisible();
	await expect(mini).toHaveCount(0);
	expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
});
