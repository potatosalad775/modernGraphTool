import { describe, it, expect } from 'vitest';
import type { EQFilter } from './equalizer.js';
import { compareGhostSide, filtersMatch, snapshotMatches } from './eq-snapshot.js';

const pk = (gain: number, o: Partial<EQFilter> = {}): EQFilter => ({
	enabled: true,
	type: 'PK',
	freq: 1000,
	q: 1,
	gain,
	...o
});

describe('filtersMatch / snapshotMatches', () => {
	it('ignores the stored preamp, where snapshotMatches does not', () => {
		const snap = { filters: [pk(3)], preamp: -3 };
		expect(filtersMatch(snap, [pk(3)])).toBe(true);
		expect(snapshotMatches(snap, [pk(3)], -1)).toBe(false);
		expect(snapshotMatches(snap, [pk(3)], -3)).toBe(true);
	});

	it('treats a band moved to one ear as different', () => {
		expect(filtersMatch({ filters: [pk(3)], preamp: 0 }, [pk(3, { channel: 'L' })])).toBe(false);
	});
});

describe('compareGhostSide', () => {
	const a = { filters: [pk(3)], preamp: -3 };
	const b = { filters: [pk(-2)], preamp: 0 };

	it('ghosts the side that is not live', () => {
		expect(compareGhostSide(a, b, [pk(3)])).toBe('B');
		expect(compareGhostSide(a, b, [pk(-2)])).toBe('A');
	});

	it('is null once the live filters match neither side, or a side is unset', () => {
		expect(compareGhostSide(a, b, [pk(1)])).toBeNull();
		expect(compareGhostSide(a, null, [pk(3)])).toBeNull();
	});
});
