import type { EQFilter } from './equalizer.js';
import { Equalizer } from './equalizer.js';

/**
 * K-weighted (ITU-R BS.1770-4) bypass-match — the gain applied to the bypass
 * audio path when "Apply EQ" is toggled off, so the bypassed signal carries
 * the same perceived loudness as the EQ-on path.
 *
 * Why K-weighted: the K filter (high-shelf at ~1681 Hz + high-pass at ~38 Hz)
 * approximates human loudness perception across the band; it's the basis of
 * LUFS / LKFS used by every modern streaming-loudness target. For mild EQ
 * curves a flat-energy or pink-weighted match gives a similar number, but
 * for aggressive corrections (±10 dB shelves, deep notches) K-weighting is
 * the part that doesn't over- or under-correct.
 *
 * The integration assumes a roughly pink (~1/f) source spectrum, which is a
 * reasonable proxy for music. Because we sample on a log-spaced frequency
 * grid, that 1/f weighting is implicit — sampling uniformly in log f is
 * equivalent to weighting linear-f integration by 1/f.
 *
 * No tunable blend constant. The bypass match is the full computed delta;
 * caller can choose to apply or skip it but we do not artificially under-
 * correct based on curve magnitude.
 */

const N_SAMPLES = 200;
const F_MIN = 20;
const F_MAX = 20000;

/** Log-spaced test frequencies (20 Hz – 20 kHz, 200 points). */
const TEST_FREQS = ((): number[] => {
	const arr = new Array<number>(N_SAMPLES);
	const ratio = F_MAX / F_MIN;
	for (let i = 0; i < N_SAMPLES; i++) {
		arr[i] = F_MIN * Math.pow(ratio, i / (N_SAMPLES - 1));
	}
	return arr;
})();

/**
 * BS.1770-4 K-weighting filter, expressed as a cascade of two biquads.
 * Coefficients reference rate is 48 kHz; we use these to compute |K(f)|² in
 * the digital frequency domain at our test grid. The exact rate matters far
 * less than the overall shelf+HPF shape for a perceptual weighting.
 */
const K_FS = 48000;

interface BiquadCoefs {
	b0: number;
	b1: number;
	b2: number;
	a1: number;
	a2: number;
}

const K_STAGE1: BiquadCoefs = {
	b0: 1.53512485958697,
	b1: -2.69169618940638,
	b2: 1.19839281085285,
	a1: -1.69065929318241,
	a2: 0.73248077421585
};

const K_STAGE2: BiquadCoefs = {
	b0: 1.0,
	b1: -2.0,
	b2: 1.0,
	a1: -1.99004745483398,
	a2: 0.99007225036621
};

/**
 * |H(e^jω)|² for a normalized biquad H(z) = (b0 + b1 z⁻¹ + b2 z⁻²)
 *                                          / (1 + a1 z⁻¹ + a2 z⁻²).
 * Closed-form magnitude squared from the cosine identities — avoids two
 * complex evaluations per sample.
 */
function biquadMagSquared(c: BiquadCoefs, omega: number): number {
	const cos1 = Math.cos(omega);
	const cos2 = Math.cos(2 * omega);
	const num =
		c.b0 * c.b0 +
		c.b1 * c.b1 +
		c.b2 * c.b2 +
		2 * (c.b0 * c.b1 + c.b1 * c.b2) * cos1 +
		2 * c.b0 * c.b2 * cos2;
	const den = 1 + c.a1 * c.a1 + c.a2 * c.a2 + 2 * (c.a1 + c.a1 * c.a2) * cos1 + 2 * c.a2 * cos2;
	return num / den;
}

/** Precomputed |K(f)|² at each test frequency. */
const K_MAG_SQ = TEST_FREQS.map((f) => {
	const omega = (2 * Math.PI * f) / K_FS;
	return biquadMagSquared(K_STAGE1, omega) * biquadMagSquared(K_STAGE2, omega);
});

/** Σ |K(f)|² — the K-weighted reference for a flat (unity) chain. */
const K_FLAT_SUM = K_MAG_SQ.reduce((a, b) => a + b, 0);

const eq = new Equalizer();

/**
 * Bypass-match gain in dB — the trim to apply to the bypass path so that
 * playback loudness matches what the EQ-on path produces.
 *
 * - Returns `0` when no EQ filters are active (nothing to match).
 * - Sign: positive when EQ + preamp produces a louder signal than flat
 *   (so bypass needs the same boost), negative when EQ is quieter.
 *
 * @param filters Active EQ filter list — only enabled, well-formed entries are used
 * @param preampDb Preamp gain (dB) applied before the filter chain
 */
export function computeBypassMatchDb(filters: EQFilter[], preampDb: number): number {
	const active = filters.filter(
		(f) => f.enabled && f.freq != null && f.q != null && f.gain != null
	);
	if (!active.length) return 0;

	const eqGainsDb = eq.calculateGainsFromFilter(TEST_FREQS, active);
	const preampLin = Math.pow(10, preampDb / 20);

	let eqSum = 0;
	for (let i = 0; i < TEST_FREQS.length; i++) {
		const eqMagLin = Math.pow(10, eqGainsDb[i] / 20) * preampLin;
		eqSum += eqMagLin * eqMagLin * K_MAG_SQ[i];
	}

	const ratio = eqSum / K_FLAT_SUM;
	return 10 * Math.log10(ratio);
}

/**
 * Linear bypass-match gain — for direct application to a Web Audio
 * `GainNode.gain` value. Wrapper around {@link computeBypassMatchDb}.
 */
export function computeBypassMatchLinear(filters: EQFilter[], preampDb: number): number {
	return Math.pow(10, computeBypassMatchDb(filters, preampDb) / 20);
}
