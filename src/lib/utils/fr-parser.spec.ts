import { describe, it, expect } from 'vitest';
import FRParser from './fr-parser.js';

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
});
