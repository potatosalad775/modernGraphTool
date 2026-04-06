import { describe, it, expect } from 'vitest';
import {
	toBytePair,
	splitSignedValue,
	splitUnsignedValue,
	combineBytes,
	fiioGainBytesFromValue,
	handleGain,
	PEQ_FILTER_PARAMS,
	SET_HEADER1,
	GET_HEADER1,
	END_HEADERS
} from './fiio-protocol.js';

describe('fiio-protocol', () => {
	describe('constants', () => {
		it('has expected protocol values', () => {
			expect(PEQ_FILTER_PARAMS).toBe(0x15);
			expect(SET_HEADER1).toBe(0xaa);
			expect(GET_HEADER1).toBe(0xbb);
			expect(END_HEADERS).toBe(0xee);
		});
	});

	describe('toBytePair', () => {
		it('splits a 16-bit value into [low, high]', () => {
			expect(toBytePair(0x1234)).toEqual([0x34, 0x12]);
		});

		it('handles zero', () => {
			expect(toBytePair(0)).toEqual([0, 0]);
		});
	});

	describe('splitUnsignedValue', () => {
		it('splits into [high, low] bytes', () => {
			expect(splitUnsignedValue(0x1234)).toEqual([0x12, 0x34]);
		});
	});

	describe('splitSignedValue', () => {
		it('handles positive values', () => {
			const [hi, lo] = splitSignedValue(100);
			expect(hi).toBe(0);
			expect(lo).toBe(100);
		});

		it('handles negative values with two\'s complement', () => {
			const [hi, lo] = splitSignedValue(-1);
			expect(hi).toBe(0xff);
			expect(lo).toBe(0xff);
		});
	});

	describe('combineBytes', () => {
		it('combines two bytes into a 16-bit value', () => {
			expect(combineBytes(0x12, 0x34)).toBe(0x1234);
		});
	});

	describe('gain encoding round-trip', () => {
		const testGains = [0, 1.5, -3.0, 6.0, -12.0, 0.1];

		for (const gain of testGains) {
			it(`round-trips ${gain} dB`, () => {
				const [hi, lo] = fiioGainBytesFromValue(gain);
				const decoded = handleGain(hi, lo);
				expect(decoded).toBeCloseTo(gain, 1);
			});
		}
	});
});
