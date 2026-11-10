import { describe, it, expect } from 'vitest';
import { CHANNELS } from '#lib/types/data-types.js';
import { parseSampleKey, sampleKey } from './sample-key.js';

describe('sampleKey', () => {
	it('builds the zero-based sample{n}_{ch} shape', () => {
		expect(sampleKey(0, 'L')).toBe('sample0_L');
		expect(sampleKey(1, 'R')).toBe('sample1_R');
		expect(sampleKey(12, 'AVG')).toBe('sample12_AVG');
	});
});

describe('parseSampleKey', () => {
	it('round-trips every channel at index 0 and at a multi-digit index', () => {
		for (const channel of CHANNELS) {
			for (const index of [0, 7, 123]) {
				expect(parseSampleKey(sampleKey(index, channel))).toEqual({ index, channel });
			}
		}
	});

	it('returns null for anything that is not exactly a sample key', () => {
		for (const bad of ['L1', 'garbage', 'sample0_X', 'sample-1_L', 'sample1.5_L', '']) {
			expect(parseSampleKey(bad)).toBeNull();
		}
	});

	it('rejects keys with surrounding text', () => {
		expect(parseSampleKey(' sample0_L')).toBeNull();
		expect(parseSampleKey('sample0_L ')).toBeNull();
		expect(parseSampleKey('sample0_Lx')).toBeNull();
		expect(parseSampleKey('sample_L')).toBeNull();
	});
});
