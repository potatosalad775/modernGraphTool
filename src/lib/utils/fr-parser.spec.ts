import { describe, it, expect } from 'vitest';
import FRParser from './fr-parser.js';
import type { ChannelData, FRDataPoint, SampleData } from '$lib/types/data-types.js';

/** Helper: create ChannelData with a given base dB and point count */
function makeChannelData(baseDb: number, count = 480): ChannelData {
	const step = Math.pow(2, 1 / 48);
	let freq = 20;
	const data: FRDataPoint[] = [];
	for (let i = 0; i < count; i++) {
		data.push([freq, baseDb + Math.sin(i * 0.1) * 3]);
		freq *= step;
	}
	return { data, metadata: { minFreq: 20, maxFreq: freq } };
}

describe('FRParser', () => {
	describe('parseFRData', () => {
		it('parses tab-separated frequency/dB data', async () => {
			const raw = '100\t80\n1000\t85\n10000\t75';
			const result = await FRParser.parseFRData(raw);
			expect(result.data.length).toBeGreaterThan(0);
			// All points should be interpolated to standard 1/48-octave frequencies
			expect(result.metadata.minFreq).toBe(20);
		});

		it('parses space-separated data', async () => {
			const raw = '100 80\n1000 85\n10000 75';
			const result = await FRParser.parseFRData(raw);
			expect(result.data.length).toBeGreaterThan(0);
		});

		it('parses comma-separated data', async () => {
			const raw = '100,80\n1000,85\n10000,75';
			const result = await FRParser.parseFRData(raw);
			expect(result.data.length).toBeGreaterThan(0);
		});

		it('skips comment lines starting with #', async () => {
			const raw = '# This is a comment\n100\t80\n1000\t85\n10000\t75';
			const result = await FRParser.parseFRData(raw);
			expect(result.data.length).toBeGreaterThan(0);
		});

		it('skips non-numeric header lines', async () => {
			const raw = 'Frequency\tSPL\n100\t80\n1000\t85\n10000\t75';
			const result = await FRParser.parseFRData(raw);
			expect(result.data.length).toBeGreaterThan(0);
		});

		it('handles empty input gracefully', async () => {
			const raw = '';
			const result = await FRParser.parseFRData(raw);
			expect(result.data.length).toBe(0);
		});

		it('handles data with weight column', async () => {
			const raw = '100\t80\t1.0\n1000\t85\t0.8\n10000\t75\t0.5';
			const result = await FRParser.parseFRData(raw);
			expect(result.data.length).toBeGreaterThan(0);
			expect(result.metadata.weights!.length).toBeGreaterThan(0);
		});

		it('filters out data points outside valid range', async () => {
			// frequency < 20 and > 20000 should be filtered
			const raw = '5\t80\n100\t80\n1000\t85\n25000\t70';
			const result = await FRParser.parseFRData(raw);
			// Only points within 20-20000 Hz are kept, then interpolated
			expect(result.data.length).toBeGreaterThan(0);
			expect(result.data[0][0]).toBeGreaterThanOrEqual(20);
		});

		it('filters out extreme dB values', async () => {
			// dB < -40 and > 120 should be filtered
			const raw = '100\t-50\n1000\t85\n10000\t130';
			const result = await FRParser.parseFRData(raw);
			expect(result.data.length).toBeGreaterThan(0);
		});

		it('interpolates data to standard 1/48 octave frequencies', async () => {
			const raw = '20\t80\n20000\t60';
			const result = await FRParser.parseFRData(raw);
			// Standard frequencies start at 20 Hz with 1/48 octave steps
			expect(result.data[0][0]).toBeCloseTo(20, 0);
			// Should have many interpolated points between 20 and 20000
			expect(result.data.length).toBeGreaterThan(100);
		});

		it('sorts data by frequency', async () => {
			const raw = '10000\t75\n100\t80\n1000\t85';
			const result = await FRParser.parseFRData(raw);
			for (let i = 1; i < result.data.length; i++) {
				expect(result.data[i][0]).toBeGreaterThanOrEqual(result.data[i - 1][0]);
			}
		});
	});

	describe('parseFRData edge cases', () => {
		it('handles Windows-style CRLF line endings', async () => {
			const raw = '100\t80\r\n1000\t85\r\n10000\t75';
			const result = await FRParser.parseFRData(raw);
			expect(result.data.length).toBeGreaterThan(0);
		});

		it('handles extra whitespace padding', async () => {
			const raw = '  100  \t  80  \n  1000  \t  85  \n  10000  \t  75  ';
			const result = await FRParser.parseFRData(raw);
			expect(result.data.length).toBeGreaterThan(0);
		});

		it('handles mixed valid and invalid lines', async () => {
			const raw = '100\t80\n---invalid---\n1000\t85\nXYZ\n10000\t75';
			const result = await FRParser.parseFRData(raw);
			expect(result.data.length).toBeGreaterThan(0);
		});

		it('handles only comment lines gracefully', async () => {
			const raw = '# comment 1\n# comment 2\n# comment 3';
			const result = await FRParser.parseFRData(raw);
			expect(result.data.length).toBe(0);
		});

		it('handles large file (1000+ raw points)', async () => {
			const lines: string[] = [];
			for (let f = 20; f <= 20000; f += 20) {
				lines.push(`${f}\t${80 + Math.sin(f / 1000) * 5}`);
			}
			const raw = lines.join('\n');
			const result = await FRParser.parseFRData(raw);
			expect(result.data.length).toBeGreaterThan(0);
			// Should still interpolate to standard 1/48 octave
			expect(result.data[0][0]).toBeCloseTo(20, 0);
		});
	});

	describe('_parseFrequency', () => {
		it('parses a plain number', () => {
			expect(FRParser._parseFrequency('1000')).toBe(1000);
		});

		it('parses kHz notation', () => {
			expect(FRParser._parseFrequency('1k')).toBe(1000);
			expect(FRParser._parseFrequency('2.5K')).toBe(2500);
		});

		it('parses decimal frequencies', () => {
			expect(FRParser._parseFrequency('20.5')).toBeCloseTo(20.5);
		});
	});

	describe('_isValidDataPoint', () => {
		it('accepts valid data in range', () => {
			expect(FRParser._isValidDataPoint(1000, 80)).toBe(true);
		});

		it('rejects frequency below 20 Hz', () => {
			expect(FRParser._isValidDataPoint(10, 80)).toBe(false);
		});

		it('rejects frequency above 20000 Hz', () => {
			expect(FRParser._isValidDataPoint(25000, 80)).toBe(false);
		});

		it('rejects dB below -40', () => {
			expect(FRParser._isValidDataPoint(1000, -50)).toBe(false);
		});

		it('rejects dB above 120', () => {
			expect(FRParser._isValidDataPoint(1000, 130)).toBe(false);
		});

		it('rejects NaN values', () => {
			expect(FRParser._isValidDataPoint(NaN, 80)).toBe(false);
			expect(FRParser._isValidDataPoint(1000, NaN)).toBe(false);
		});

		it('rejects Infinity', () => {
			expect(FRParser._isValidDataPoint(Infinity, 80)).toBe(false);
		});

		it('accepts boundary values', () => {
			expect(FRParser._isValidDataPoint(20, -40)).toBe(true);
			expect(FRParser._isValidDataPoint(20000, 120)).toBe(true);
		});
	});

	describe('_interpolateToStandard', () => {
		it('interpolates between two points', () => {
			const raw: [number, number][] = [
				[20, 80],
				[20000, 60]
			];
			const result = FRParser._interpolateToStandard(raw);
			expect(result.length).toBeGreaterThan(2);
			// First point should be at 20 Hz
			expect(result[0][0]).toBeCloseTo(20, 0);
			// Intermediate points should be interpolated
			const midPoint = result[Math.floor(result.length / 2)];
			expect(midPoint[1]).toBeGreaterThan(60);
			expect(midPoint[1]).toBeLessThan(80);
		});

		it('extrapolates before first data point', () => {
			const raw: [number, number][] = [
				[100, 80],
				[20000, 60]
			];
			const result = FRParser._interpolateToStandard(raw);
			// Points before 100 Hz should use the first value
			expect(result[0][1]).toBe(80);
		});

		it('extrapolates after last data point', () => {
			const raw: [number, number][] = [
				[20, 80],
				[10000, 60]
			];
			const result = FRParser._interpolateToStandard(raw);
			// Points after 10000 Hz should use the last value
			const lastPoint = result[result.length - 1];
			expect(lastPoint[1]).toBe(60);
		});
	});

	// ── Multi-sample averaging ──────────────────────────────────────────────

	describe('_averageChannelData', () => {
		it('returns same data for a single channel', () => {
			const ch = makeChannelData(80, 10);
			const result = FRParser._averageChannelData([ch]);
			expect(result.data.length).toBe(10);
			for (let i = 0; i < 10; i++) {
				expect(result.data[i][1]).toBeCloseTo(ch.data[i][1], 10);
			}
		});

		it('averages two channels point-by-point', () => {
			const ch1 = makeChannelData(80, 10);
			const ch2 = makeChannelData(90, 10);
			const result = FRParser._averageChannelData([ch1, ch2]);
			expect(result.data.length).toBe(10);
			for (let i = 0; i < 10; i++) {
				const expected = (ch1.data[i][1] + ch2.data[i][1]) / 2;
				expect(result.data[i][1]).toBeCloseTo(expected, 10);
			}
		});

		it('averages three channels correctly', () => {
			const ch1 = makeChannelData(70, 5);
			const ch2 = makeChannelData(80, 5);
			const ch3 = makeChannelData(90, 5);
			const result = FRParser._averageChannelData([ch1, ch2, ch3]);
			expect(result.data.length).toBe(5);
			for (let i = 0; i < 5; i++) {
				const expected = (ch1.data[i][1] + ch2.data[i][1] + ch3.data[i][1]) / 3;
				expect(result.data[i][1]).toBeCloseTo(expected, 10);
			}
		});

		it('preserves frequency values from the first channel', () => {
			const ch1 = makeChannelData(80, 5);
			const ch2 = makeChannelData(90, 5);
			const result = FRParser._averageChannelData([ch1, ch2]);
			for (let i = 0; i < 5; i++) {
				expect(result.data[i][0]).toBe(ch1.data[i][0]);
			}
		});

		it('preserves metadata from the first channel', () => {
			const ch1 = makeChannelData(80, 5);
			ch1.metadata.minFreq = 20;
			ch1.metadata.maxFreq = 20000;
			const ch2 = makeChannelData(90, 5);
			const result = FRParser._averageChannelData([ch1, ch2]);
			expect(result.metadata.minFreq).toBe(20);
			expect(result.metadata.maxFreq).toBe(20000);
		});
	});

	describe('getFRSampleData', () => {
		it('handles empty sample array', async () => {
			const result = await FRParser.getFRSampleData([]);
			expect(result.samples).toEqual([]);
			expect(result.averaged.L).toBeUndefined();
			expect(result.averaged.R).toBeUndefined();
			expect(result.averaged.AVG).toBeUndefined();
		});

		it('produces empty samples when all files fail to load', async () => {
			// Non-existent files will fail fetch and return null
			const result = await FRParser.getFRSampleData([
				{ L: 'nonexistent_L1.txt', R: 'nonexistent_R1.txt' },
				{ L: 'nonexistent_L2.txt', R: 'nonexistent_R2.txt' }
			]);
			// Samples should exist but be empty objects
			expect(result.samples.length).toBe(2);
			expect(result.samples[0].L).toBeUndefined();
			expect(result.samples[0].R).toBeUndefined();
			// Averaged channels should be empty
			expect(result.averaged.L).toBeUndefined();
			expect(result.averaged.R).toBeUndefined();
			expect(result.averaged.AVG).toBeUndefined();
		});
	});

	// ── HpTF sample averaging ───────────────────────────────────────────────

	describe('_averageSampleData', () => {
		it('averages L channels across samples', () => {
			const s1 = { label: 'Sample A', L: makeChannelData(80, 10) };
			const s2 = { label: 'Sample B', L: makeChannelData(90, 10) };
			const result = FRParser._averageSampleData([s1, s2]);
			expect(result.L).toBeDefined();
			for (let i = 0; i < 10; i++) {
				const expected = (s1.L!.data[i][1] + s2.L!.data[i][1]) / 2;
				expect(result.L!.data[i][1]).toBeCloseTo(expected, 10);
			}
		});

		it('computes AVG from averaged L and R', () => {
			const s1 = { label: 'A', L: makeChannelData(80, 5), R: makeChannelData(78, 5) };
			const s2 = { label: 'B', L: makeChannelData(90, 5), R: makeChannelData(88, 5) };
			const result = FRParser._averageSampleData([s1, s2]);
			expect(result.AVG).toBeDefined();
			for (let i = 0; i < 5; i++) {
				const avgL = (s1.L!.data[i][1] + s2.L!.data[i][1]) / 2;
				const avgR = (s1.R!.data[i][1] + s2.R!.data[i][1]) / 2;
				expect(result.AVG!.data[i][1]).toBeCloseTo((avgL + avgR) / 2, 10);
			}
		});

		it('handles samples with only L channel', () => {
			const s1 = { label: 'A', L: makeChannelData(80, 5) };
			const s2 = { label: 'B', L: makeChannelData(90, 5) };
			const result = FRParser._averageSampleData([s1, s2]);
			expect(result.L).toBeDefined();
			expect(result.R).toBeUndefined();
			expect(result.AVG).toBeUndefined();
		});
	});

	describe('getFRHpTFData', () => {
		it('handles non-existent sample files gracefully', async () => {
			const result = await FRParser.getFRHpTFData(
				[
					{ L: 'nonexistent_sample1_L.txt', R: 'nonexistent_sample1_R.txt' },
					{ L: 'nonexistent_sample2_L.txt', R: 'nonexistent_sample2_R.txt' }
				],
				['Sample A', 'Sample B']
			);
			expect(result._hptfSamples.length).toBe(2);
			expect(result._hptfSamples[0].label).toBe('Sample A');
			expect(result._hptfSamples[1].label).toBe('Sample B');
			expect(result._hptfSamples[0].L).toBeUndefined();
			expect(result._hptfLabels).toEqual(['Sample A', 'Sample B']);
		});
	});
});
