/**
 * Curve color palette utilities.
 *
 * Picks the next color for a graph curve in two tiers:
 *  1. A curated palette (operator-configured or Okabe-Ito default).
 *  2. OKLCH golden-angle generation with farthest-point sampling against
 *     all already-used colors.
 *
 * All public output is an `oklch(L C H)` string. Inputs may be hex, oklch, hsl,
 * or rgb — anything that resolves through the browser is normalized to OKLCH
 * via a sRGB → OKLab pipeline (Björn Ottosson's reference math).
 */

const OKABE_ITO_HEX = [
	'#0072B2',
	'#E69F00',
	'#009E73',
	'#CC79A7',
	'#56B4E9',
	'#D55E00',
	'#F0E442',
	'#000000'
] as const;

const GOLDEN_ANGLE_DEG = 137.508;
const DEFAULT_GEN_L = 0.68;
const DEFAULT_GEN_C = 0.16;
const PALETTE_DEDUP_THRESHOLD = 0.1;

// ── OKLCH ↔ sRGB conversion (Björn Ottosson) ────────────────────────────────

function srgbToLinear(c: number): number {
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
	return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

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
	const l = l_ ** 3;
	const m = m_ ** 3;
	const s = s_ ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	];
}

function oklabToOklch(L: number, a: number, b: number): [number, number, number] {
	const C = Math.hypot(a, b);
	let H = (Math.atan2(b, a) * 180) / Math.PI;
	if (H < 0) H += 360;
	return [L, C, H];
}

function oklchToOklab(L: number, C: number, H: number): [number, number, number] {
	const rad = (H * Math.PI) / 180;
	return [L, C * Math.cos(rad), C * Math.sin(rad)];
}

// ── Public conversion helpers ──────────────────────────────────────────────

export function hexToOklch(hex: string): [number, number, number] {
	const h = hex.replace(/^#/, '');
	const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
	const r = srgbToLinear(parseInt(full.slice(0, 2), 16) / 255);
	const g = srgbToLinear(parseInt(full.slice(2, 4), 16) / 255);
	const b = srgbToLinear(parseInt(full.slice(4, 6), 16) / 255);
	const [L, a, bLab] = linearRgbToOklab(r, g, b);
	return oklabToOklch(L, a, bLab);
}

export function oklchToHex(L: number, C: number, H: number): string {
	const [LL, a, b] = oklchToOklab(L, C, H);
	const [lr, lg, lb] = oklabToLinearRgb(LL, a, b);
	const toHex = (c: number) => {
		const v = Math.max(0, Math.min(1, linearToSrgb(c)));
		return Math.round(v * 255)
			.toString(16)
			.padStart(2, '0');
	};
	return `#${toHex(lr)}${toHex(lg)}${toHex(lb)}`;
}

export function formatOklch(L: number, C: number, H: number): string {
	const rL = Math.round(L * 1000) / 1000;
	const rC = Math.round(C * 1000) / 1000;
	const rH = Math.round(H * 10) / 10;
	return `oklch(${rL} ${rC} ${rH})`;
}

const OKLCH_RE = /oklch\(\s*([0-9.+-]+)\s+([0-9.+-]+)\s+([0-9.+-]+)/i;

export function parseOklch(color: string): [number, number, number] {
	const m = color.match(OKLCH_RE);
	if (m) return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
	if (color.startsWith('#')) return hexToOklch(color);
	// Fallback: round-trip through a canvas for hsl()/rgb()/named colors.
	const hex = anyColorToHex(color);
	return hex ? hexToOklch(hex) : [DEFAULT_GEN_L, DEFAULT_GEN_C, 0];
}

function anyColorToHex(color: string): string | null {
	if (typeof document === 'undefined') return null;
	const ctx = document.createElement('canvas').getContext('2d');
	if (!ctx) return null;
	ctx.fillStyle = '#000';
	ctx.fillStyle = color;
	const v = ctx.fillStyle;
	return typeof v === 'string' && v.startsWith('#') ? v : null;
}

// ── Distance ───────────────────────────────────────────────────────────────

function oklabDistance(a: [number, number, number], b: [number, number, number]): number {
	const [L1, a1, b1] = oklchToOklab(...a);
	const [L2, a2, b2] = oklchToOklab(...b);
	return Math.hypot(L1 - L2, a1 - a2, b1 - b2);
}

// ── Default palette (lazy-converted) ───────────────────────────────────────

let _okabeItoOklch: [number, number, number][] | null = null;
function okabeItoOklch(): [number, number, number][] {
	if (!_okabeItoOklch) _okabeItoOklch = OKABE_ITO_HEX.map(hexToOklch);
	return _okabeItoOklch;
}

// ── nextCurveColor ─────────────────────────────────────────────────────────

export interface NextCurveColorOptions {
	isTarget?: boolean;
}

export function nextCurveColor(
	usedColors: string[],
	palette?: string[],
	opts: NextCurveColorOptions = {}
): string {
	if (opts.isTarget) return formatOklch(0.65, 0, 0);

	const usedOklch = usedColors.map(parseOklch);
	const paletteSource = palette && palette.length > 0 ? palette.map(parseOklch) : okabeItoOklch();

	// Tier 1: palette — first entry far enough from every used color.
	for (const candidate of paletteSource) {
		const minDist = usedOklch.length
			? Math.min(...usedOklch.map((u) => oklabDistance(candidate, u)))
			: Infinity;
		if (minDist > PALETTE_DEDUP_THRESHOLD) {
			return formatOklch(...candidate);
		}
	}

	// Tier 2: OKLCH golden-angle generation, farthest-point selection.
	const baseHue =
		usedOklch.length > 0 ? (usedOklch[usedOklch.length - 1][2] + GOLDEN_ANGLE_DEG) % 360 : 0;

	const lcSteps: [number, number][] = [
		[DEFAULT_GEN_L, DEFAULT_GEN_C],
		[DEFAULT_GEN_L - 0.1, DEFAULT_GEN_C],
		[DEFAULT_GEN_L + 0.1, DEFAULT_GEN_C - 0.04],
		[DEFAULT_GEN_L - 0.2, DEFAULT_GEN_C - 0.04]
	];

	let best: [number, number, number] = [DEFAULT_GEN_L, DEFAULT_GEN_C, baseHue];
	let bestMinDist = -Infinity;

	for (const [L, C] of lcSteps) {
		for (let i = 0; i < 24; i++) {
			const H = (baseHue + i * GOLDEN_ANGLE_DEG) % 360;
			const candidate: [number, number, number] = [L, C, H];
			const minDist = usedOklch.length
				? Math.min(...usedOklch.map((u) => oklabDistance(candidate, u)))
				: Infinity;
			if (minDist > bestMinDist) {
				bestMinDist = minDist;
				best = candidate;
			}
		}
	}

	return formatOklch(...best);
}
