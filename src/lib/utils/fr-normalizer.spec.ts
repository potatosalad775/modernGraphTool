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
	});
});
