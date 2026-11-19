import type { PaletteInputs } from './oklch';

/**
 * Inputs at the ends of every range: black and white fills, both slider
 * extremes, zero and full saturation. Shared by the palette and the CSS specs,
 * so both check the same corners.
 */
export const EXTREME_INPUTS: PaletteInputs[] = [
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
