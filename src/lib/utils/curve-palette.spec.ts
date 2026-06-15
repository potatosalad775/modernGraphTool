import { describe, it, expect } from 'vitest';
import { randomCurveColor, parseOklch, formatOklch } from './curve-palette.js';

describe('randomCurveColor', () => {
	const palette = ['#0072B2', '#E69F00', '#009E73', '#CC79A7'];

	it('always returns a valid oklch() string', () => {
		const out = randomCurveColor(palette, palette[0]);
		expect(out).toMatch(/^oklch\(/);
		const [L, C, H] = parseOklch(out);
		expect(Number.isFinite(L)).toBe(true);
		expect(Number.isFinite(C)).toBe(true);
		expect(Number.isFinite(H)).toBe(true);
	});

	it('never returns the current color when the palette has alternatives', () => {
		// Regression: onRandom used to reuse the deterministic nextCurveColor,
		// which returned the same color every click — so clicking "Random"
		// re-set the curve to the value it already had (no visible change).
		const current = formatOklch(...parseOklch(palette[0]));
		for (let i = 0; i < 200; i++) {
			expect(randomCurveColor(palette, palette[0])).not.toBe(current);
		}
	});

	it('produces more than one distinct color across many calls (actually random)', () => {
		const seen = new Set<string>();
		for (let i = 0; i < 200; i++) {
			seen.add(randomCurveColor(palette, palette[0]));
		}
		expect(seen.size).toBeGreaterThan(1);
	});

	it('eventually covers every non-current palette entry', () => {
		const current = palette[0];
		const expected = new Set(palette.slice(1).map((c) => formatOklch(...parseOklch(c))));
		const seen = new Set<string>();
		for (let i = 0; i < 500; i++) {
			seen.add(randomCurveColor(palette, current));
		}
		for (const c of expected) {
			expect(seen.has(c)).toBe(true);
		}
	});

	it('returns the only entry when the palette has a single color', () => {
		const single = ['#0072B2'];
		const expected = formatOklch(...parseOklch(single[0]));
		expect(randomCurveColor(single, single[0])).toBe(expected);
	});

	it('generates a random hue at the default L/C when no palette is configured', () => {
		const hues = new Set<number>();
		for (let i = 0; i < 200; i++) {
			const [L, C, H] = parseOklch(randomCurveColor(undefined, undefined));
			expect(L).toBeCloseTo(0.68, 5);
			expect(C).toBeCloseTo(0.16, 5);
			expect(H).toBeGreaterThanOrEqual(0);
			expect(H).toBeLessThan(360);
			hues.add(H);
		}
		expect(hues.size).toBeGreaterThan(1);
	});
});
