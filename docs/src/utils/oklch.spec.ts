import { describe, it, expect } from 'vitest';
import {
	hexToOklch,
	oklchToHex,
	oklchToCssString,
	withAlpha,
	generateContentColor,
	generateDarkVariant,
	generateBaseScale,
	generateFullPalette,
	maxChromaFor,
	BASE_LIGHTNESS_LIGHT_RANGE,
	BASE_LIGHTNESS_DARK_RANGE,
	DEFAULT_INPUTS,
	DEFAULT_BASE_SATURATION,
	type ThemePalette,
	type PaletteInputs
} from './oklch';

/**
 * The theme generator interpolates these values straight into a theme.css that
 * operators ship. A NaN or undefined reaching the output is not a visible crash —
 * it is a CSS variable the browser silently discards, so the check that matters
 * most is that every palette key is a well-formed colour for any input.
 */

/** Every key of ThemePalette, so a new field cannot skip the completeness check. */
const PALETTE_KEYS: Array<keyof ThemePalette> = [
	'base100',
	'base200',
	'base300',
	'baseContent',
	'primary',
	'primaryContent',
	'secondary',
	'secondaryContent',
	'accent',
	'accentContent',
	'neutral',
	'neutralContent',
	'info',
	'infoContent',
	'success',
	'successContent',
	'warning',
	'warningContent',
	'error',
	'errorContent',
	'graphBg',
	'graphWatermarkOpacity',
	'graphGridMajor',
	'graphGridMinor',
	'graphAxisLabel',
	'graphGridText',
	'graphBaseline'
];

function expectWellFormedPalette(palette: ThemePalette, label: string) {
	for (const key of PALETTE_KEYS) {
		const value = palette[key];
		expect(value, `${label}.${key} is missing`).toBeDefined();
		expect(typeof value, `${label}.${key} is not a string`).toBe('string');
		expect(value.length, `${label}.${key} is empty`).toBeGreaterThan(0);
		expect(value, `${label}.${key} contains NaN`).not.toMatch(/NaN/);
		expect(value, `${label}.${key} contains undefined`).not.toMatch(/undefined/);
	}
}

describe('hex ↔ OKLCH', () => {
	const samples = [
		'#000000',
		'#ffffff',
		'#808080',
		'#ff0000',
		'#00ff00',
		'#0000ff',
		'#0072b2',
		'#e69f00',
		'#009e73',
		'#cc79a7'
	];

	it('round-trips in-gamut colours back to the same hex', () => {
		for (const hex of samples) {
			expect(oklchToHex(hexToOklch(hex)), `round trip of ${hex}`).toBe(hex);
		}
	});

	it('places white and black at the ends of the lightness axis', () => {
		const white = hexToOklch('#ffffff');
		expect(white.l).toBeCloseTo(1, 2);
		expect(white.c).toBeCloseTo(0, 3);

		const black = hexToOklch('#000000');
		expect(black.l).toBeCloseTo(0, 3);
		expect(black.c).toBeCloseTo(0, 3);
	});

	it('reports hue in [0, 360)', () => {
		for (const hex of samples) {
			const { h } = hexToOklch(hex);
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThan(360);
		}
	});

	it('never produces NaN for any channel', () => {
		for (const hex of samples) {
			const { l, c, h } = hexToOklch(hex);
			expect(Number.isNaN(l) || Number.isNaN(c) || Number.isNaN(h)).toBe(false);
		}
	});
});

describe('oklchToCssString', () => {
	it('emits the percentage-lightness CSS form', () => {
		expect(oklchToCssString({ l: 0.59, c: 0.145, h: 163.225 })).toBe(
			'oklch(59.000% 0.145 163.225)'
		);
	});

	it('emits values CSS can parse for every sample colour', () => {
		for (const hex of ['#000000', '#ffffff', '#0072b2', '#cc79a7']) {
			expect(oklchToCssString(hexToOklch(hex))).toMatch(
				/^oklch\(\d+\.\d{3}% \d+\.\d{3} \d+\.\d{3}\)$/
			);
		}
	});
});

describe('withAlpha', () => {
	it('appends the alpha inside the oklch() call', () => {
		expect(withAlpha('oklch(59.000% 0.145 163.225)', 0.15)).toBe(
			'oklch(59.000% 0.145 163.225 / 0.15)'
		);
	});

	it('is only ever applied to oklch() strings, never the rgba() graph values', () => {
		// It splices at the first ')', so an rgba() input would corrupt silently.
		// The palette's graph keys are rgba and must stay away from it.
		const { light } = generateFullPalette(DEFAULT_INPUTS);
		expect(light.baseContent.startsWith('oklch(')).toBe(true);
		expect(light.graphGridMajor.startsWith('rgba(')).toBe(true);
	});
});

