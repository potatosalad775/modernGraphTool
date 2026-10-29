import { describe, it, expect } from 'vitest';
import {
	randomCurveColor,
	nextCurveColor,
	resolveCurvePalette,
	parseOklch,
	formatOklch,
	hexToOklch,
	oklchToHex,
	readableLightnessBand
} from './curve-palette.js';

describe('randomCurveColor', () => {
	const palette = ['#0072B2', '#E69F00', '#009E73', '#CC79A7'];
	const norm = (c: string) => formatOklch(...parseOklch(c));

	it('always returns a valid oklch() string', () => {
		const out = randomCurveColor(palette, { current: palette[0] });
		expect(out).toMatch(/^oklch\(/);
		const [L, C, H] = parseOklch(out);
		expect(Number.isFinite(L)).toBe(true);
		expect(Number.isFinite(C)).toBe(true);
		expect(Number.isFinite(H)).toBe(true);
	});

	it('never returns the current color, whatever notation the palette uses', () => {
		// Regression: the current color is stored normalized (oklch) while
		// palette entries are hex, so a string comparison never excluded it and
		// roughly one click in N left the curve unchanged.
		for (let i = 0; i < 200; i++) {
			expect(randomCurveColor(palette, { current: norm(palette[0]) })).not.toBe(norm(palette[0]));
		}
	});

	it('never repeats itself on consecutive calls', () => {
		let current = randomCurveColor(palette);
		for (let i = 0; i < 200; i++) {
			const next = randomCurveColor(palette, { current });
			expect(next).not.toBe(current);
			current = next;
		}
	});

	it('eventually covers every non-current palette entry', () => {
		const expected = new Set(palette.slice(1).map(norm));
		const seen = new Set<string>();
		for (let i = 0; i < 500; i++) {
			seen.add(randomCurveColor(palette, { current: palette[0] }));
		}
		for (const c of expected) {
			expect(seen.has(c)).toBe(true);
		}
	});

	it('skips palette entries other curves already use', () => {
		const used = [norm(palette[1]), norm(palette[2])];
		for (let i = 0; i < 100; i++) {
			expect(randomCurveColor(palette, { current: palette[0], used })).toBe(norm(palette[3]));
		}
	});

	it('generates a color once every palette entry is taken', () => {
		const out = randomCurveColor(palette, { current: palette[0], used: palette.slice(1) });
		expect(palette.map(norm)).not.toContain(out);
	});

	it('generates rather than repeating a single-entry palette', () => {
		const single = ['#0072B2'];
		expect(randomCurveColor(single, { current: single[0] })).not.toBe(norm(single[0]));
	});

	it('varies lightness and chroma as well as hue when no palette is configured', () => {
		const Ls = new Set<number>();
		const Cs = new Set<number>();
		for (let i = 0; i < 200; i++) {
			const [L, C, H] = parseOklch(randomCurveColor(undefined));
			expect(H).toBeGreaterThanOrEqual(0);
			expect(H).toBeLessThan(360);
			Ls.add(L);
			Cs.add(C);
		}
		expect(Ls.size).toBeGreaterThan(10);
		expect(Cs.size).toBeGreaterThan(10);
	});

	it('stays clear of the other curves when generating', () => {
		const used = [0, 90, 180, 270].map((h) => formatOklch(0.68, 0.16, h));
		for (let i = 0; i < 100; i++) {
			const [L, C, H] = parseOklch(randomCurveColor(undefined, { used }));
			for (const u of used) {
				const [uL, uC, uH] = parseOklch(u);
				const da = C * Math.cos((H * Math.PI) / 180) - uC * Math.cos((uH * Math.PI) / 180);
				const db = C * Math.sin((H * Math.PI) / 180) - uC * Math.sin((uH * Math.PI) / 180);
				// Four colors leave room, so every pick clears the minimum distance.
				expect(Math.hypot(L - uL, da, db)).toBeGreaterThan(0.1);
			}
		}
	});

	it('keeps generated colors dark enough on a light background and light enough on a dark one', () => {
		for (let i = 0; i < 200; i++) {
			expect(parseOklch(randomCurveColor(undefined, { backgroundL: 0.98 }))[0]).toBeLessThanOrEqual(
				readableLightnessBand(0.98)[1]
			);
			expect(
				parseOklch(randomCurveColor(undefined, { backgroundL: 0.31 }))[0]
			).toBeGreaterThanOrEqual(readableLightnessBand(0.31)[0]);
		}
	});

	it('keeps generated colors inside sRGB, so the hex field shows what is drawn', () => {
		for (let i = 0; i < 200; i++) {
			const out = randomCurveColor(undefined, { backgroundL: 0.31 });
			const back = norm(oklchToHex(...parseOklch(out)));
			const [L1, C1] = parseOklch(out);
			const [L2, C2] = parseOklch(back);
			expect(Math.abs(L1 - L2)).toBeLessThan(0.01);
			expect(Math.abs(C1 - C2)).toBeLessThan(0.01);
		}
	});

	it('leaves operator palette entries as written, even outside the band', () => {
		const pale = ['#F0E442', '#FFC0CB'];
		const out = randomCurveColor(pale, { current: pale[0], backgroundL: 0.98 });
		expect(out).toBe(norm(pale[1]));
	});
});

describe('readableLightnessBand', () => {
	it('picks a darker band for light backgrounds and a lighter one for dark', () => {
		const [, lightMax] = readableLightnessBand(0.98);
		const [darkMin] = readableLightnessBand(0.31);
		expect(lightMax).toBeLessThan(darkMin + 0.1);
		expect(lightMax).toBeLessThan(0.98 - 0.25);
		expect(darkMin).toBeGreaterThan(0.31 + 0.3);
	});

	it('falls back to a middle band when the background is unknown', () => {
		const [min, max] = readableLightnessBand(undefined);
		expect(min).toBeLessThan(0.68);
		expect(max).toBeGreaterThan(0.68);
	});
});

describe('parseOklch', () => {
	it('parses an oklch() string', () => {
		expect(parseOklch('oklch(0.68 0.16 240)')).toEqual([0.68, 0.16, 240]);
	});

	it('tolerates extra whitespace and an alpha component', () => {
		expect(parseOklch('oklch(  0.5   0.1   30 / 0.5)')).toEqual([0.5, 0.1, 30]);
	});

	it('reads a percentage lightness, as theme.css writes it', () => {
		expect(parseOklch('oklch(98% 0.003 247.858)')).toEqual([0.98, 0.003, 247.858]);
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
