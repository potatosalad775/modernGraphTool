import { describe, it, expect } from 'vitest';
import {
	filterGainRange,
	formatGain,
	type TargetFilterDef
} from './target-adjustment-store.svelte.js';

const pk: TargetFilterDef = { id: 'ear', name: 'Ear', type: 'PK', freq: 2750, q: 1 };
const tilt: TargetFilterDef = { id: 'tilt', name: 'Tilt', type: 'TILT', freq: 0, q: 0 };

describe('filterGainRange', () => {
	it('keeps the shipped ranges for a filter that sets none', () => {
		expect(filterGainRange(pk)).toEqual({ min: -20, max: 20, step: 0.5 });
		expect(filterGainRange(tilt)).toEqual({ min: -2, max: 2, step: 0.1 });
	});

	it('takes the limits and step a filter sets', () => {
		expect(filterGainRange({ ...pk, min: -3, max: 3, step: 0.1 })).toEqual({
			min: -3,
			max: 3,
			step: 0.1
		});
	});

	it('fills a key left out from the default', () => {
		expect(filterGainRange({ ...pk, max: 0 })).toEqual({ min: -20, max: 0, step: 0.5 });
	});

	it('falls back to the default for limits that leave no room, and for a bad step', () => {
		expect(filterGainRange({ ...pk, min: 3, max: -3, step: 0 })).toEqual({
			min: -20,
			max: 20,
			step: 0.5
		});
		expect(filterGainRange({ ...pk, min: '3' as never, max: NaN })).toEqual({
			min: -20,
			max: 20,
			step: 0.5
		});
	});
});

describe('formatGain', () => {
	it('prints one decimal at the shipped steps', () => {
		expect(formatGain(pk, -3.5)).toBe('-3.5');
		expect(formatGain(tilt, 0.3)).toBe('0.3');
		expect(formatGain({ ...pk, step: 1 }, 2)).toBe('2.0');
		expect(formatGain({ ...pk, step: 0.3 }, 0.6)).toBe('0.6');
	});

	it('prints two decimals for a step finer than 0.1', () => {
		expect(formatGain({ ...pk, step: 0.01 }, 0.04)).toBe('0.04');
		expect(formatGain({ ...pk, step: 0.25 }, 1.25)).toBe('1.25');
	});
});
