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
  primary: string;   // hex
  secondary: string;
  accent: string;
  info: string;
  success: string;
  warning: string;
  error: string;
}

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
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
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
    l: clamp(0.70, 1.0 - lightColor.l + 0.25, 0.88),
    c: lightColor.c,
    h: lightColor.h,
  };
}

// ── Base & neutral scale ─────────────────────────────────────────────────────

interface BaseColors {
  base100: OklchColor;
  base200: OklchColor;
  base300: OklchColor;
  baseContent: OklchColor;
}

export function generateBaseScale(hue: number): { light: BaseColors; dark: BaseColors } {
  return {
    light: {
      base100: { l: 0.98, c: 0.003, h: hue },
      base200: { l: 0.96, c: 0.007, h: hue },
      base300: { l: 0.92, c: 0.013, h: hue + 8 },
      baseContent: { l: 0.20, c: 0.042, h: hue + 18 },
    },
    dark: {
      base100: { l: 0.31, c: 0.023, h: hue + 16 },
      base200: { l: 0.28, c: 0.019, h: hue + 16 },
      base300: { l: 0.26, c: 0.018, h: hue + 14 },
      baseContent: { l: 0.83, c: 0.031, h: hue - 25 },
    },
  };
}

function generateNeutral(hue: number): { light: OklchColor; dark: OklchColor } {
  return {
    light: { l: 0.44, c: 0.043, h: hue + 9 },
    dark: { l: 0.25, c: 0.02, h: hue + 16 },
  };
}

function generateNeutralContent(hue: number): { light: OklchColor; dark: OklchColor } {
  return {
    light: { l: 0.98, c: 0.003, h: hue },
    dark: { l: 0.83, c: 0.031, h: hue - 25 },
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
  graphBaseline: 'rgba(0, 0, 0, 0.25)',
};

const GRAPH_DARK = {
  graphBg: 'transparent',
  graphWatermarkOpacity: '0.08',
  graphGridMajor: 'rgba(255, 255, 255, 0.15)',
  graphGridMinor: 'rgba(255, 255, 255, 0.06)',
  graphAxisLabel: 'rgba(255, 255, 255, 0.6)',
  graphGridText: 'rgba(255, 255, 255, 0.5)',
  graphBaseline: 'rgba(255, 255, 255, 0.25)',
};

// ── Full palette generation ──────────────────────────────────────────────────

function semanticPair(
  hex: string,
  mode: 'light' | 'dark',
): { color: string; content: string } {
  const oklch = hexToOklch(hex);
  const variant = mode === 'light' ? oklch : generateDarkVariant(oklch);
  const content = generateContentColor(variant, mode);
  return {
    color: oklchToCssString(variant),
    content: oklchToCssString(content),
  };
}

export function generateFullPalette(
  inputs: PaletteInputs,
): { light: ThemePalette; dark: ThemePalette } {
  const base = generateBaseScale(inputs.baseHue);
  const neutral = generateNeutral(inputs.baseHue);
  const neutralContent = generateNeutralContent(inputs.baseHue);

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
      ...graph,
    };
  }

  return {
    light: buildPalette('light'),
    dark: buildPalette('dark'),
  };
}

// ── Default input values ─────────────────────────────────────────────────────

export const DEFAULT_INPUTS: PaletteInputs = {
  baseHue: 248,
  primary: oklchToHex({ l: 0.59, c: 0.145, h: 163.225 }),
  secondary: oklchToHex({ l: 0.60, c: 0.126, h: 221.723 }),
  accent: oklchToHex({ l: 0.44, c: 0.017, h: 285.786 }),
  info: oklchToHex({ l: 0.68, c: 0.169, h: 237.323 }),
  success: oklchToHex({ l: 0.76, c: 0.233, h: 130.85 }),
  warning: oklchToHex({ l: 0.79, c: 0.184, h: 86.047 }),
  error: oklchToHex({ l: 0.64, c: 0.246, h: 16.439 }),
};
