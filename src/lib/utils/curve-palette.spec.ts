import { describe, it, expect } from 'vitest';
import {
	randomCurveColor,
	nextCurveColor,
	resolveCurvePalette,
	parseOklch,
	formatOklch,
	hexToOklch
} from './curve-palette.js';

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

describe('parseOklch', () => {
	it('parses an oklch() string', () => {
		expect(parseOklch('oklch(0.68 0.16 240)')).toEqual([0.68, 0.16, 240]);
	});

	it('tolerates extra whitespace and an alpha component', () => {
		expect(parseOklch('oklch(  0.5   0.1   30 / 0.5)')).toEqual([0.5, 0.1, 30]);
	});

	it('converts a hex color', () => {
		expect(parseOklch('#0072B2')).toEqual(hexToOklch('#0072B2'));
	});

	it('falls back to the default generation L/C for an unparseable color', () => {
		// No canvas outside the browser, so named colors cannot be resolved.
		expect(parseOklch('rebeccapurple')).toEqual([0.68, 0.16, 0]);
	});
});

describe('nextCurveColor', () => {
	const palette = ['#0072B2', '#E69F00', '#009E73', '#CC79A7'];

	it('always returns a valid oklch() string', () => {
		expect(nextCurveColor([])).toMatch(/^oklch\(/);
	});

	it('assigns a fixed neutral grey to targets', () => {
		// Targets must not consume a palette slot or drift between deployments.
		expect(nextCurveColor([], palette, { isTarget: true })).toBe(formatOklch(0.65, 0, 0));
		expect(nextCurveColor(['oklch(0.68 0.16 240)'], undefined, { isTarget: true })).toBe(
			formatOklch(0.65, 0, 0)
		);
	});

	it('takes the first palette entry when nothing is in use', () => {
		expect(nextCurveColor([], palette)).toBe(formatOklch(...parseOklch(palette[0])));
	});

	it('skips palette entries that are already in use', () => {
		const first = nextCurveColor([], palette);
		const second = nextCurveColor([first], palette);

		expect(second).not.toBe(first);
		expect(second).toBe(formatOklch(...parseOklch(palette[1])));
	});

	it('walks the whole configured palette before generating', () => {
		const used: string[] = [];
		for (let i = 0; i < palette.length; i++) used.push(nextCurveColor(used, palette));

		expect(new Set(used).size).toBe(palette.length);
		expect(used).toEqual(palette.map((c) => formatOklch(...parseOklch(c))));
	});

	it('falls back to generated colors once the palette is exhausted', () => {
		const used = palette.map((c) => formatOklch(...parseOklch(c)));
		const generated = nextCurveColor(used, palette);

		expect(used).not.toContain(generated);
		expect(generated).toMatch(/^oklch\(/);
	});

	it('keeps generating distinguishable colors well past the palette size', () => {
		const used: string[] = [];
		for (let i = 0; i < 16; i++) used.push(nextCurveColor(used, palette));
		expect(new Set(used).size).toBe(16);
	});

	it('uses the built-in Okabe–Ito palette when no palette is configured', () => {
		// The first pick is deterministic, which is what makes screenshots stable.
		expect(nextCurveColor([], undefined)).toBe(nextCurveColor([], undefined));
		expect(nextCurveColor([], [])).toBe(nextCurveColor([], undefined));
	});
});

describe('resolveCurvePalette', () => {
	const palette = ['#0072B2', '#E69F00', '#009E73', '#CC79A7'];

	it('passes an undefined or empty palette straight through', () => {
		expect(resolveCurvePalette(undefined, true)).toBeUndefined();
		expect(resolveCurvePalette([], true)).toEqual([]);
	});

	it('returns the palette unchanged when randomization is off', () => {
		expect(resolveCurvePalette(palette, false)).toBe(palette);
	});

	it('shuffles without dropping or duplicating entries', () => {
		const shuffled = resolveCurvePalette(palette, true)!;
		expect([...shuffled].sort()).toEqual([...palette].sort());
	});

	it('returns the same shuffle for the same palette — once per session', () => {
		const first = resolveCurvePalette(palette, true);
		expect(resolveCurvePalette(palette, true)).toBe(first);
		expect(resolveCurvePalette([...palette], true)).toBe(first);
	});

	it('reshuffles when the source palette changes', () => {
		const first = resolveCurvePalette(palette, true);
		const other = resolveCurvePalette([...palette, '#000000'], true);
		expect(other).not.toBe(first);
		expect(other).toHaveLength(palette.length + 1);
	});
});
