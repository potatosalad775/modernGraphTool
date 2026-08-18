/**
 * Pure OKLCH color math utilities for the theme generator.
 * No external dependencies — all conversions use Bjorn Ottosson's OKLab matrices.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface OklchColor {
	l: number; // lightness 0–1
	c: number; // chroma 0–~0.4
	h: number; // hue 0–360
}

export interface ThemePalette {
	// Base
	base100: string;
	base200: string;
	base300: string;
	baseContent: string;
	// Semantic
	primary: string;
	primaryContent: string;
	secondary: string;
	secondaryContent: string;
	accent: string;
	accentContent: string;
	neutral: string;
	neutralContent: string;
	info: string;
	infoContent: string;
	success: string;
	successContent: string;
	warning: string;
	warningContent: string;
	error: string;
	errorContent: string;
	// Graph (fixed per mode)
	graphBg: string;
	graphWatermarkOpacity: string;
	graphGridMajor: string;
	graphGridMinor: string;
	graphAxisLabel: string;
	graphGridText: string;
	graphBaseline: string;
}

export interface PaletteInputs {
	baseHue: number;
	/**
	 * 0–1. Share of the sRGB gamut's chroma that the base surfaces take at their
	 * own lightness — see `maxChromaFor` for why this is a share and not an
	 * absolute chroma. 0 is a pure neutral grey.
	 */
	baseSaturation: number;
	/** Light-mode `base-100` lightness. `base-200` / `-300` step down from it. */
	baseLightnessLight: number;
	/** Dark-mode `base-100` lightness. `base-200` / `-300` step down from it. */
	baseLightnessDark: number;
	primary: string; // hex
	secondary: string;
	accent: string;
	info: string;
	success: string;
	warning: string;
	error: string;
}

/** Slider bounds for the base-tone inputs, shared with the UI so both agree. */
export const BASE_LIGHTNESS_LIGHT_RANGE: [number, number] = [0.84, 0.99];
export const BASE_LIGHTNESS_DARK_RANGE: [number, number] = [0.16, 0.46];

export const DEFAULT_BASE_SATURATION = 0.3;
export const DEFAULT_BASE_LIGHTNESS_LIGHT = 0.98;
export const DEFAULT_BASE_LIGHTNESS_DARK = 0.31;

// ── sRGB ↔ Linear sRGB ──────────────────────────────────────────────────────

function srgbToLinear(c: number): number {
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
	return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// ── Hex ↔ sRGB ───────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
	hex = hex.replace(/^#/, '');
	if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
	const n = parseInt(hex, 16);
	return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

function rgbToHex(r: number, g: number, b: number): string {
	const toHex = (c: number) =>
		Math.round(Math.max(0, Math.min(1, c)) * 255)
			.toString(16)
			.padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ── Linear sRGB ↔ OKLab ─────────────────────────────────────────────────────

function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
	const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
	const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
	const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

	const l_ = Math.cbrt(l);
	const m_ = Math.cbrt(m);
	const s_ = Math.cbrt(s);

	return [
		0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
		1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
		0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
	];
}

function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;

	const l = l_ * l_ * l_;
	const m = m_ * m_ * m_;
	const s = s_ * s_ * s_;

	return [
		+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	];
}

// ── Public conversions ───────────────────────────────────────────────────────

export function hexToOklch(hex: string): OklchColor {
	const [r, g, b] = hexToRgb(hex);
	const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
	const [L, a, bLab] = linearRgbToOklab(lr, lg, lb);

	const c = Math.sqrt(a * a + bLab * bLab);
	let h = Math.atan2(bLab, a) * (180 / Math.PI);
	if (h < 0) h += 360;

	return { l: L, c, h };
}

export function oklchToHex(color: OklchColor): string {
	const { l, c, h } = color;
	const hRad = (h * Math.PI) / 180;
	const a = c * Math.cos(hRad);
	const b = c * Math.sin(hRad);

	const [lr, lg, lb] = oklabToLinearRgb(l, a, b);
	return rgbToHex(linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb));
}

export function oklchToCssString(color: OklchColor): string {
	const l = (color.l * 100).toFixed(3);
	const c = color.c.toFixed(3);
	const h = color.h.toFixed(3);
	return `oklch(${l}% ${c} ${h})`;
}

export function withAlpha(oklchCss: string, alpha: number): string {
	// oklch(59% 0.145 163.225) → oklch(59% 0.145 163.225 / 0.12)
	return oklchCss.replace(')', ` / ${alpha})`);
}

// ── Color derivation ─────────────────────────────────────────────────────────

function clamp(min: number, val: number, max: number): number {
	return Math.min(max, Math.max(min, val));
}

export function generateContentColor(base: OklchColor, mode: 'light' | 'dark'): OklchColor {
	if (mode === 'light') {
		// Light content on medium-lightness backgrounds → very light, low chroma
		return { l: 0.97, c: base.c * 0.15, h: base.h };
	}
	// Dark mode semantic colors are bright → content must be dark for contrast
	return { l: clamp(0.15, base.l * 0.22, 0.42), c: base.c * 0.5, h: base.h };
}