describe('derived colours', () => {
	it('keeps light-mode content colours light and low-chroma', () => {
		const content = generateContentColor({ l: 0.59, c: 0.145, h: 163 }, 'light');
		expect(content.l).toBe(0.97);
		expect(content.c).toBeLessThan(0.145);
		expect(content.h).toBe(163);
	});

	it('clamps dark-mode content lightness into its documented band', () => {
		for (const l of [0, 0.2, 0.5, 0.9, 1]) {
			const content = generateContentColor({ l, c: 0.2, h: 200 }, 'dark');
			expect(content.l).toBeGreaterThanOrEqual(0.15);
			expect(content.l).toBeLessThanOrEqual(0.42);
		}
	});

	it('clamps the dark variant into its documented band and preserves hue', () => {
		for (const l of [0, 0.25, 0.5, 0.75, 1]) {
			const dark = generateDarkVariant({ l, c: 0.1, h: 300 });
			expect(dark.l).toBeGreaterThanOrEqual(0.7);
			expect(dark.l).toBeLessThanOrEqual(0.88);
			expect(dark.h).toBe(300);
			expect(dark.c).toBe(0.1);
		}
	});

	it('orders the light base scale from lightest surface to darkest text', () => {
		const { light, dark } = generateBaseScale(248);
		expect(light.base100.l).toBeGreaterThan(light.base200.l);
		expect(light.base200.l).toBeGreaterThan(light.base300.l);
		expect(light.base300.l).toBeGreaterThan(light.baseContent.l);
		// Dark mode inverts: surfaces are dark, text is light
		expect(dark.baseContent.l).toBeGreaterThan(dark.base100.l);
	});
});

