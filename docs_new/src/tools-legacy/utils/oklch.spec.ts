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
	DEFAULT_INPUTS,
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
		expect(oklchToCssString({ l: 0.59, c: 0.145, h: 163.225 })).toBe('oklch(59.000% 0.145 163.225)');
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
		const { baseHue, ...colors } = DEFAULT_INPUTS;
		expect(baseHue).toBeGreaterThanOrEqual(0);
		expect(baseHue).toBeLessThan(360);
		for (const [key, value] of Object.entries(colors)) {
			expect(value, `DEFAULT_INPUTS.${key}`).toMatch(/^#[0-9a-f]{6}$/);
		}
	});
});
