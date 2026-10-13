import { describe, it, expect } from 'vitest';
import type { Profile } from '@potatosalad775/eqcaps-core';
import { derivePreamp, headroomPreamp } from './eq-preamp.js';
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

	it('gives no make-up gain to a cut-only list', () => {
		expect(derivePreamp([makeFilter({ gain: -6 })])).toBe(0);
	});

	it('rounds the peak up, never giving back headroom', () => {
		expect(derivePreamp([makeFilter({ gain: 6.04 })])).toBe(-6.1);
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

describe('headroomPreamp', () => {
	const manual = (gain: (Profile['preamp'] & { mode: 'manual' })['gain']): Profile['preamp'] => ({
		mode: 'manual',
		gain
	});

	it('moves down onto a coarse grid, never up', () => {
		const grid = manual({ min: -12, max: 0, step: 1 });
		expect(headroomPreamp(-6.1, grid, true)).toBe(-7);
		expect(headroomPreamp(-6, grid, true)).toBe(-6);
		expect(headroomPreamp(-0.3, grid, true)).toBe(-1);
	});

	it("stops at the device's range, and picks from a set", () => {
		expect(headroomPreamp(-20, manual({ min: -12, max: 0, step: 0.5 }), true)).toBe(-12);
		expect(headroomPreamp(-4, manual({ values: [-9, -6, -3, 0] }), true)).toBe(-6);
		expect(headroomPreamp(-2.34, manual({ min: -12, max: 0 }), true)).toBe(-2.34);
	});

	it('leaves the value alone where no preamp is written', () => {
		const grid = manual({ min: -12, max: 0, step: 1 });
		expect(headroomPreamp(-6.1, grid, false)).toBe(-6.1);
		expect(headroomPreamp(-6.1, { mode: 'none' }, true)).toBe(-6.1);
		expect(headroomPreamp(-6.1, { mode: 'auto' }, true)).toBe(-6.1);
	});
});
