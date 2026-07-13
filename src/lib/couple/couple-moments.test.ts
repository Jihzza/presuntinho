import { describe, expect, it } from 'vitest';
import { BoundedIdDeduper, parseCoupleMoment } from './couple-moments';

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

describe('parseCoupleMoment', () => {
	it('normalises service-worker payloads without trusting invalid kinds', () => {
		expect(parseCoupleMoment({ id: 'row-1', kind: 'message', createdAt: '2026-07-13T20:00:00Z' }, 'push')).toMatchObject({
		id: 'row-1',
		kind: 'message',
		source: 'push'
	});
		expect(parseCoupleMoment({ id: 'row-2', kind: 'unknown' }, 'push')).toBeNull();
	});
});
