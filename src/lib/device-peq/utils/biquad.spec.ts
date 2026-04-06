import { describe, it, expect } from 'vitest';
import { computeWalkplayBiquad, computeMoondropBiquad, biquadCoeffsToBytes } from './biquad.js';

describe('biquad', () => {
	describe('computeWalkplayBiquad', () => {
		it('returns 5 coefficients', () => {
			const coeffs = computeWalkplayBiquad(1000, 6, 1.41);
			expect(coeffs).toHaveLength(5);
		});

		it('returns near-unity for 0 dB gain', () => {
			const coeffs = computeWalkplayBiquad(1000, 0, 1.0);
			// b0 should be close to 1.0 * 2^30
			expect(coeffs[0]).toBeCloseTo(1073741824, -3);
		});

		it('produces different coefficients for different gains', () => {
			const coeffsA = computeWalkplayBiquad(1000, 3, 1.0);
			const coeffsB = computeWalkplayBiquad(1000, -3, 1.0);
			expect(coeffsA[0]).not.toBe(coeffsB[0]);
		});
	});

	describe('computeMoondropBiquad', () => {
		it('returns 5 coefficients', () => {
			const coeffs = computeMoondropBiquad(1000, 6, 1.41);
			expect(coeffs).toHaveLength(5);
		});

		it('returns near-unity for 0 dB gain', () => {
			const coeffs = computeMoondropBiquad(1000, 0, 1.0);
			expect(coeffs[0]).toBeCloseTo(1073741824, -3);
		});

		it('matches Walkplay computation (both implement Audio EQ Cookbook peaking)', () => {
			// Both formulas are algebraically equivalent — verify they produce same results
			const walkplay = computeWalkplayBiquad(1000, 6, 1.0);
			const moondrop = computeMoondropBiquad(1000, 6, 1.0);
			for (let i = 0; i < 5; i++) {
				expect(moondrop[i]).toBe(walkplay[i]);
			}
		});
	});

	describe('biquadCoeffsToBytes', () => {
		it('returns a 20-byte Uint8Array', () => {
			const coeffs = [1073741824, -2147483648, 1073741824, 2147483647, -1073741824];
			const bytes = biquadCoeffsToBytes(coeffs);
			expect(bytes).toBeInstanceOf(Uint8Array);
			expect(bytes).toHaveLength(20);
		});

		it('encodes in little-endian format', () => {
			const coeffs = [0x04030201, 0, 0, 0, 0];
			const bytes = biquadCoeffsToBytes(coeffs);
			expect(bytes[0]).toBe(0x01);
			expect(bytes[1]).toBe(0x02);
			expect(bytes[2]).toBe(0x03);
			expect(bytes[3]).toBe(0x04);
		});
	});
});
