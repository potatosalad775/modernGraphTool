import { describe, it, expect } from 'vitest';
import { limitsSummaryOf } from './eq-domain-hint.js';
import { parametricPreset } from './__fixtures__/eq-profiles.js';

describe('limitsSummaryOf', () => {
	it('spells out the sign of a boost', () => {
		const { profile } = parametricPreset('p', { maxBands: 10, gain: { min: -12, max: 12 } });
		expect(limitsSummaryOf(profile)).toBe('10 bands · -12 to +12 dB');
	});

	it('leaves a ceiling at or below zero unsigned', () => {
		const { profile } = parametricPreset('p', { maxBands: 5, gain: { min: -12, max: 0 } });
		expect(limitsSummaryOf(profile)).toBe('5 bands · -12 to 0 dB');
	});

	it('shows an unbounded band count as ∞', () => {
		const { profile } = parametricPreset('p', { gain: { min: -6, max: 6 } });
		expect(limitsSummaryOf(profile)).toBe('∞ bands · -6 to +6 dB');
	});

	it('shows just the bands when gain has no finite range', () => {
		const { profile } = parametricPreset('p', {
			maxBands: 8,
			gain: { min: -Infinity, max: Infinity }
		});
		expect(limitsSummaryOf(profile)).toBe('8 bands');
	});
});
