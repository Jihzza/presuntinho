import { describe, expect, it } from 'vitest';
import {
	BoundedIdDeduper,
	claimCoupleMomentAcrossTabs,
	parseCoupleMoment
} from './couple-moments';

describe('BoundedIdDeduper', () => {
	it('accepts different moments close together but rejects the same exact id', () => {
		const seen = new BoundedIdDeduper(4);
		expect(seen.accept('love-1')).toBe(true);
		expect(seen.accept('nudge-1')).toBe(true);
		expect(seen.accept('love-1')).toBe(false);
	});

	it('evicts the oldest id when its fixed capacity is exceeded', () => {
		const seen = new BoundedIdDeduper(2);
		expect(seen.accept('a')).toBe(true);
		expect(seen.accept('b')).toBe(true);
		expect(seen.accept('c')).toBe(true);
		expect(seen.size).toBe(2);
		expect(seen.has('a')).toBe(false);
		expect(seen.accept('a')).toBe(true);
	});
});

describe('cross-tab moment claim', () => {
	function memoryStorage() {
		const values = new Map<string, string>();
		return {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value)
		};
	}

	it('lets only one tab claim the same stable id during the delivery window', () => {
		const storage = memoryStorage();
		expect(claimCoupleMomentAcrossTabs('message-1', storage, 10_000)).toBe(true);
		expect(claimCoupleMomentAcrossTabs('message-1', storage, 10_010)).toBe(false);
		expect(claimCoupleMomentAcrossTabs('message-2', storage, 10_020)).toBe(true);
	});

	it('expires old claims and fails open when storage is unavailable', () => {
		const storage = memoryStorage();
		expect(claimCoupleMomentAcrossTabs('love-1', storage, 1)).toBe(true);
		expect(claimCoupleMomentAcrossTabs('love-1', storage, 121_000)).toBe(true);
		expect(
			claimCoupleMomentAcrossTabs('nudge-1', {
				getItem: () => {
					throw new Error('blocked');
				},
				setItem: () => undefined
			})
		).toBe(true);
	});
});

describe('parseCoupleMoment', () => {
	it('normalises service-worker payloads without trusting invalid kinds', () => {
		expect(parseCoupleMoment({ id: 'row-1', kind: 'message', count: 140, createdAt: '2026-07-13T20:00:00Z', silent: true, vibration: false }, 'push')).toMatchObject({
			id: 'row-1',
			kind: 'message',
			count: 99,
			silent: true,
			vibration: false,
			source: 'push'
		});
		expect(parseCoupleMoment({ id: 'row-2', kind: 'unknown' }, 'push')).toBeNull();
	});
});
