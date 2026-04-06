/**
 * IIR biquad coefficient computation for device handlers.
 *
 * Walkplay and Moondrop devices require client-side biquad coefficient
 * computation. They use different formulas (gain/20 vs gain/40 for amplitude)
 * so both variants are preserved exactly as-is.
 */

const QUANTIZATION_FACTOR = 1073741824; // 2^30
const SAMPLE_RATE = 96000;
const TWO_PI = 2 * Math.PI;

/**
 * Walkplay-style biquad: amplitude = 10^(gain/20).
 * Returns 5 quantized 30-bit fixed-point coefficients [b0, b1, b2, -a1, -a2].
 */
export function computeWalkplayBiquad(freq: number, gain: number, q: number): number[] {
	const sqrt = Math.sqrt(Math.pow(10, gain / 20));
	const d3 = (freq * TWO_PI) / SAMPLE_RATE;
	const sin = Math.sin(d3) / (2 * q);
	const d4 = sin * sqrt;
	const d5 = sin / sqrt;
	const d6 = d5 + 1;

	const a = [1, (Math.cos(d3) * -2) / d6, (1 - d5) / d6];
	const b = [(d4 + 1) / d6, (Math.cos(d3) * -2) / d6, (1 - d4) / d6];

	return [
		Math.round(b[0] * QUANTIZATION_FACTOR),
		Math.round(b[1] * QUANTIZATION_FACTOR),
		Math.round(b[2] * QUANTIZATION_FACTOR),
		Math.round(-a[1] * QUANTIZATION_FACTOR),
		Math.round(-a[2] * QUANTIZATION_FACTOR)
	];
}

/**
 * Moondrop-style biquad: amplitude = 10^(gain/40) (Audio EQ Cookbook peaking).
 * Returns 5 quantized 30-bit fixed-point coefficients [b0, b1, b2, a1, -a2].
 */
export function computeMoondropBiquad(freq: number, gain: number, q: number): number[] {
	const A = Math.pow(10, gain / 40);
	const w0 = (TWO_PI * freq) / SAMPLE_RATE;
	const alpha = Math.sin(w0) / (2 * q);
	const cosW0 = Math.cos(w0);
	const norm = 1 + alpha / A;

	const b0 = (1 + alpha * A) / norm;
	const b1 = (-2 * cosW0) / norm;
	const b2 = (1 - alpha * A) / norm;
	const a1 = -b1;
	const a2 = (1 - alpha / A) / norm;

	return [b0, b1, b2, a1, -a2].map((c) => Math.round(c * QUANTIZATION_FACTOR));
}

/**
 * Serialize 5 biquad coefficients into a 20-byte little-endian Uint8Array.
 * Used by both Walkplay and Moondrop handlers.
 */
export function biquadCoeffsToBytes(coeffs: number[]): Uint8Array {
	const arr = new Uint8Array(20);
	for (let i = 0; i < coeffs.length; i++) {
		const val = coeffs[i];
		arr[i * 4] = val & 0xff;
		arr[i * 4 + 1] = (val >> 8) & 0xff;
		arr[i * 4 + 2] = (val >> 16) & 0xff;
		arr[i * 4 + 3] = (val >> 24) & 0xff;
	}
	return arr;
}
