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
	graphCompare: string;
	// Overlay (fixed per mode)
	scrim: string;
	// Rating: the rank stars in the device list
	rating: string;
}

export interface GeneratedTheme {
	light: ThemePalette;
	dark: ThemePalette;
	/** What each mode becomes under `prefers-contrast: more`. Full palettes, not overrides. */
	contrast: { light: ThemePalette; dark: ThemePalette };
}

/** The seven colours an operator picks, in the order the generator lists them. */
export const ROLES = [
	'primary',
	'secondary',
	'accent',
	'info',
	'success',
	'warning',
	'error'
] as const;
export type Role = (typeof ROLES)[number];

/**
 * The roles the app also sets as text on the base surfaces. Warning is not one:
 * amber only stays amber while it is light, so it carries a dark ink instead.
 */
const TEXT_ROLES: ReadonlySet<Role> = new Set(ROLES.filter((role) => role !== 'warning'));

/** WCAG 2.x contrast for body text: AA, and the AAA that `prefers-contrast: more` aims at. */
export const WCAG_AA = 4.5;
export const WCAG_AAA = 7;

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

/**
 * The colour exactly as `oklchToCssString` writes it. Every palette colour is
 * snapped to this before anything measures it, so a contrast the generator
 * checked is the contrast the exported file has: three decimals of chroma move a
 * ratio by up to 0.001, enough to land a 7:1 fill at 6.999:1.
 */
function asWritten({ l, c, h }: OklchColor): OklchColor {
	const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
	return { l: round(l, 5), c: round(c, 3), h: round(h, 3) };
}

export function withAlpha(oklchCss: string, alpha: number): string {
	// oklch(59% 0.145 163.225) → oklch(59% 0.145 163.225 / 0.12)
	return oklchCss.replace(')', ` / ${alpha})`);
}

// ── Color derivation ─────────────────────────────────────────────────────────

function clamp(min: number, val: number, max: number): number {
	return Math.min(max, Math.max(min, val));
}

/** WCAG 2.x relative luminance of an OKLCH colour, clipped to sRGB. */
function relativeLuminance({ l, c, h }: OklchColor): number {
	const hRad = (h * Math.PI) / 180;
	const [r, g, b] = oklabToLinearRgb(l, c * Math.cos(hRad), c * Math.sin(hRad));
	const clip = (v: number) => Math.min(1, Math.max(0, v));
	return 0.2126 * clip(r) + 0.7152 * clip(g) + 0.0722 * clip(b);
}

