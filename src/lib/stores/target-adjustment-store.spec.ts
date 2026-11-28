import { describe, it, expect, vi } from 'vitest';
import {
	filterGainRange,
	formatFilterGain,
	type TargetFilterDef
} from './target-adjustment-store.svelte.js';

const pk: TargetFilterDef = { id: 'ear', name: 'Ear', type: 'PK', freq: 2750, q: 1 };
const tilt: TargetFilterDef = { id: 'tilt', name: 'Tilt', type: 'TILT', freq: 0, q: 0 };

/** The range, and what `filterGainRange` reported on the way. */
function resolve(def: TargetFilterDef) {
	const report = vi.fn<(problem: string) => void>();
	return { range: filterGainRange(def, report), problems: report.mock.calls.length };
}

describe('filterGainRange', () => {
	it('keeps the shipped ranges for a filter that sets none', () => {
		expect(resolve(pk)).toEqual({ range: { min: -20, max: 20, step: 0.5 }, problems: 0 });
		expect(resolve(tilt)).toEqual({ range: { min: -2, max: 2, step: 0.1 }, problems: 0 });
	});

	it('takes the limits and step a filter sets', () => {
		expect(resolve({ ...pk, min: -3, max: 3, step: 0.1 })).toEqual({
			range: { min: -3, max: 3, step: 0.1 },
			problems: 0
		});
	});

	it('fills a key left out from the default', () => {
		expect(resolve({ ...pk, max: 0 }).range).toEqual({ min: -20, max: 0, step: 0.5 });
		expect(resolve({ ...pk, min: 0, max: 6 }).range).toEqual({ min: 0, max: 6, step: 0.5 });
	});

	it('picks a finer step, unprompted, when the default does not fit the limits', () => {
		expect(resolve({ ...pk, min: -0.3, max: 0.3 })).toEqual({
			range: { min: -0.3, max: 0.3, step: 0.1 },
			problems: 0
		});
		expect(resolve({ ...pk, min: -1.25, max: 1.25 }).range.step).toBe(0.01);
	});

	describe('a range that would leave 0 outside', () => {
		it('drops a min above 0 and keeps the max', () => {
			expect(resolve({ ...pk, min: 1, max: 6 })).toEqual({
				range: { min: -20, max: 6, step: 0.5 },
				problems: 1
			});
		});

		it('drops a max below 0 and keeps the min', () => {
			expect(resolve({ ...tilt, min: -1, max: -3 })).toEqual({
				range: { min: -1, max: 2, step: 0.1 },
				problems: 1
			});
		});

		it('drops limits that are both 0', () => {
			expect(resolve({ ...pk, min: 0, max: 0 })).toEqual({
				range: { min: -20, max: 20, step: 0.5 },
				problems: 1
			});
		});

		it('drops a limit that is no finite number', () => {
			expect(resolve({ ...pk, min: '-3' as never, max: NaN })).toEqual({
				range: { min: -20, max: 20, step: 0.5 },
				problems: 2
			});
		});
	});

	describe('a step the slider could not use', () => {
		it.each([
			['zero', { min: -3, max: 3, step: 0 }, 0.5],
			['wider than the range', { min: -3, max: 3, step: 10 }, 0.5],
			['one that skips 0', { min: -2.5, max: 2.5, step: 1 }, 0.5],
			['one that skips 0 and the max', { min: -3, max: 3, step: 0.4 }, 0.5],
			['one that never lands on the max', { min: 0, max: 2, step: 0.3 }, 0.5],
			['finer than 0.001', { min: -1, max: 1, step: 0.0005 }, 0.5]
		])('replaces %s', (_name, keys, step) => {
			expect(resolve({ ...pk, ...keys })).toEqual({
				range: { min: keys.min, max: keys.max, step },
				problems: 1
			});
		});

		it('always leaves 0 and both limits on the grid', () => {
			for (const keys of [
				{ min: -2.5, max: 2.5, step: 1 },
				{ min: -0.3, max: 0.6, step: 0.4 },
				{ min: -1.25, max: 0.75, step: 2 }
			]) {
				const { min, max, step } = filterGainRange({ ...pk, ...keys });
				for (const point of [min, max]) {
					expect(Math.abs(point / step - Math.round(point / step))).toBeLessThan(1e-6);
				}
				expect(step).toBeLessThanOrEqual(max - min);
			}
		});

		it('gives up on limits finer than any step it offers', () => {
			expect(resolve({ ...pk, min: -0.0005, max: 1 })).toEqual({
				range: { min: -20, max: 20, step: 0.5 },
				problems: 1
			});
		});
	});
});

describe('formatFilterGain', () => {
	it('prints one decimal at the shipped steps', () => {
		expect(formatFilterGain(pk, -3.5)).toBe('-3.5');
		expect(formatFilterGain(tilt, 0.3)).toBe('0.3');
		expect(formatFilterGain({ ...pk, step: 1 }, 2)).toBe('2.0');
	});

	it('prints as many decimals as the step needs', () => {
		expect(formatFilterGain({ ...pk, step: 0.01 }, 0.04)).toBe('0.04');
		expect(formatFilterGain({ ...pk, step: 0.25 }, 1.5)).toBe('1.50');
		expect(formatFilterGain({ ...pk, min: -1, max: 1, step: 0.005 }, 0.005)).toBe('0.005');
		expect(formatFilterGain({ ...pk, min: -1, max: 1, step: 0.005 }, 0.01)).toBe('0.010');
	});

	it('prints a value off the grid, as a preset can be, in full', () => {
		expect(formatFilterGain(pk, 6.65)).toBe('6.65');
		expect(formatFilterGain(pk, 0.1 + 0.2)).toBe('0.3');
	});
});
