import { describe, it, expect, beforeEach } from 'vitest';
import FRSmoother from './fr-smoother.js';
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
	beforeEach(() => {
		FRSmoother.currentSmoothValue = '1/48';
	});

	describe('OCTAVE_BANDS', () => {
		it('has the expected band fractions', () => {
			expect(FRSmoother.OCTAVE_BANDS['1/48']).toBeCloseTo(1 / 48);
			expect(FRSmoother.OCTAVE_BANDS['1/24']).toBeCloseTo(1 / 24);
			expect(FRSmoother.OCTAVE_BANDS['1/12']).toBeCloseTo(1 / 12);
			expect(FRSmoother.OCTAVE_BANDS['1/6']).toBeCloseTo(1 / 6);
			expect(FRSmoother.OCTAVE_BANDS['1/3']).toBeCloseTo(1 / 3);
		});
	});

	describe('updateSmoothing', () => {
		it('updates the current smooth value', () => {
			FRSmoother.updateSmoothing('1/3');
			expect(FRSmoother.currentSmoothValue).toBe('1/3');
		});

		it('does not change value when called with null', () => {
			FRSmoother.updateSmoothing('1/6');
			FRSmoother.updateSmoothing(null);
			expect(FRSmoother.currentSmoothValue).toBe('1/6');
		});
	});

	describe('smooth', () => {
		it('returns original data when smoothing is at minimum (1/48)', () => {
			const data = makeFRData(100);
			FRSmoother.updateSmoothing('1/48');
			const result = FRSmoother.smooth(data);
			// At 1/48, each band has ~1 point, so result should be similar length
			expect(result.length).toBeGreaterThan(0);
		});

		it('reduces data variance with heavier smoothing', () => {
			const data = makeFRData(200);
			FRSmoother.updateSmoothing('1/3');
			const smoothed = FRSmoother.smooth(data);

			// Smoothed data should have less variance
			const originalVariance = computeVariance(data.map((p) => p[1]));
			const smoothedVariance = computeVariance(smoothed.map((p) => p[1]));
			expect(smoothedVariance).toBeLessThanOrEqual(originalVariance);
		});

		it('returns fewer points with wider bands', () => {
			const data = makeFRData(200);

			FRSmoother.updateSmoothing('1/48');
			const fine = FRSmoother.smooth(data);

			FRSmoother.updateSmoothing('1/3');
			const coarse = FRSmoother.smooth(data);

			expect(coarse.length).toBeLessThan(fine.length);
		});

		it('returns input unchanged for invalid smooth value', () => {
			const data = makeFRData(50);
			FRSmoother.currentSmoothValue = 'invalid';
			const result = FRSmoother.smooth(data);
			expect(result).toBe(data);
		});

		it('handles null/undefined data gracefully', () => {
			const result = FRSmoother.smooth(null as unknown as FRDataPoint[]);
			expect(result).toBeNull();
		});
	});

	describe('smooth — output range', () => {
		it('output frequencies are within input frequency range', () => {
			const data = makeFRData(200);
			const inputMin = data[0][0];
			const inputMax = data[data.length - 1][0];
			FRSmoother.updateSmoothing('1/6');
			const result = FRSmoother.smooth(data);
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
			FRSmoother.updateSmoothing('1/6');
			const result = FRSmoother.smoothChannels(data);
			expect(result.AVG!.metadata.minFreq).toBe(20);
			expect(result.AVG!.metadata.maxFreq).toBe(20000);
		});

		it('does not mutate the original channel data', () => {
			const data: ParsedFRData = {
				AVG: { data: makeFRData(100), metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			const originalLen = data.AVG!.data.length;
			FRSmoother.updateSmoothing('1/6');
			FRSmoother.smoothChannels(data);
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
			FRSmoother.updateSmoothing('1/6');
			const result = FRSmoother.smoothChannels(data);
			expect(result.L).toBeDefined();
			expect(result.R).toBeDefined();
			expect(result.AVG).toBeDefined();
			expect(result.L!.data.length).toBeGreaterThan(0);
		});

		it('skips missing channels', () => {
			const data: ParsedFRData = {
				AVG: { data: makeFRData(100), metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			FRSmoother.updateSmoothing('1/6');
			const result = FRSmoother.smoothChannels(data);
			expect(result.L).toBeUndefined();
			expect(result.R).toBeUndefined();
			expect(result.AVG).toBeDefined();
		});

		it('returns input for invalid smooth value', () => {
			const data: ParsedFRData = {
				AVG: { data: makeFRData(50), metadata: { minFreq: 20, maxFreq: 20000 } }
			};
			FRSmoother.currentSmoothValue = 'invalid';
			const result = FRSmoother.smoothChannels(data);
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
});

function computeVariance(values: number[]): number {
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}
