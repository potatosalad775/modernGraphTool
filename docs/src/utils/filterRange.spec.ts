import { describe, it, expect } from 'vitest';
import type { FilterForm } from './configDefaults';
import { filterGainLimits, filterRangeProblem, isGainOutsideRange } from './filterRange';

const pk: FilterForm = { id: 'ear', name: 'Ear', type: 'PK', freq: 2750, q: 1 };
const tilt: FilterForm = { id: 'tilt', name: 'Tilt', type: 'TILT', freq: 0, q: 0 };

describe('filterRangeProblem', () => {
	it('accepts a filter with no range, and one the app takes as written', () => {
		expect(filterRangeProblem(pk)).toBeNull();
		expect(filterRangeProblem({ ...pk, min: -3, max: 3, step: 0.1 })).toBeNull();
		expect(filterRangeProblem({ ...pk, min: 0, max: 6 })).toBeNull();
		expect(filterRangeProblem({ ...pk, min: -0.3, max: 0.3 })).toBeNull();
	});

	it.each([
		['a min above 0', { min: 1, max: 6 }],
		['a max below 0', { max: -3 }],
		['limits that are both 0', { min: 0, max: 0 }],
		['a step of 0', { step: 0 }],
		['a step wider than the range', { min: -3, max: 3, step: 10 }],
		['a step that skips 0', { min: -2.5, max: 2.5, step: 1 }],
		['a step that never reaches max', { min: 0, max: 2, step: 0.3 }]
	])('names %s', (_name, keys) => {
		expect(filterRangeProblem({ ...pk, ...keys })).toEqual(expect.any(String));
	});
});

describe('filterGainLimits', () => {
	it('gives the type default for a filter with no range', () => {
		expect(filterGainLimits(pk)).toEqual({ min: -20, max: 20, step: 0.5 });
		expect(filterGainLimits(tilt)).toEqual({ min: -2, max: 2, step: 0.1 });
	});

	it('gives the range the filter sets', () => {
		expect(filterGainLimits({ ...pk, min: -3, max: 3, step: 0.1 })).toEqual({
			min: -3,
			max: 3,
			step: 0.1
		});
	});

	it('leaves the step open where the app would pick one', () => {
		expect(filterGainLimits({ ...pk, min: -0.3, max: 0.3 }).step).toBe('any');
	});

	it('treats a range with a problem as unset', () => {
		expect(filterGainLimits({ ...pk, min: 3, max: -3 })).toEqual({ min: -20, max: 20, step: 0.5 });
	});
});

describe('isGainOutsideRange', () => {
	it('flags a gain beyond the limits only', () => {
		const hrtf = { ...pk, min: -3, max: 3 };
		expect(isGainOutsideRange(hrtf, 6)).toBe(true);
		expect(isGainOutsideRange(hrtf, -3)).toBe(false);
		expect(isGainOutsideRange(hrtf, undefined)).toBe(false);
		expect(isGainOutsideRange(pk, 6)).toBe(false);
	});
});
