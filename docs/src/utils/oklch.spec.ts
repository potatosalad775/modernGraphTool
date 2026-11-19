import { describe, it, expect } from 'vitest';
import {
	hexToOklch,
	oklchToHex,
	oklchToCssString,
	withAlpha,
	generateContentColor,
	contrastRatio,
	generateDarkVariant,
	generateBaseScale,
	generateFullPalette,
	maxChromaFor,
	randomizeInputs,
	worstLightPairings,
	BASE_LIGHTNESS_LIGHT_RANGE,
	BASE_LIGHTNESS_DARK_RANGE,
	DEFAULT_INPUTS,
	DEFAULT_BASE_SATURATION,
	ROLES,
	WCAG_AA,
	WCAG_AAA,
	type OklchColor,
	type ThemePalette
} from './oklch';
import { EXTREME_INPUTS } from './oklch.fixtures';

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
	'graphBaseline',
	'graphCompare',
	'scrim',
	'rating'
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

/** The palette's colours are strings, so a contrast check reads back what the file says. */
function parseOklch(css: string): OklchColor {
	const match = /^oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/.exec(css);
	if (!match) throw new Error(`not an oklch() colour: ${css}`);
	return { l: Number(match[1]) / 100, c: Number(match[2]), h: Number(match[3]) };
}