describe('maxChromaFor', () => {
	it('returns a chroma that is in sRGB, and the next step up is not', () => {
		for (const l of [0.2, 0.44, 0.83, 0.92, 0.98]) {
			for (const h of [0, 60, 120, 180, 248, 300]) {
				const max = maxChromaFor(l, h);
				expect(oklchToHex({ l, c: max, h }), `L=${l} H=${h}`).toMatch(/^#[0-9a-f]{6}$/);
				// A hex round trip of an out-of-gamut colour clips, so its chroma
				// comes back lower than asked for. An in-gamut one does not.
				expect(hexToOklch(oklchToHex({ l, c: max, h })).c).toBeCloseTo(max, 2);
				expect(hexToOklch(oklchToHex({ l, c: max + 0.05, h })).c).toBeLessThan(max + 0.05);
			}
		}
	});

	it('collapses to zero at the ends of the lightness range', () => {
		expect(maxChromaFor(0, 200)).toBe(0);
		expect(maxChromaFor(1, 200)).toBe(0);
	});

	it('varies with hue — the reason the tint is a share and not a constant', () => {
		// Yellow-green holds far more chroma near white than blue does; a fixed
		// chroma would therefore mean two different things at the two hues.
		expect(maxChromaFor(0.98, 120)).toBeGreaterThan(maxChromaFor(0.98, 250) * 3);
	});
});

describe('base saturation', () => {
	it('is a pure neutral grey at zero and tinted above it', () => {
		const grey = generateBaseScale(248, 0);
		expect(grey.light.base100.c).toBe(0);
		expect(grey.light.baseContent.c).toBe(0);
		expect(grey.dark.base100.c).toBe(0);
	});

	it('raises every base chroma monotonically', () => {
		let previous = generateBaseScale(248, 0);
		for (const s of [0.25, 0.5, 0.75, 1]) {
			const next = generateBaseScale(248, s);
			for (const key of ['base100', 'base200', 'base300', 'baseContent'] as const) {
				expect(next.light[key].c, `light.${key} at ${s}`).toBeGreaterThan(previous.light[key].c);
				expect(next.dark[key].c, `dark.${key} at ${s}`).toBeGreaterThan(previous.dark[key].c);
			}
			previous = next;
		}
	});

	it('stays inside sRGB even at full saturation, for every hue', () => {
		for (let hue = 0; hue < 360; hue += 15) {
			const { light, dark } = generateBaseScale(hue, 1);
			for (const color of [...Object.values(light), ...Object.values(dark)]) {
				// Out of gamut would clip on the round trip and lose chroma.
				expect(hexToOklch(oklchToHex(color)).c, `hue ${hue}`).toBeCloseTo(color.c, 2);
			}
		}
	});

	it('reproduces the shipped defaults/theme.css chroma at the default setting', () => {
		const { light, dark } = generateBaseScale(248, DEFAULT_BASE_SATURATION);
		// The whole point of the 0.3 default: changing it silently re-skins every
		// theme an operator generates without touching a slider.
		expect(light.base100.c).toBeCloseTo(0.003, 2);
		expect(light.baseContent.c).toBeCloseTo(0.042, 2);
		expect(dark.base100.c).toBeCloseTo(0.023, 2);
		expect(dark.baseContent.c).toBeCloseTo(0.031, 2);
	});
});

describe('base lightness', () => {
	it('moves the surfaces without inverting the scale', () => {
		for (const [lightL, darkL] of [
			[0.84, 0.16],
			[0.91, 0.31],
			[0.99, 0.46]
		]) {
			const { light, dark } = generateBaseScale(248, 0.5, lightL, darkL);
			expect(light.base100.l).toBeGreaterThan(light.base200.l);
			expect(light.base200.l).toBeGreaterThan(light.base300.l);
			expect(light.base300.l).toBeGreaterThan(light.baseContent.l);
			expect(dark.baseContent.l).toBeGreaterThan(dark.base100.l);
			expect(dark.base100.l).toBeGreaterThan(dark.base300.l);
		}
	});

	it('clamps out-of-range requests into the published slider bounds', () => {
		const { light, dark } = generateBaseScale(248, 0.3, 5, -5);
		expect(light.base100.l).toBe(BASE_LIGHTNESS_LIGHT_RANGE[1]);
		expect(dark.base100.l).toBe(BASE_LIGHTNESS_DARK_RANGE[0]);
	});

	it('lets a darker light surface hold more chroma than a near-white one', () => {
		// The user-visible reason the control exists: at L=0.98 sRGB simply has
		// no saturated colours to offer, so "more saturated" needs both knobs.
		const pale = generateBaseScale(248, 1, 0.99, 0.31);
		const deep = generateBaseScale(248, 1, 0.88, 0.31);
		expect(deep.light.base100.c).toBeGreaterThan(pale.light.base100.c * 2);
	});
});

describe('generateFullPalette', () => {
	it('fills every palette key for the default inputs', () => {
		const { light, dark } = generateFullPalette(DEFAULT_INPUTS);
		expectWellFormedPalette(light, 'light');
		expectWellFormedPalette(dark, 'dark');
	});

	it('fills every palette key for arbitrary inputs, including extremes', () => {
		const cases: PaletteInputs[] = [
			{
				baseHue: 0,
				baseSaturation: 0,
				baseLightnessLight: 0.99,
				baseLightnessDark: 0.16,
				primary: '#000000',
				secondary: '#ffffff',
				accent: '#000000',
				info: '#ffffff',
				success: '#000000',
				warning: '#ffffff',
				error: '#000000'
			},
			{
				baseHue: 359,
				baseSaturation: 1,
				baseLightnessLight: 0.84,
				baseLightnessDark: 0.46,
				primary: '#ff0000',
				secondary: '#00ff00',
				accent: '#0000ff',
				info: '#ffff00',
				success: '#00ffff',
				warning: '#ff00ff',
				error: '#123456'
			}
		];

		for (const [i, inputs] of cases.entries()) {
			const { light, dark } = generateFullPalette(inputs);
			expectWellFormedPalette(light, `case${i}.light`);
			expectWellFormedPalette(dark, `case${i}.dark`);
		}
	});

	it('produces different light and dark palettes', () => {
		const { light, dark } = generateFullPalette(DEFAULT_INPUTS);
		expect(light.base100).not.toBe(dark.base100);
		expect(light.baseContent).not.toBe(dark.baseContent);
	});

	it('carries the graph keys through verbatim per mode', () => {
		const { light, dark } = generateFullPalette(DEFAULT_INPUTS);
		expect(light.graphBg).toBeDefined();
		expect(dark.graphBg).toBeDefined();
		expect(light.graphGridMajor).not.toBe(dark.graphGridMajor);
	});
});

describe('DEFAULT_INPUTS', () => {
	it('are six-digit hex colours', () => {
		const {
			baseHue,
			baseSaturation,
			baseLightnessLight,
			baseLightnessDark,
			...colors
		} = DEFAULT_INPUTS;
		expect(baseHue).toBeGreaterThanOrEqual(0);
		expect(baseHue).toBeLessThan(360);
		expect(baseSaturation).toBeGreaterThan(0);
		expect(baseSaturation).toBeLessThanOrEqual(1);
		expect(baseLightnessLight).toBeGreaterThan(baseLightnessDark);
		for (const [key, value] of Object.entries(colors)) {
			expect(value, `DEFAULT_INPUTS.${key}`).toMatch(/^#[0-9a-f]{6}$/);
		}
	});
});
