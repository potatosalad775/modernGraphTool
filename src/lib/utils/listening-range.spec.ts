import { describe, it, expect } from 'vitest';
import { rangeMakeupGain, clampToBand, RANGE_FILTER_Q } from './listening-range.js';

/** Magnitude of a 2nd-order highpass at `f`, corner `f0`, Q = 1/√2. */
function highpassMag(f: number, f0: number): number {
	const r = f / f0;
	return (r * r) / Math.sqrt(1 + Math.pow(r, 4));
}

/** Magnitude of a 2nd-order lowpass at `f`, corner `f0`, Q = 1/√2. */
function lowpassMag(f: number, f0: number): number {
	const r = f / f0;
	return 1 / Math.sqrt(1 + Math.pow(r, 4));
}

describe('rangeMakeupGain', () => {
	it('restores unity at the band center for any width', () => {
		const bands: [number, number][] = [
			[20, 20000],
			[100, 10000],
			[500, 2000],
			[900, 1100],
			[1000, 1001]
		];
		for (const [from, to] of bands) {
			const center = Math.sqrt(from * to);
			const loss = highpassMag(center, from) * lowpassMag(center, to);
			expect(loss * rangeMakeupGain(from, to)).toBeCloseTo(1, 10);
		}
	});

	it('is bounded between 0 dB and +6 dB', () => {
		// Widest sensible band → no meaningful correction.
		expect(rangeMakeupGain(20, 20000)).toBeCloseTo(1, 5);
		// Narrowest the store allows (1 Hz apart) → the full +6 dB, never more.
		expect(rangeMakeupGain(1000, 1001)).toBeGreaterThan(1.99);
		expect(rangeMakeupGain(1000, 1001)).toBeLessThanOrEqual(2);
	});

	it('compensates roughly 2 dB for a one-octave band', () => {
		const db = 20 * Math.log10(rangeMakeupGain(1000, 2000));
		expect(db).toBeCloseTo(1.94, 2);
	});

	it('is symmetric in its arguments', () => {
		expect(rangeMakeupGain(2000, 500)).toBe(rangeMakeupGain(500, 2000));
	});

	it('degrades safely on non-positive input', () => {
		expect(rangeMakeupGain(0, 1000)).toBe(1);
		expect(rangeMakeupGain(-5, 1000)).toBe(1);
	});

	it('exposes the Butterworth Q the derivation assumes', () => {
		expect(RANGE_FILTER_Q).toBeCloseTo(0.707, 3);
	});
});

describe('clampToBand', () => {
	it('leaves a frequency inside the band alone', () => {
		expect(clampToBand(1000, 500, 2000)).toBe(1000);
	});

	it('pulls frequencies outside the band to the nearest edge', () => {
		expect(clampToBand(100, 500, 2000)).toBe(500);
		expect(clampToBand(9000, 500, 2000)).toBe(2000);
	});

	it('keeps the endpoints themselves', () => {
		expect(clampToBand(500, 500, 2000)).toBe(500);
		expect(clampToBand(2000, 500, 2000)).toBe(2000);
	});

	it('tolerates reversed bounds', () => {
		expect(clampToBand(100, 2000, 500)).toBe(500);
		expect(clampToBand(9000, 2000, 500)).toBe(2000);
	});
});