/** Mulberry32: a seeded `Math.random` stand-in, so a failing roll can be replayed. */
function seededRandom(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
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
	it('keeps light-mode content colours light and low-chroma on a dark fill', () => {
		const content = generateContentColor({ l: 0.43, c: 0.09, h: 163 }, 'light');
		expect(content.l).toBe(0.98);
		expect(content.c).toBeLessThan(0.09);
		expect(content.h).toBe(163);
	});

	it('keeps every default fill at 4.5:1 (light) and 7:1 (dark) or better against its content', () => {
		for (const [role, hex] of Object.entries(DEFAULT_INPUTS)) {
			if (typeof hex !== 'string') continue;
			const fill = hexToOklch(hex);
			expect(
				contrastRatio(fill, generateContentColor(fill, 'light')),
				`light ${role}`
			).toBeGreaterThan(4.5);
			const dark = generateDarkVariant(fill);
			expect(
				contrastRatio(dark, generateContentColor(dark, 'dark')),
				`dark ${role}`
			).toBeGreaterThan(7);
		}
	});

	it('flips light-mode content to a dark ink on a light fill', () => {
		const content = generateContentColor({ l: 0.8, c: 0.16, h: 86 }, 'light');
		expect(content.l).toBeLessThan(0.3);
		expect(content.h).toBe(86);
	});

	it('gives every light-mode fill at least 4.5:1 against its content', () => {
		// 0.6 is left out on purpose: at mid lightness neither ink reaches 4.5 (even
		// pure black and white top out at 4.58 there), so the generator does its best.
		for (const l of [0.2, 0.35, 0.5, 0.7, 0.8, 0.9]) {
			const fill = { l, c: 0.1, h: 120 };
			expect(contrastRatio(fill, generateContentColor(fill, 'light')), `L=${l}`).toBeGreaterThan(
				4.5
			);
		}
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
			expect(dark.l).toBeGreaterThanOrEqual(0.8);
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
		expect(dark.baseContent.c).toBeCloseTo(0.015, 2);
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
	it('fills every palette key for the default inputs, contrast palettes included', () => {
		const { light, dark, contrast } = generateFullPalette(DEFAULT_INPUTS);
		expectWellFormedPalette(light, 'light');
		expectWellFormedPalette(dark, 'dark');
		expectWellFormedPalette(contrast.light, 'contrast.light');
		expectWellFormedPalette(contrast.dark, 'contrast.dark');
	});

	it('fills every palette key for arbitrary inputs, including extremes', () => {
		for (const [i, inputs] of EXTREME_INPUTS.entries()) {
			const { light, dark, contrast } = generateFullPalette(inputs);
			expectWellFormedPalette(light, `case${i}.light`);
			expectWellFormedPalette(dark, `case${i}.dark`);
			expectWellFormedPalette(contrast.light, `case${i}.contrast.light`);
			expectWellFormedPalette(contrast.dark, `case${i}.contrast.dark`);
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

	it('emits the scrim as the shipped 40% black in both modes', () => {
		const { light, dark } = generateFullPalette(DEFAULT_INPUTS);
		expect(light.scrim).toBe('oklch(0% 0 0 / 40%)');
		expect(dark.scrim).toBe('oklch(0% 0 0 / 40%)');
	});
});

describe('rating', () => {
	it('darkens the warning amber to 4.5:1 on the light surfaces, near the shipped value', () => {
		const { light } = generateFullPalette(DEFAULT_INPUTS);
		const rating = parseOklch(light.rating);
		for (const surface of [light.base100, light.base200]) {
			expect(contrastRatio(rating, parseOklch(surface))).toBeGreaterThanOrEqual(WCAG_AA);
		}
		// Shipped: oklch(53% 0.11 75).
		expect(Math.abs(rating.l * 100 - 53)).toBeLessThanOrEqual(2.5);
		expect(Math.abs(rating.h - 75)).toBeLessThanOrEqual(2);
	});

	it('is the dark warning itself in dark mode, as shipped', () => {
		const { dark } = generateFullPalette(DEFAULT_INPUTS);
		expect(dark.rating).toBe(dark.warning);
	});
});

describe('increased contrast', () => {
	/** Lightness, in percent, of the light fills in the shipped increased-contrast block. */
	const SHIPPED_L = [
		['primary', 43],
		['secondary', 43],
		['info', 43],
		['success', 43],
		['error', 45]
	] as const;

	it('takes the default light fills to 7:1 against their content and on base-100', () => {
		const { light, contrast } = generateFullPalette(DEFAULT_INPUTS);
		const surface = parseOklch(light.base100);
		for (const [role, shippedL] of SHIPPED_L) {
			const fill = parseOklch(contrast.light[role]);
			const content = parseOklch(contrast.light[`${role}Content`]);
			expect(contrastRatio(fill, content), `${role} on its content`).toBeGreaterThanOrEqual(
				WCAG_AAA
			);
			expect(contrastRatio(fill, surface), `${role} on base-100`).toBeGreaterThanOrEqual(WCAG_AAA);
			expect(Math.abs(fill.l * 100 - shippedL), `${role} lightness`).toBeLessThanOrEqual(2.5);
		}
	});

	it('takes the default rating to 7:1 on base-100 and base-200', () => {
		const { light, contrast } = generateFullPalette(DEFAULT_INPUTS);
		const rating = parseOklch(contrast.light.rating);
		for (const surface of [light.base100, light.base200]) {
			expect(contrastRatio(rating, parseOklch(surface))).toBeGreaterThanOrEqual(WCAG_AAA);
		}
		// Shipped: oklch(43% 0.105 72).
		expect(Math.abs(rating.l * 100 - 43)).toBeLessThanOrEqual(2.5);
	});

	it('keeps every solved pair clear of its bar once it is rounded to 8-bit pixels', () => {
		// The hex round trip is one renderer's rounding. A pair solved to exactly
		// 7:1 came out of it, and out of Chrome, as low as 6.93:1.
		const painted = (css: string) => hexToOklch(oklchToHex(parseOklch(css)));
		const { light, contrast } = generateFullPalette(DEFAULT_INPUTS);
		for (const surface of [light.base100, light.base200]) {
			expect(contrastRatio(painted(light.rating), painted(surface))).toBeGreaterThanOrEqual(
				WCAG_AA
			);
			expect(
				contrastRatio(painted(contrast.light.rating), painted(surface))
			).toBeGreaterThanOrEqual(WCAG_AAA);
		}
		for (const [role] of SHIPPED_L) {
			const fill = painted(contrast.light[role]);
			expect(
				contrastRatio(fill, painted(contrast.light[`${role}Content`])),
				role
			).toBeGreaterThanOrEqual(WCAG_AAA);
			expect(contrastRatio(fill, painted(light.base100)), role).toBeGreaterThanOrEqual(WCAG_AAA);
		}
	});

	it('leaves a fill that already clears 7:1 as the identical string', () => {
		// The CSS block lists a token only where the string differs, so this is what
		// keeps accent and warning out of it, as in the shipped file.
		const { light, dark, contrast } = generateFullPalette(DEFAULT_INPUTS);
		expect(contrast.light.accent).toBe(light.accent);
		expect(contrast.light.warning).toBe(light.warning);
		for (const role of ROLES) {
			expect(contrast.dark[role], `dark ${role}`).toBe(dark[role]);
		}
	});

	it('pushes a light fill with a dark ink lighter, not darker', () => {
		const inputs = { ...DEFAULT_INPUTS, warning: oklchToHex({ l: 0.68, c: 0.14, h: 86 }) };
		const { light, contrast } = generateFullPalette(inputs);
		const before = parseOklch(light.warning);
		const content = parseOklch(light.warningContent);
		expect(content.l, 'carries a dark ink').toBeLessThan(0.3);
		expect(contrastRatio(before, content)).toBeLessThan(WCAG_AAA);

		const after = parseOklch(contrast.light.warning);
		expect(after.l).toBeGreaterThan(before.l);
		expect(contrastRatio(after, content)).toBeGreaterThanOrEqual(WCAG_AAA);
	});

	it('sets base-content to pure black and white', () => {
		const { contrast } = generateFullPalette(DEFAULT_INPUTS);
		expect(contrast.light.baseContent).toBe('oklch(0% 0 0)');
		expect(contrast.dark.baseContent).toBe('oklch(100% 0 0)');
	});
});

describe('worstLightPairings', () => {
	it('reports every default role at 4.5:1 or better', () => {
		const pairings = worstLightPairings(DEFAULT_INPUTS);
		for (const role of ROLES) {
			expect(pairings[role].ratio, role).toBeGreaterThanOrEqual(WCAG_AA);
		}
	});

	it('names the failing pairing for a mid-lightness fill', () => {
		// At L 0.6 neither ink reaches 4.5:1, and the fill is no darker than the
		// light ink, so it fails as text on the surface by even more.
		const mid = oklchToHex({ l: 0.6, c: 0.1, h: 250 });
		const pairings = worstLightPairings({ ...DEFAULT_INPUTS, primary: mid, warning: mid });
		expect(pairings.primary.pairing).toBe('surface');
		expect(pairings.primary.ratio).toBeLessThan(WCAG_AA);
		// Warning is never text on the surface, so its own ink is what fails.
		expect(pairings.warning.pairing).toBe('content');
		expect(pairings.warning.ratio).toBeLessThan(WCAG_AA);
	});
});

describe('randomizeInputs', () => {
	const LIGHT_SURFACES = [BASE_LIGHTNESS_LIGHT_RANGE[0], 0.91, BASE_LIGHTNESS_LIGHT_RANGE[1]];
	const random = seededRandom(0x5eed);
	const rolls = Array.from({ length: 2000 }, (_, i) => {
		const current = { ...DEFAULT_INPUTS, baseLightnessLight: LIGHT_SURFACES[i % 3] };
		return { current, rolled: randomizeInputs(current, random) };
	});

	it('keeps every role at 4.5:1 on its content, and every role but warning on base-100', () => {
		for (const [i, { rolled }] of rolls.entries()) {
			const { light } = generateBaseScale(
				rolled.baseHue,
				rolled.baseSaturation,
				rolled.baseLightnessLight,
				rolled.baseLightnessDark
			);
			for (const role of ROLES) {
				expect(rolled[role], `roll ${i} ${role}`).toMatch(/^#[0-9a-f]{6}$/);
				const fill = hexToOklch(rolled[role]);
				expect(
					contrastRatio(fill, generateContentColor(fill, 'light')),
					`roll ${i} ${role} on its content`
				).toBeGreaterThanOrEqual(WCAG_AA);
				if (role === 'warning') continue;
				expect(
					contrastRatio(fill, light.base100),
					`roll ${i} ${role} on base-100`
				).toBeGreaterThanOrEqual(WCAG_AA);
			}
		}
	});

	it('keeps warning a light amber with a dark ink', () => {
		for (const [i, { rolled }] of rolls.entries()) {
			const warning = hexToOklch(rolled.warning);
			expect(warning.l, `roll ${i}`).toBeGreaterThanOrEqual(0.7);
			expect(Math.abs(warning.h - 75), `roll ${i}`).toBeLessThanOrEqual(20);
			expect(generateContentColor(warning, 'light').l, `roll ${i}`).toBeLessThan(0.3);
		}
	});

	it('keeps the status roles in their hue bands', () => {
		// Role, band centre, half the band width.
		const bands = [
			['info', 220, 20],
			['success', 130, 20],
			['error', 15, 10]
		] as const;
		for (const [i, { rolled }] of rolls.entries()) {
			for (const [role, centre, half] of bands) {
				const offset = ((hexToOklch(rolled[role]).h - centre + 540) % 360) - 180;
				// A few degrees of slack for the 8-bit hex the roll comes back as.
				expect(Math.abs(offset), `roll ${i} ${role}`).toBeLessThanOrEqual(half + 3);
			}
		}
	});

	it('rolls the base tone but keeps the surface lightness the operator set', () => {
		for (const { current, rolled } of rolls) {
			expect(rolled.baseLightnessLight).toBe(current.baseLightnessLight);
			expect(rolled.baseLightnessDark).toBe(current.baseLightnessDark);
			expect(rolled.baseHue).toBeGreaterThanOrEqual(0);
			expect(rolled.baseHue).toBeLessThan(360);
			expect(rolled.baseSaturation).toBeGreaterThan(0);
			expect(rolled.baseSaturation).toBeLessThan(1);
		}
	});
});

describe('DEFAULT_INPUTS', () => {
	it('are six-digit hex colours', () => {
		const { baseHue, baseSaturation, baseLightnessLight, baseLightnessDark, ...colors } =
			DEFAULT_INPUTS;
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
