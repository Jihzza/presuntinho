import { describe, expect, it } from 'vitest';
import {
	foregroundMessageHref,
	mutedConversationIdsFromInbox,
	parseRichMessageRow,
	shouldPresentForegroundMessage
} from './foreground-messages';

const base = {
	id: '16ea1bcc-f191-4f39-837f-273daf72c504',
	created_at: '2026-07-15T12:00:00.000Z'
};

describe('foreground message parsing', () => {
	it('deep-links to the exact conversation and message', () => {
		expect(foregroundMessageHref({
			id: base.id,
			conversationId: 'a346c38c-646a-454e-b073-af7d17769c3b'
		})).toBe(
			`/mensagens/?conversation=a346c38c-646a-454e-b073-af7d17769c3b&message=${base.id}`
		);
	});

	it('covers rich video/files but leaves call history to the call layer', () => {
		const conversationId = 'a346c38c-646a-454e-b073-af7d17769c3b';
		const rich = {
			...base,
			conversation_id: conversationId,
			sender_id: 'e46911f6-ec6e-40ef-80a4-2c12132f04e0'
		};
		expect(parseRichMessageRow({ ...rich, kind: 'video', media_name: 'olá.mp4' })).toMatchObject({
			kind: 'video',
			conversationId,
			mediaName: 'olá.mp4'
		});
		expect(parseRichMessageRow({ ...rich, kind: 'file', media_name: 'carta.pdf' })).toMatchObject({
			kind: 'file',
			mediaName: 'carta.pdf'
		});
		expect(parseRichMessageRow({ ...rich, kind: 'call', body: '{}' })).toBeNull();
	});

	it('suppresses only alerts from conversations muted by this account', () => {
		const now = Date.UTC(2026, 6, 15, 12);
		const mutedId = 'a346c38c-646a-454e-b073-af7d17769c3b';
		const expiredId = '9e669f51-bbb1-45bb-a30e-66df0cb15bb2';
		const foreverId = 'e2b68bf9-633c-43c4-bce1-bef110655700';
		const muted = mutedConversationIdsFromInbox(
			[
				{ conversation_id: mutedId, muted_until: new Date(now + 60_000).toISOString() },
				{ conversation_id: expiredId, muted_until: new Date(now - 1).toISOString() },
				{ conversation_id: foreverId, muted_until: 'infinity' },
				{ conversation_id: 'broken', muted_until: null }
			],
			now
		);
		expect([...muted]).toEqual([mutedId, foreverId]);

		const incoming = {
			id: base.id,
			conversationId: mutedId,
			sender: 'account-2',
			kind: 'text' as const,
			body: 'olá',
			mediaName: null,
			createdAt: base.created_at
		};
		expect(shouldPresentForegroundMessage(incoming, 'account-1', muted)).toBe(false);
		expect(
			shouldPresentForegroundMessage({ ...incoming, conversationId: expiredId }, 'account-1', muted)
		).toBe(true);
		expect(shouldPresentForegroundMessage(incoming, 'account-1', null)).toBe(true);
		expect(shouldPresentForegroundMessage({ ...incoming, sender: 'account-1' }, 'account-1', muted)).toBe(false);
	});
});
