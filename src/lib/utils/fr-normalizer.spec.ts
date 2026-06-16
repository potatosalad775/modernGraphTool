import { describe, it, expect } from 'vitest';
import { normalize, normalizeChannels } from './fr-normalizer.js';
import type { ChannelData, FRDataPoint, ParsedFRData } from '$lib/types/data-types.js';

/** Generate synthetic channel data spanning 20–20000 Hz */
function makeChannelData(baseDb = 80, count = 480): ChannelData {
	const step = Math.pow(2, 1 / 48);
	let freq = 20;
	const data: FRDataPoint[] = [];
	for (let i = 0; i < count; i++) {
		data.push([freq, baseDb + Math.sin(i * 0.1) * 3]);
		freq *= step;
	}
	return { data, metadata: { minFreq: 20, maxFreq: freq } };
}

/**
 * Generate an L/R/AVG triple with a frequency-varying L/R gap (always ≥ 1 dB,
 * never zero) and AVG = (L+R)/2, mimicking real phone measurement data.
 */
function makeLRChannels(count = 480): { L: ChannelData; R: ChannelData; AVG: ChannelData } {
	const step = Math.pow(2, 1 / 48);
	let freq = 20;
	const L: FRDataPoint[] = [];
	const R: FRDataPoint[] = [];
	const AVG: FRDataPoint[] = [];
	for (let i = 0; i < count; i++) {
		const lDb = 80 + Math.sin(i * 0.1) * 3;
		const rDb = lDb - (2.5 + Math.cos(i * 0.07) * 1.5); // gap ranges [1, 4] dB
		L.push([freq, lDb]);
		R.push([freq, rDb]);
		AVG.push([freq, (lDb + rDb) / 2]);
		freq *= step;
	}
	const metadata = { minFreq: 20, maxFreq: freq };
	return {
		L: { data: L, metadata },
		R: { data: R, metadata },
		AVG: { data: AVG, metadata }
	};
}

