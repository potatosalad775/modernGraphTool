import { describe, it, expect } from 'vitest';
import { derivePreamp } from './eq-preamp.js';
import type { EQFilter } from './equalizer.js';

function makeFilter(overrides: Partial<EQFilter> = {}): EQFilter {
	return { enabled: true, type: 'PK', freq: 1000, q: 1.0, gain: 0, ...overrides };
}

describe('derivePreamp', () => {
	it('is zero for an empty or all-disabled list', () => {
		expect(derivePreamp([])).toBe(0);
		expect(derivePreamp([makeFilter({ gain: 6, enabled: false })])).toBe(0);
	});

	it('is minus the largest boost', () => {
		expect(derivePreamp([makeFilter({ gain: 6 })])).toBe(-6);
	});

	// 2070 Hz sits halfway between two points of the old 100-point grid, which
	// read this +6 dB, Q 6 peak as about +5.1 dB and let it clip.
	it('covers the full peak of a narrow boost that falls between grid points', () => {
		expect(derivePreamp([makeFilter({ freq: 2070, q: 6, gain: 6 })])).toBe(-6);
	});

	it('sizes for the ear that needs the most headroom', () => {
		const shared = makeFilter({ gain: 3 });
		const rightOnly = makeFilter({ freq: 4000, gain: 5, channel: 'R' });
		const rightEar = derivePreamp([shared, { ...rightOnly, channel: undefined }]);

		expect(derivePreamp([shared, rightOnly])).toBe(rightEar);
		expect(rightEar).toBeLessThan(derivePreamp([shared]));
	});
});