export function generateDarkVariant(lightColor: OklchColor): OklchColor {
	return {
		l: clamp(0.7, 1.0 - lightColor.l + 0.25, 0.88),
		c: lightColor.c,
		h: lightColor.h
	};
}

// ── sRGB gamut ───────────────────────────────────────────────────────────────

function isInSrgbGamut(l: number, c: number, h: number): boolean {
	const hRad = (h * Math.PI) / 180;
	const [r, g, b] = oklabToLinearRgb(l, c * Math.cos(hRad), c * Math.sin(hRad));
	const e = 1e-6;
	return r >= -e && r <= 1 + e && g >= -e && g <= 1 + e && b >= -e && b <= 1 + e;
}

/**
 * The largest chroma that still lands inside sRGB at this lightness and hue.
 *
 * OKLCH is not a box. At L=0.98 sRGB holds barely 0.010 chroma at blue hues but
 * 0.058 at yellow-green, and at L=0.20 that flips — 0.131 at violet against
 * 0.035 at cyan. So an absolute chroma means something different at every hue
 * and every lightness, which is why the base scale used to be a table of
 * hand-picked constants pinned to one hue: anything larger clipped to grey.
 *
 * Expressing the tint as a *share* of this value instead makes one "Base
 * Saturation" control mean the same thing everywhere, and puts a genuinely
 * tinted surface within reach rather than only the near-white end of it.
 *
 * Bisection, not a closed form: the cusp solution is long, and 24 halvings of
 * [0, 0.4] resolve to well under a 24-bit step. The low end of the bracket is
 * always in gamut, so the returned value is too.
 */
export function maxChromaFor(l: number, h: number): number {
	if (!(l > 0) || l >= 1) return 0;
	let lo = 0;
	let hi = 0.4;
	for (let i = 0; i < 24; i++) {
		const mid = (lo + hi) / 2;
		if (isInSrgbGamut(l, mid, h)) lo = mid;
		else hi = mid;
	}
	return lo;
}

// ── Base & neutral scale ─────────────────────────────────────────────────────

interface BaseColors {
	base100: OklchColor;
	base200: OklchColor;
	base300: OklchColor;
	baseContent: OklchColor;
}

/**
 * Per-role multipliers on the saturation input, in units of "share of the gamut
 * at this role's own lightness".
 *
 * Measured against the shipped `defaults/theme.css`: at hue 248 every light
 * role sits at ~0.30 of its gamut, so they are all 1.0 and the 0.30 default
 * reproduces the shipped theme. Dark surfaces sit near 0.13 — the same share
 * reads far stronger against a dark ground — so they carry 0.45, and dark text
 * lands between the two.
 */
const TINT_SHARE = {
	lightSurface: 1,
	lightContent: 1,
	darkSurface: 0.45,
	darkContent: 0.88
};

/** Lightness steps from `base-100` down to `-200` / `-300`, per mode. */
const SURFACE_STEPS = {
	light: [0, -0.02, -0.06],
	dark: [0, -0.03, -0.05]
} as const;

function tinted(l: number, h: number, share: number): OklchColor {
	const hue = ((h % 360) + 360) % 360;
	return { l, c: clamp(0, share, 1) * maxChromaFor(l, hue), h: hue };
}

export function generateBaseScale(
	hue: number,
	saturation: number = DEFAULT_BASE_SATURATION,
	lightnessLight: number = DEFAULT_BASE_LIGHTNESS_LIGHT,
	lightnessDark: number = DEFAULT_BASE_LIGHTNESS_DARK
): { light: BaseColors; dark: BaseColors } {
	const s = clamp(0, saturation, 1);
	const [lMin, lMax] = BASE_LIGHTNESS_LIGHT_RANGE;
	const [dMin, dMax] = BASE_LIGHTNESS_DARK_RANGE;
	const lightL = clamp(lMin, lightnessLight, lMax);
	const darkL = clamp(dMin, lightnessDark, dMax);

	return {
		light: {
			base100: tinted(lightL + SURFACE_STEPS.light[0], hue, s * TINT_SHARE.lightSurface),
			base200: tinted(lightL + SURFACE_STEPS.light[1], hue, s * TINT_SHARE.lightSurface),
			base300: tinted(lightL + SURFACE_STEPS.light[2], hue + 8, s * TINT_SHARE.lightSurface),
			baseContent: tinted(0.2, hue + 18, s * TINT_SHARE.lightContent)
		},
		dark: {
			base100: tinted(darkL + SURFACE_STEPS.dark[0], hue + 16, s * TINT_SHARE.darkSurface),
			base200: tinted(darkL + SURFACE_STEPS.dark[1], hue + 16, s * TINT_SHARE.darkSurface),
			base300: tinted(darkL + SURFACE_STEPS.dark[2], hue + 14, s * TINT_SHARE.darkSurface),
			baseContent: tinted(0.83, hue - 25, s * TINT_SHARE.darkContent)
		}
	};
}

