import { describe, it, expect } from 'vitest';
import FRSmoother from './fr-smoother.js';
import FRParser from './fr-parser.js';
import type { FRDataPoint, ParsedFRData } from '$lib/types/data-types.js';

/** Generate synthetic FR data for testing */
function makeFRData(count: number, baseDb = 80): FRDataPoint[] {
	const step = Math.pow(2, 1 / 48);
	let freq = 20;
	const data: FRDataPoint[] = [];
	for (let i = 0; i < count; i++) {
		data.push([freq, baseDb + Math.sin(i * 0.3) * 5]);
		freq *= step;
	}
	return data;
}

describe('FRSmoother', () => {
	describe('OCTAVE_BANDS', () => {
		it('has the expected band fractions', () => {
			expect(FRSmoother.OCTAVE_BANDS['1/48']).toBeCloseTo(1 / 48);
			expect(FRSmoother.OCTAVE_BANDS['1/24']).toBeCloseTo(1 / 24);
			expect(FRSmoother.OCTAVE_BANDS['1/12']).toBeCloseTo(1 / 12);
			expect(FRSmoother.OCTAVE_BANDS['1/6']).toBeCloseTo(1 / 6);
			expect(FRSmoother.OCTAVE_BANDS['1/3']).toBeCloseTo(1 / 3);
		});
	});

	describe('smooth', () => {
		it('returns original data when smoothing is at minimum (1/48)', () => {
			const data = makeFRData(100);
			const result = FRSmoother.smooth(data, '1/48');
			// At 1/48, each band has ~1 point, so result should be similar length
			expect(result.length).toBeGreaterThan(0);
		});

		it('reduces data variance with heavier smoothing', () => {
			const data = makeFRData(200);
			const smoothed = FRSmoother.smooth(data, '1/3');

			// Smoothed data should have less variance
			const originalVariance = computeVariance(data.map((p) => p[1]));
			const smoothedVariance = computeVariance(smoothed.map((p) => p[1]));
			expect(smoothedVariance).toBeLessThanOrEqual(originalVariance);
		});

		it('returns fewer points with wider bands', () => {
			const data = makeFRData(200);

			const fine = FRSmoother.smooth(data, '1/48');
			const coarse = FRSmoother.smooth(data, '1/3');

			expect(coarse.length).toBeLessThan(fine.length);
		});

		it('returns input unchanged for invalid smooth value', () => {
			const data = makeFRData(50);
			const result = FRSmoother.smooth(data, 'invalid');
			expect(result).toBe(data);
		});

		it('handles null/undefined data gracefully', () => {
			const result = FRSmoother.smooth(null as unknown as FRDataPoint[], '1/6');
			expect(result).toBeNull();
		});
	});

	describe('smooth — output range', () => {
		it('output frequencies are within input frequency range', () => {
			const data = makeFRData(200);
			const inputMin = data[0][0];
			const inputMax = data[data.length - 1][0];
			const result = FRSmoother.smooth(data, '1/6');
			for (const [freq] of result) {
				expect(freq).toBeGreaterThanOrEqual(inputMin - 1);
				expect(freq).toBeLessThanOrEqual(inputMax + 1);
			}
		});
	});

	describe('smoothChannels — metadata', () => {
		it('preserves channel metadata after smoothing', () => {
			const data: ParsedFRData = {
				AVG: {
					data: makeFRData(100),
					metadata: { minFreq: 20, maxFreq: 20000, weights: [1, 2, 3] }
				}
			};
			const result = FRSmoother.smoothChannels(data, '1/6');
			expect(result.AVG!.metadata.minFreq).toBe(20);
			expect(result.AVG!.metadata.maxFreq).toBe(20000);
		});

		it('does not mutate the original channel data', () => {
			const data: ParsedFRData = {
				AVG: { data: makeFRData(100), metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			const originalLen = data.AVG!.data.length;
			FRSmoother.smoothChannels(data, '1/6');
			expect(data.AVG!.data.length).toBe(originalLen);
		});
	});

	describe('_createOctaveBands — upper range', () => {
		it('reaches at least 20000 Hz', () => {
			const bands = FRSmoother._createOctaveBands('1/3');
			const lastBand = bands[bands.length - 1];
			expect(lastBand.upper).toBeGreaterThanOrEqual(20000);
		});
	});

	describe('smoothChannels', () => {
		it('smooths all available channels', () => {
			const data: ParsedFRData = {
				L: { data: makeFRData(100), metadata: { minFreq: 20, maxFreq: 20000 } },
				R: { data: makeFRData(100), metadata: { minFreq: 20, maxFreq: 20000 } },
				AVG: { data: makeFRData(100), metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			const result = FRSmoother.smoothChannels(data, '1/6');
			expect(result.L).toBeDefined();
			expect(result.R).toBeDefined();
			expect(result.AVG).toBeDefined();
			expect(result.L!.data.length).toBeGreaterThan(0);
		});

		it('skips missing channels', () => {
			const data: ParsedFRData = {
				AVG: { data: makeFRData(100), metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			const result = FRSmoother.smoothChannels(data, '1/6');
			expect(result.L).toBeUndefined();
			expect(result.R).toBeUndefined();
			expect(result.AVG).toBeDefined();
		});

		it('returns input for invalid smooth value', () => {
			const data: ParsedFRData = {
				AVG: { data: makeFRData(50), metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			const result = FRSmoother.smoothChannels(data, 'invalid');
			expect(result).toBe(data);
		});
	});

	describe('_createOctaveBands', () => {
		it('creates contiguous bands from 20 Hz', () => {
			const bands = FRSmoother._createOctaveBands('1/3');
			expect(bands[0].lower).toBeCloseTo(20, 0);
			// Each band's upper should equal the next band's lower
			for (let i = 0; i < bands.length - 1; i++) {
				expect(bands[i].upper).toBeCloseTo(bands[i + 1].lower, 4);
			}
		});

		it('has center frequency as geometric mean', () => {
			const bands = FRSmoother._createOctaveBands('1/3');
			for (const band of bands) {
				expect(band.centerFreq).toBeCloseTo(Math.sqrt(band.lower * band.upper), 2);
			}
		});

		it('creates more bands for finer resolution', () => {
			const fine = FRSmoother._createOctaveBands('1/48');
			const coarse = FRSmoother._createOctaveBands('1/3');
			expect(fine.length).toBeGreaterThan(coarse.length);
		});
	});

	// The single-cursor pass has to reproduce the filter-per-band original exactly,
	// boundary double-counting included — the drawn curves are made of its output.
	describe('_smoothChannel — equivalence with the reference implementation', () => {
		const octaves = Object.keys(FRSmoother.OCTAVE_BANDS);
		const grid: FRDataPoint[] = FRParser._standardFrequencies.map(
			(f, i) => [f, 80 + Math.sin(i * 0.3) * 5] as FRDataPoint
		);

		it.each(octaves)('matches on the 1/48oct parser grid at %s', (octave) => {
			expect(FRSmoother.smooth(grid, octave)).toEqual(referenceSmooth(grid, octave));
		});

		it.each(octaves)('matches on a 1000-point log-spaced raw file at %s', (octave) => {
			const raw = logSpaced(1000, 10, 24000);
			expect(FRSmoother.smooth(raw, octave)).toEqual(referenceSmooth(raw, octave));
		});

		it.each(octaves)('matches with duplicate frequencies at %s', (octave) => {
			const raw = logSpaced(300).flatMap(([f, db]) => [
				[f, db] as FRDataPoint,
				[f, db - 3] as FRDataPoint
			]);
			expect(FRSmoother.smooth(raw, octave)).toEqual(referenceSmooth(raw, octave));
		});

		it.each(octaves)('matches with points exactly on the band edges at %s', (octave) => {
			const raw = FRSmoother._createOctaveBands(octave).map(
				(band, i) => [band.lower, 70 + (i % 5)] as FRDataPoint
			);
			expect(FRSmoother.smooth(raw, octave)).toEqual(referenceSmooth(raw, octave));
		});

		it('skips null holes the way the reference does', () => {
			const holey = grid.map((p, i) => (i % 7 === 0 ? null : p)) as unknown as FRDataPoint[];
			expect(FRSmoother.smooth(holey, '1/12')).toEqual(referenceSmooth(holey, '1/12'));
		});

		it('counts a grid point on a band edge in both adjacent bands', () => {
			const [first] = FRSmoother.smooth(grid, '1/48');
			expect(first[1]).toBe((grid[0][1] + grid[1][1]) / 2);
		});

		// GraphEngine binds stored channels without smoothing them again, which is
		// only correct because a second pass at the same octave changes nothing.
		it.each(octaves)('is idempotent on its own output at %s', (octave) => {
			const once = FRSmoother.smooth(grid, octave);
			expect(FRSmoother.smooth(once, octave)).toEqual(once);
		});
	});
});

function computeVariance(values: number[]): number {
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}

/** The original filter-per-band smoother, kept as the equivalence reference. */
function referenceSmooth(points: FRDataPoint[], octave: string): FRDataPoint[] {
	return FRSmoother._createOctaveBands(octave)
		.map((band) => ({
			...band,
			values: points.filter((p) => p && p[0] >= band.lower && p[0] <= band.upper).map((p) => p[1])
		}))
		.filter((bin) => bin.values.length > 0)
		.map(
			(bin) =>
				[bin.centerFreq, bin.values.reduce((a, b) => a + b, 0) / bin.values.length] as FRDataPoint
		);
}

/** `count` log-spaced points from `from` to `to` Hz, off the 1/48oct grid. */
function logSpaced(count: number, from = 20, to = 20000): FRDataPoint[] {
	return Array.from({ length: count }, (_, i) => {
		const f = from * Math.pow(to / from, i / (count - 1));
		return [f, 75 + Math.sin(i * 0.05) * 8 + Math.cos(i * 1.7)] as FRDataPoint;
	});
}
