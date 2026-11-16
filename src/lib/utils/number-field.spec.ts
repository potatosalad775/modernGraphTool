import { describe, expect, it } from 'vitest';
import { parseBounded } from './number-field.js';

describe('parseBounded', () => {
	it('returns an in-range value unchanged', () => {
		expect(parseBounded('-7.5', -40, 0)).toBe(-7.5);
	});

	it('clamps to the bounds', () => {
		expect(parseBounded('5', 20, 20000)).toBe(20);
		expect(parseBounded('99999', 20, 20000)).toBe(20000);
	});

	it('rounds before clamping when asked for an integer', () => {
		expect(parseBounded('440.6', 20, 20000, true)).toBe(441);
		expect(parseBounded('0.4', 20, 20000, true)).toBe(20);
	});

	it('returns null for text that is not a finite number', () => {
		for (const raw of ['', '   ', '-', 'abc', 'NaN', 'Infinity']) {
			expect(parseBounded(raw, 0, 10)).toBeNull();
		}
	});

	it('lets the upper bound win over an inverted range', () => {
		expect(parseBounded('5', 10, 3)).toBe(3);
	});
});