function generateNeutral(
	hue: number,
	saturation: number = DEFAULT_BASE_SATURATION
): { light: OklchColor; dark: OklchColor } {
	const s = clamp(0, saturation, 1);
	return {
		light: tinted(0.44, hue + 9, s * TINT_SHARE.lightSurface),
		dark: tinted(0.25, hue + 16, s * TINT_SHARE.darkSurface)
	};
}

function generateNeutralContent(base: { light: BaseColors; dark: BaseColors }): {
	light: OklchColor;
	dark: OklchColor;
} {
	// Text on `neutral` is the lightest surface in light mode and the base text
	// colour in dark mode, so it follows the scale rather than restating it.
	return {
		light: base.light.base100,
		dark: base.dark.baseContent
	};
}

// ── Graph tokens (fixed) ─────────────────────────────────────────────────────

const GRAPH_LIGHT = {
	graphBg: 'transparent',
	graphWatermarkOpacity: '0.08',
	graphGridMajor: 'rgba(0, 0, 0, 0.15)',
	graphGridMinor: 'rgba(0, 0, 0, 0.06)',
	graphAxisLabel: 'rgba(0, 0, 0, 0.6)',
	graphGridText: 'rgba(0, 0, 0, 0.5)',
	graphBaseline: 'rgba(0, 0, 0, 0.25)'
};

const GRAPH_DARK = {
	graphBg: 'transparent',
	graphWatermarkOpacity: '0.08',
	graphGridMajor: 'rgba(255, 255, 255, 0.15)',
	graphGridMinor: 'rgba(255, 255, 255, 0.06)',
	graphAxisLabel: 'rgba(255, 255, 255, 0.6)',
	graphGridText: 'rgba(255, 255, 255, 0.5)',
	graphBaseline: 'rgba(255, 255, 255, 0.25)'
};

// ── Full palette generation ──────────────────────────────────────────────────

function semanticPair(hex: string, mode: 'light' | 'dark'): { color: string; content: string } {
	const oklch = hexToOklch(hex);
	const variant = mode === 'light' ? oklch : generateDarkVariant(oklch);
	const content = generateContentColor(variant, mode);
	return {
		color: oklchToCssString(variant),
		content: oklchToCssString(content)
	};
}

export function generateFullPalette(inputs: PaletteInputs): {
	light: ThemePalette;
	dark: ThemePalette;
} {
	const base = generateBaseScale(
		inputs.baseHue,
		inputs.baseSaturation,
		inputs.baseLightnessLight,
		inputs.baseLightnessDark
	);
	const neutral = generateNeutral(inputs.baseHue, inputs.baseSaturation);
	const neutralContent = generateNeutralContent(base);

	function buildPalette(mode: 'light' | 'dark'): ThemePalette {
		const b = mode === 'light' ? base.light : base.dark;
		const n = mode === 'light' ? neutral.light : neutral.dark;
		const nc = mode === 'light' ? neutralContent.light : neutralContent.dark;

		const primary = semanticPair(inputs.primary, mode);
		const secondary = semanticPair(inputs.secondary, mode);
		const accent = semanticPair(inputs.accent, mode);
		const info = semanticPair(inputs.info, mode);
		const success = semanticPair(inputs.success, mode);
		const warning = semanticPair(inputs.warning, mode);
		const error = semanticPair(inputs.error, mode);

		const graph = mode === 'light' ? GRAPH_LIGHT : GRAPH_DARK;

		return {
			base100: oklchToCssString(b.base100),
			base200: oklchToCssString(b.base200),
			base300: oklchToCssString(b.base300),
			baseContent: oklchToCssString(b.baseContent),
			primary: primary.color,
			primaryContent: primary.content,
			secondary: secondary.color,
			secondaryContent: secondary.content,
			accent: accent.color,
			accentContent: accent.content,
			neutral: oklchToCssString(n),
			neutralContent: oklchToCssString(nc),
			info: info.color,
			infoContent: info.content,
			success: success.color,
			successContent: success.content,
			warning: warning.color,
			warningContent: warning.content,
			error: error.color,
			errorContent: error.content,
			...graph
		};
	}

	return {
		light: buildPalette('light'),
		dark: buildPalette('dark')
	};
}

// ── Default input values ─────────────────────────────────────────────────────

export const DEFAULT_INPUTS: PaletteInputs = {
	baseHue: 248,
	baseSaturation: DEFAULT_BASE_SATURATION,
	baseLightnessLight: DEFAULT_BASE_LIGHTNESS_LIGHT,
	baseLightnessDark: DEFAULT_BASE_LIGHTNESS_DARK,
	primary: oklchToHex({ l: 0.59, c: 0.145, h: 163.225 }),
	secondary: oklchToHex({ l: 0.6, c: 0.126, h: 221.723 }),
	accent: oklchToHex({ l: 0.44, c: 0.017, h: 285.786 }),
	info: oklchToHex({ l: 0.68, c: 0.169, h: 237.323 }),
	success: oklchToHex({ l: 0.76, c: 0.233, h: 130.85 }),
	warning: oklchToHex({ l: 0.79, c: 0.184, h: 86.047 }),
	error: oklchToHex({ l: 0.64, c: 0.246, h: 16.439 })
};