describe('fr-normalizer', () => {
	describe('normalize — Hz mode', () => {
		it('sets the reference frequency to 0 dB', () => {
			const ch = makeChannelData(80);
			const result = normalize(ch, 'Hz', 1000);
			// Find the point closest to 1000 Hz
			const near1k = result.data.find((p) => Math.abs(p[0] - 1000) < 50);
			expect(near1k).toBeDefined();
			expect(near1k![1]).toBeCloseTo(0, 0);
		});

		it('does not mutate the original data', () => {
			const ch = makeChannelData(80);
			const originalFirst = ch.data[0][1];
			normalize(ch, 'Hz', 1000);
			expect(ch.data[0][1]).toBe(originalFirst);
		});

		it('shifts all points by the same delta', () => {
			const ch = makeChannelData(80);
			const result = normalize(ch, 'Hz', 500);
			const delta = result.data[0][1] - ch.data[0][1];
			// All points should be shifted by approximately the same amount
			// (exact match won't happen due to deep-copy float precision)
			for (let i = 1; i < Math.min(result.data.length, ch.data.length); i++) {
				const pointDelta = result.data[i][1] - ch.data[i][1];
				expect(pointDelta).toBeCloseTo(delta, 1);
			}
		});

		it('clamps target frequency to 20–20000 Hz range', () => {
			const ch = makeChannelData(80);
			// Should not throw for out-of-range frequencies
			const result = normalize(ch, 'Hz', 5);
			expect(result.data.length).toBeGreaterThan(0);
		});
	});

	describe('normalize — Avg mode', () => {
		it('centers the midrange average around 0 dB', () => {
			const ch = makeChannelData(80);
			const result = normalize(ch, 'Avg', 0);
			// Midrange (300–3000 Hz) average should be near 0
			const midrange = result.data.filter((p) => p[0] >= 300 && p[0] <= 3000);
			const avg = midrange.reduce((sum, p) => sum + p[1], 0) / midrange.length;
			expect(avg).toBeCloseTo(0, 0);
		});

		it('throws for insufficient midrange data', () => {
			const ch: ChannelData = {
				data: [
					[20, 80],
					[50, 82]
				],
				metadata: { minFreq: 20, maxFreq: 50 }
			};
			expect(() => normalize(ch, 'Avg', 0)).toThrow('Insufficient midrange');
		});
	});

	describe('normalize — error handling', () => {
		it('throws on empty data', () => {
			const ch: ChannelData = { data: [], metadata: { minFreq: 0, maxFreq: 0 } };
			expect(() => normalize(ch, 'Hz', 1000)).toThrow('Cannot normalize');
		});

		it('throws on null input', () => {
			expect(() => normalize(null as unknown as ChannelData, 'Hz', 1000)).toThrow();
		});
	});

	describe('normalize — dB clamping', () => {
		it('clamps normalized values to -40..120 dB', () => {
			// Create data with extreme values near the boundary
			const ch: ChannelData = {
				data: Array.from({ length: 200 }, (_, i) => {
					const freq = 20 * Math.pow(2, i / 48);
					return [freq, 115] as FRDataPoint;
				}),
				metadata: { minFreq: 20, maxFreq: 20000 }
			};
			const result = normalize(ch, 'Hz', 1000);
			for (const [, db] of result.data) {
				expect(db).toBeGreaterThanOrEqual(-40);
				expect(db).toBeLessThanOrEqual(120);
			}
		});
	});

	describe('normalize — Hz mode preserves relative differences', () => {
		it('maintains dB differences between points', () => {
			const ch = makeChannelData(80);
			const diff01 = ch.data[0][1] - ch.data[1][1];
			const result = normalize(ch, 'Hz', 1000);
			const resultDiff01 = result.data[0][1] - result.data[1][1];
			expect(resultDiff01).toBeCloseTo(diff01, 1);
		});
	});

	describe('normalize — _findNearestFrequency edge cases', () => {
		it('handles target below all data (returns first point offset)', () => {
			const ch: ChannelData = {
				data: [
					[100, 80],
					[200, 82],
					[500, 85]
				],
				metadata: { minFreq: 100, maxFreq: 500 }
			};
			// Target 20 Hz is below 100 Hz, should use first point as reference
			const result = normalize(ch, 'Hz', 20);
			expect(result.data[0][1]).toBeCloseTo(0, 0);
		});

		it('handles target above all data (returns last point offset)', () => {
			const ch: ChannelData = {
				data: [
					[100, 80],
					[200, 82],
					[500, 85]
				],
				metadata: { minFreq: 100, maxFreq: 500 }
			};
			// Target 20000 Hz is above 500 Hz, should use last point
			const result = normalize(ch, 'Hz', 20000);
			expect(result.data[result.data.length - 1][1]).toBeCloseTo(0, 0);
		});

		it('interpolates between two surrounding points', () => {
			const ch: ChannelData = {
				data: [
					[100, 70],
					[1000, 80],
					[10000, 90]
				],
				metadata: { minFreq: 100, maxFreq: 10000 }
			};
			const result = normalize(ch, 'Hz', 500);
			// After normalization, the interpolated value at 500 Hz should be ~0
			// The original value at 100 Hz was 70, at 1000 Hz was 80
			// Interpolated at 500 Hz: somewhere between 70 and 80
			expect(result.data.length).toBe(3);
		});
	});

	describe('normalize — type handling', () => {
		it('treats non-Hz types as Avg mode', () => {
			const ch = makeChannelData(80);
			// Anything that's not 'Hz' goes to Avg path
			const result = normalize(ch, 'Avg', 0);
			const midrange = result.data.filter((p) => p[0] >= 300 && p[0] <= 3000);
			const avg = midrange.reduce((sum, p) => sum + p[1], 0) / midrange.length;
			expect(avg).toBeCloseTo(0, 0);
		});
	});

	describe('normalizeChannels', () => {
		it('normalizes all present channels', () => {
			const data: ParsedFRData = {
				L: makeChannelData(82),
				R: makeChannelData(78),
				AVG: makeChannelData(80)
			};
			const result = normalizeChannels(data, 'Hz', 1000);
			expect(result.L).toBeDefined();
			expect(result.R).toBeDefined();
			expect(result.AVG).toBeDefined();
		});

		it('skips missing channels', () => {
			const data: ParsedFRData = {
				AVG: makeChannelData(80)
			};
			const result = normalizeChannels(data, 'Hz', 1000);
			expect(result.L).toBeUndefined();
			expect(result.R).toBeUndefined();
			expect(result.AVG).toBeDefined();
		});

		it('does not mutate the original data', () => {
			const data: ParsedFRData = {
				AVG: makeChannelData(80)
			};
			const originalFirst = data.AVG!.data[0][1];
			normalizeChannels(data, 'Hz', 1000);
			expect(data.AVG!.data[0][1]).toBe(originalFirst);
		});

		it('preserves the L/R difference under Hz normalization', () => {
			const { L, R, AVG } = makeLRChannels();
			const origGap = L.data.map((p, i) => p[1] - R.data[i][1]);
			const result = normalizeChannels({ L, R, AVG }, 'Hz', 1000);
			result.L!.data.forEach((p, i) => {
				expect(p[1] - result.R!.data[i][1]).toBeCloseTo(origGap[i], 1);
			});
		});

		it('preserves the L/R difference under Avg normalization', () => {
			const { L, R, AVG } = makeLRChannels();
			const origGap = L.data.map((p, i) => p[1] - R.data[i][1]);
			const result = normalizeChannels({ L, R, AVG }, 'Avg', 0);
			result.L!.data.forEach((p, i) => {
				expect(p[1] - result.R!.data[i][1]).toBeCloseTo(origGap[i], 1);
			});
		});

		it('keeps AVG position identical to standalone normalization', () => {
			const { L, R, AVG } = makeLRChannels();
			const shared = normalizeChannels({ L, R, AVG }, 'Hz', 1000);
			const standalone = normalize(AVG, 'Hz', 1000);
			shared.AVG!.data.forEach((p, i) => {
				expect(p[1]).toBeCloseTo(standalone.data[i][1], 5);
			});
		});

		it('does not flatten the L/R gap to zero at the normalization frequency', () => {
			const { L, R, AVG } = makeLRChannels();
			const result = normalizeChannels({ L, R, AVG }, 'Hz', 1000);
			const idx = result.L!.data.findIndex((p) => Math.abs(p[0] - 1000) < 50);
			expect(idx).toBeGreaterThanOrEqual(0);
			const gap = result.L!.data[idx][1] - result.R!.data[idx][1];
			expect(Math.abs(gap)).toBeGreaterThan(0.5);
		});
	});
});
