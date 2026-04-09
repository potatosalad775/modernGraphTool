import { describe, it, expect } from 'vitest';
import { lookupFRValueAtFreq } from './fr-lookup.js';
import type { FRDataPoint } from '$lib/types/data-types.js';

/** Generate linearly-spaced FR data points */
function makePoints(startFreq: number, endFreq: number, count: number, db = 80): FRDataPoint[] {
	const step = (endFreq - startFreq) / (count - 1);
	return Array.from({ length: count }, (_, i): FRDataPoint => [startFreq + step * i, db]);
}

describe('lookupFRValueAtFreq', () => {
	it('returns null for null input', () => {
		expect(lookupFRValueAtFreq(null as unknown as FRDataPoint[], 1000)).toBeNull();
	});

	it('returns null for empty array', () => {
		expect(lookupFRValueAtFreq([], 1000)).toBeNull();
	});

	it('returns first dB for frequency below range', () => {
		const data: FRDataPoint[] = [[20, 60], [100, 70], [1000, 80]];
		expect(lookupFRValueAtFreq(data, 10)).toBe(60);
	});

	it('returns first dB for frequency equal to min', () => {
		const data: FRDataPoint[] = [[20, 60], [100, 70], [1000, 80]];
		expect(lookupFRValueAtFreq(data, 20)).toBe(60);
	});

	it('returns last dB for frequency above range', () => {
		const data: FRDataPoint[] = [[20, 60], [100, 70], [1000, 80]];
		expect(lookupFRValueAtFreq(data, 25000)).toBe(80);
	});

	it('returns last dB for frequency equal to max', () => {
		const data: FRDataPoint[] = [[20, 60], [100, 70], [1000, 80]];
		expect(lookupFRValueAtFreq(data, 1000)).toBe(80);
	});

	it('returns exact dB when frequency matches a data point', () => {
		const data: FRDataPoint[] = [[20, 60], [100, 70], [500, 75], [1000, 80]];
		expect(lookupFRValueAtFreq(data, 100)).toBe(70);
	});

	it('interpolates linearly at midpoint between two points', () => {
		const data: FRDataPoint[] = [[100, 60], [200, 80]];
		expect(lookupFRValueAtFreq(data, 150)).toBeCloseTo(70, 5);
	});

	it('interpolates at 25% position between points', () => {
		const data: FRDataPoint[] = [[100, 60], [200, 80]];
		expect(lookupFRValueAtFreq(data, 125)).toBeCloseTo(65, 5);
	});

	it('interpolates at 75% position between points', () => {
		const data: FRDataPoint[] = [[100, 60], [200, 80]];
		expect(lookupFRValueAtFreq(data, 175)).toBeCloseTo(75, 5);
	});

	it('handles single-point dataset', () => {
		const data: FRDataPoint[] = [[1000, 80]];
		expect(lookupFRValueAtFreq(data, 500)).toBe(80);
		expect(lookupFRValueAtFreq(data, 1000)).toBe(80);
		expect(lookupFRValueAtFreq(data, 5000)).toBe(80);
	});

	it('finds correct interval in large sorted dataset', () => {
		// 480 points from 20 to 20000 Hz, all at 80 dB except specific test points
		const data: FRDataPoint[] = makePoints(20, 20000, 480);
		// Override a few known points to verify search finds the right interval
		data[100] = [data[100][0], 90]; // bump point 100 to 90 dB
		data[101] = [data[101][0], 90];

		// Point between indices 100 and 101 should interpolate between 90 and 90
		const midFreq = (data[100][0] + data[101][0]) / 2;
		expect(lookupFRValueAtFreq(data, midFreq)).toBeCloseTo(90, 5);

		// Point well before index 100 should be 80 dB
		expect(lookupFRValueAtFreq(data, data[50][0])).toBeCloseTo(80, 5);
	});
});