export function contrastRatio(a: OklchColor, b: OklchColor): number {
	const [x, y] = [relativeLuminance(a), relativeLuminance(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
}

/** The two inks a light-mode fill can carry. */
function lightModeInks(base: OklchColor): { light: OklchColor; dark: OklchColor } {
	return {
		light: { l: 0.98, c: base.c * 0.1, h: base.h },
		dark: { l: 0.24, c: base.c * 0.3, h: base.h }
	};
}

export function generateContentColor(base: OklchColor, mode: 'light' | 'dark'): OklchColor {
	if (mode === 'light') {
		// Light ink on a dark fill, dark ink on a light one: whichever reads better.
		// A fixed light ink left amber and lime fills at under 2:1.
		const { light, dark } = lightModeInks(base);
		return contrastRatio(light, base) >= contrastRatio(dark, base) ? light : dark;
	}
	// Dark mode semantic colors are bright → content must be dark for contrast
	return { l: clamp(0.15, base.l * 0.22, 0.42), c: base.c * 0.5, h: base.h };
}

export function generateDarkVariant(lightColor: OklchColor): OklchColor {
	return {
		l: clamp(0.8, 1.0 - lightColor.l + 0.25, 0.88),
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
 * surface sits at ~0.30 of its gamut, so it is 1.0 and the 0.30 default
 * reproduces the shipped theme. Dark surfaces sit near 0.13 — the same share
 * reads far stronger against a dark ground — so they carry 0.45. The text
 * colours are the odd ones out: at L 17% sRGB holds so little chroma that the
 * shipped 0.042 is 1.2 times the share. Dark text stays at 1 — at L 93% a
 * larger share would clamp and stop responding to the saturation slider.
 */
const TINT_SHARE = {
	lightSurface: 1,
	lightContent: 1.2,
	darkSurface: 0.45,
	darkContent: 1
};

/** Lightness steps from `base-100` down to `-200` / `-300`, per mode. */
const SURFACE_STEPS = {
	light: [0, -0.02, -0.06],
	dark: [0, -0.03, -0.05]
} as const;

function wrapHue(h: number): number {
	return ((h % 360) + 360) % 360;
}

function tinted(l: number, h: number, share: number): OklchColor {
	const hue = wrapHue(h);
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
			baseContent: tinted(0.17, hue + 18, s * TINT_SHARE.lightContent)
		},
		dark: {
			base100: tinted(darkL + SURFACE_STEPS.dark[0], hue + 16, s * TINT_SHARE.darkSurface),
			base200: tinted(darkL + SURFACE_STEPS.dark[1], hue + 16, s * TINT_SHARE.darkSurface),
			base300: tinted(darkL + SURFACE_STEPS.dark[2], hue + 14, s * TINT_SHARE.darkSurface),
			baseContent: tinted(0.93, hue - 25, s * TINT_SHARE.darkContent)
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

// ── Fixed tokens ─────────────────────────────────────────────────────────────

type Mode = 'light' | 'dark';

type FixedTokens = Pick<
	ThemePalette,
	| 'graphBg'
	| 'graphWatermarkOpacity'
	| 'graphGridMajor'
	| 'graphGridMinor'
	| 'graphAxisLabel'
	| 'graphGridText'
	| 'graphBaseline'
	| 'graphCompare'
	| 'scrim'
>;

/** The veil behind dialogs, the mobile menu and the guided tour: 40% black in both modes. */
const SCRIM = 'oklch(0% 0 0 / 40%)';

const FIXED: Record<Mode, FixedTokens> = {
	light: {
		graphBg: 'transparent',
		graphWatermarkOpacity: '0.08',
		graphGridMajor: 'rgba(0, 0, 0, 0.15)',
		graphGridMinor: 'rgba(0, 0, 0, 0.06)',
		graphAxisLabel: 'rgba(0, 0, 0, 0.7)',
		graphGridText: 'rgba(0, 0, 0, 0.58)',
		graphBaseline: 'rgba(0, 0, 0, 0.25)',
		graphCompare: 'rgba(0, 0, 0, 0.55)',
		scrim: SCRIM
	},
	dark: {
		graphBg: 'transparent',
		graphWatermarkOpacity: '0.08',
		graphGridMajor: 'rgba(255, 255, 255, 0.15)',
		graphGridMinor: 'rgba(255, 255, 255, 0.06)',
		graphAxisLabel: 'rgba(255, 255, 255, 0.72)',
		graphGridText: 'rgba(255, 255, 255, 0.6)',
		graphBaseline: 'rgba(255, 255, 255, 0.25)',
		graphCompare: 'rgba(255, 255, 255, 0.55)',
		scrim: SCRIM
	}
};

/**
 * What `prefers-contrast: more` sets whatever the inputs: base-content at pure
 * black / white, which every text step, border and divider derives from, and a
 * heavier graph grid. The shipped `defaults/theme.css` values.
 */
const CONTRAST_FIXED: Record<
	Mode,
	Pick<
		ThemePalette,
		| 'baseContent'
		| 'graphGridMajor'
		| 'graphGridMinor'
		| 'graphAxisLabel'
		| 'graphGridText'
		| 'graphBaseline'
	>
> = {
	light: {
		baseContent: 'oklch(0% 0 0)',
		graphGridMajor: 'rgba(0, 0, 0, 0.4)',
		graphGridMinor: 'rgba(0, 0, 0, 0.2)',
		graphAxisLabel: 'rgba(0, 0, 0, 1)',
		graphGridText: 'rgba(0, 0, 0, 0.9)',
		graphBaseline: 'rgba(0, 0, 0, 0.6)'
	},
	dark: {
		baseContent: 'oklch(100% 0 0)',
		graphGridMajor: 'rgba(255, 255, 255, 0.4)',
		graphGridMinor: 'rgba(255, 255, 255, 0.2)',
		graphAxisLabel: 'rgba(255, 255, 255, 1)',
		graphGridText: 'rgba(255, 255, 255, 0.9)',
		graphBaseline: 'rgba(255, 255, 255, 0.6)'
	}
};

// ── Contrast solver ──────────────────────────────────────────────────────────

/**
 * Moves a colour's lightness in `direction` until its ratio against every colour
 * in `against` reaches `target`, and stops at the first lightness that does, so
 * the colour changes no more than the target needs. It keeps its share of the
 * sRGB gamut rather than its chroma: the gamut narrows toward black and white,
 * and a fixed chroma would clip there and shift hue.
 *
 * A colour that already passes comes back as the same object, so it writes out
 * as the same string and the contrast block leaves it out. A target out of reach
 * returns the end of the range, black or white.
 *
 * The bar it solves to is `target` plus `PAINT_MARGIN`. A browser paints 8 bits
 * per channel, and that rounding moves the ratio of the painted pixels by up to
 * 0.07 either way (measured in Chrome: a pair solved to exactly 7:1 painted at
 * 6.93:1 to 7.04:1). The rounding differs between renderers, so it cannot be
 * computed here; the margin keeps the painted pair above the target instead.
 */
const PAINT_MARGIN = 0.1;

function pushLightness(
	color: OklchColor,
	direction: -1 | 1,
	against: OklchColor[],
	target: number
): OklchColor {
	const bar = target + PAINT_MARGIN;
	const passes = (candidate: OklchColor) =>
		against.every((other) => contrastRatio(candidate, other) >= bar);
	if (passes(color)) return color;

	const ceiling = maxChromaFor(color.l, color.h);
	const share = ceiling > 0 ? Math.min(1, color.c / ceiling) : 0;
	const at = (l: number) => asWritten({ l, c: share * maxChromaFor(l, color.h), h: color.h });

	let near = color.l;
	let far = direction < 0 ? 0 : 1;
	for (let i = 0; i < 24; i++) {
		const mid = (near + far) / 2;
		if (passes(at(mid))) far = mid;
		else near = mid;
	}
	return at(far);
}

// ── Full palette generation ──────────────────────────────────────────────────

/** One mode's colours as numbers, before they are written out. */
interface ModeColors extends BaseColors {
	neutral: OklchColor;
	neutralContent: OklchColor;
	fills: Record<Role, OklchColor>;
	contents: Record<Role, OklchColor>;
	rating: OklchColor;
}

function mapRoles<T>(derive: (role: Role) => T): Record<Role, T> {
	return Object.fromEntries(ROLES.map((role) => [role, derive(role)])) as Record<Role, T>;
}

/**
 * A darkened yellow reads as olive, so the rating turns toward orange as well:
 * the shipped rating sits 11° from the shipped warning.
 */
const RATING_HUE_SHIFT = -11;

/** The rank stars: the warning amber, darkened until it reads as text on the surfaces. */
function lightRating(warning: OklchColor, base: BaseColors): OklchColor {
	const seed = asWritten({ ...warning, h: wrapHue(warning.h + RATING_HUE_SHIFT) });
	return pushLightness(seed, -1, [base.base100, base.base200], WCAG_AA);
}

function deriveColors(inputs: PaletteInputs): Record<Mode, ModeColors> {
	const scale = generateBaseScale(
		inputs.baseHue,
		inputs.baseSaturation,
		inputs.baseLightnessLight,
		inputs.baseLightnessDark
	);
	const neutral = generateNeutral(inputs.baseHue, inputs.baseSaturation);
	const neutralContent = generateNeutralContent(scale);

	function derive(mode: Mode): ModeColors {
		const base: BaseColors = {
			base100: asWritten(scale[mode].base100),
			base200: asWritten(scale[mode].base200),
			base300: asWritten(scale[mode].base300),
			baseContent: asWritten(scale[mode].baseContent)
		};
		const picked = mapRoles((role) => {
			const color = hexToOklch(inputs[role]);
			return mode === 'light' ? color : generateDarkVariant(color);
		});
		const fills = mapRoles((role) => asWritten(picked[role]));
		return {
			...base,
			neutral: asWritten(neutral[mode]),
			neutralContent: asWritten(neutralContent[mode]),
			fills,
			// From the unrounded fill, so a content colour writes out as it did before snapping.
			contents: mapRoles((role) => asWritten(generateContentColor(picked[role], mode))),
			// Dark mode keeps the warning itself, as the shipped theme does.
			rating: mode === 'light' ? lightRating(fills.warning, base) : fills.warning
		};
	}

	return { light: derive('light'), dark: derive('dark') };
}

/**
 * The light fills under `prefers-contrast: more`. Each moves away from its
 * -content until it clears 7:1 against it. A fill that darkens is also text on
 * the light surface, so it clears 7:1 on base-100 too; a fill with a dark ink
 * lightens instead, since it was never readable as text on a light surface.
 */
function contrastLight(colors: ModeColors): ModeColors {
	const surface = colors.base100;
	const fills = mapRoles((role) => {
		const fill = colors.fills[role];
		const content = colors.contents[role];
		const direction = fill.l >= content.l ? 1 : -1;
		const awayFromSurface = Math.sign(fill.l - surface.l) === direction;
		return pushLightness(
			fill,
			direction,
			awayFromSurface ? [content, surface] : [content],
			WCAG_AAA
		);
	});
	const rating = pushLightness(colors.rating, -1, [colors.base100, colors.base200], WCAG_AAA);
	return { ...colors, fills, rating };
}

/**
 * The dark fills lighten against their own -content only. Not against the
 * surface: the Dark Surface slider reaches L 0.46, where 7:1 on it is out of reach.
 */
function contrastDark(colors: ModeColors): ModeColors {
	const fills = mapRoles((role) =>
		pushLightness(colors.fills[role], 1, [colors.contents[role]], WCAG_AAA)
	);
	return { ...colors, fills };
}

function toPalette(colors: ModeColors, fixed: FixedTokens): ThemePalette {
	const css = oklchToCssString;
	const { fills, contents } = colors;
	return {
		base100: css(colors.base100),
		base200: css(colors.base200),
		base300: css(colors.base300),
		baseContent: css(colors.baseContent),
		primary: css(fills.primary),
		primaryContent: css(contents.primary),
		secondary: css(fills.secondary),
		secondaryContent: css(contents.secondary),
		accent: css(fills.accent),
		accentContent: css(contents.accent),
		neutral: css(colors.neutral),
		neutralContent: css(colors.neutralContent),
		info: css(fills.info),
		infoContent: css(contents.info),
		success: css(fills.success),
		successContent: css(contents.success),
		warning: css(fills.warning),
		warningContent: css(contents.warning),
		error: css(fills.error),
		errorContent: css(contents.error),
		rating: css(colors.rating),
		...fixed
	};
}

export function generateFullPalette(inputs: PaletteInputs): GeneratedTheme {
	const { light, dark } = deriveColors(inputs);
	return {
		light: toPalette(light, FIXED.light),
		dark: toPalette(dark, FIXED.dark),
		contrast: {
			light: { ...toPalette(contrastLight(light), FIXED.light), ...CONTRAST_FIXED.light },
			dark: { ...toPalette(contrastDark(dark), FIXED.dark), ...CONTRAST_FIXED.dark }
		}
	};
}

// ── Contrast readout ─────────────────────────────────────────────────────────

/** `content`: the fill behind its own -content. `surface`: the fill as text on base-100. */
export type ContrastPairing = 'content' | 'surface';

export interface PairingContrast {
	ratio: number;
	pairing: ContrastPairing;
}

/**
 * Per role, the weakest light-mode pairing the app relies on: every fill carries
 * its -content, and every role but warning is also text on base-100. Light mode,
 * because that is where the fills sit closest to the 4.5:1 line.
 */
export function worstLightPairings(inputs: PaletteInputs): Record<Role, PairingContrast> {
	const { light } = deriveColors(inputs);
	return mapRoles((role) => {
		const fill = light.fills[role];
		const content: PairingContrast = {
			ratio: contrastRatio(fill, light.contents[role]),
			pairing: 'content'
		};
		if (!TEXT_ROLES.has(role)) return content;
		const surface: PairingContrast = {
			ratio: contrastRatio(fill, light.base100),
			pairing: 'surface'
		};
		return surface.ratio < content.ratio ? surface : content;
	});
}

// ── Randomizer ───────────────────────────────────────────────────────────────

interface RandomBand {
	/** Centre and full width of the hue band, or `null` for any hue. */
	hue: [centre: number, width: number] | null;
	lightness: [number, number];
	/** Share of the sRGB gamut at the rolled hue and lightness, as in `maxChromaFor`. */
	share: [number, number];
}

/**
 * Where each role starts before it is pushed to contrast. A start already past
 * 4.5:1 stays where it is, so the lightness bands straddle that line: some rolls
 * come back darker than they need to be, which is the variety.
 */
const RANDOM_BANDS: Record<Role, RandomBand> = {
	primary: { hue: null, lightness: [0.35, 0.62], share: [0.3, 1] },
	secondary: { hue: null, lightness: [0.35, 0.62], share: [0.3, 1] },
	accent: { hue: [280, 60], lightness: [0.38, 0.55], share: [0.04, 0.25] },
	info: { hue: [220, 40], lightness: [0.42, 0.62], share: [0.6, 1] },
	success: { hue: [130, 40], lightness: [0.42, 0.62], share: [0.6, 1] },
	warning: { hue: [75, 30], lightness: [0.75, 0.88], share: [0.7, 1] },
	error: { hue: [15, 20], lightness: [0.42, 0.62], share: [0.6, 1] }
};

/**
 * Pushes a rolled fill until the pairings `worstLightPairings` checks hold.
 * The text roles darken under a light ink and clear the surface as well; warning
 * lightens away from its dark ink. The ink takes its chroma from the fill, so it
 * shifts once the fill moves, and the second pass settles against the moved ink.
 */
function settle(rolled: OklchColor, role: Role, surface: OklchColor): OklchColor {
	const text = TEXT_ROLES.has(role);
	const against = (fill: OklchColor) => {
		const { light, dark } = lightModeInks(fill);
		return text ? [light, surface] : [dark];
	};
	const once = pushLightness(rolled, text ? -1 : 1, against(rolled), WCAG_AA);
	return pushLightness(once, text ? -1 : 1, against(once), WCAG_AA);
}

/**
 * Rolls the base hue, base saturation and all seven roles, keeping the surface
 * lightness the operator set. Every role comes back at 4.5:1 or better against
 * its light -content, and every role but warning at 4.5:1 or better as text on
 * the base-100 the rolled base tone produces. Warning stays a light amber.
 */
export function randomizeInputs(
	current: PaletteInputs,
	random: () => number = Math.random
): PaletteInputs {
	const roll = ([lo, hi]: [number, number]) => lo + random() * (hi - lo);
	const baseHue = Math.floor(random() * 360);
	// Rolled too, or every random theme comes back on the same near-white
	// surface. Bounded well short of 1: past ~0.7 the surfaces stop reading as
	// chrome and start competing with the curves.
	const baseSaturation = roll([0.1, 0.6]);
	const surface = asWritten(
		generateBaseScale(
			baseHue,
			baseSaturation,
			current.baseLightnessLight,
			current.baseLightnessDark
		).light.base100
	);
	const roles = mapRoles((role) => {
		const band = RANDOM_BANDS[role];
		const h = band.hue ? wrapHue(band.hue[0] + (random() - 0.5) * band.hue[1]) : random() * 360;
		const l = roll(band.lightness);
		const c = roll(band.share) * maxChromaFor(l, h);
		return oklchToHex(settle({ l, c, h }, role, surface));
	});
	return { ...current, baseHue, baseSaturation, ...roles };
}

// ── Default input values ─────────────────────────────────────────────────────

export const DEFAULT_INPUTS: PaletteInputs = {
	baseHue: 248,
	baseSaturation: DEFAULT_BASE_SATURATION,
	baseLightnessLight: DEFAULT_BASE_LIGHTNESS_LIGHT,
	baseLightnessDark: DEFAULT_BASE_LIGHTNESS_DARK,
	primary: oklchToHex({ l: 0.52, c: 0.111, h: 163.225 }),
	secondary: oklchToHex({ l: 0.53, c: 0.098, h: 221.723 }),
	accent: oklchToHex({ l: 0.44, c: 0.017, h: 285.786 }),
	info: oklchToHex({ l: 0.53, c: 0.115, h: 237.323 }),
	success: oklchToHex({ l: 0.525, c: 0.143, h: 130.85 }),
	warning: oklchToHex({ l: 0.8, c: 0.16, h: 86.047 }),
	error: oklchToHex({ l: 0.56, c: 0.2, h: 16.439 })
};
