/**
 * Listening-range (frequency-selection mode) helpers.
 *
 * The range band is built from a 2nd-order Butterworth highpass at `fromHz` and a
 * matching lowpass at `toHz`. Those roll off gradually rather than switching on at
 * the corner, so a frequency sitting *inside* the selected band still loses level —
 * and the narrower the band, the more the two roll-offs overlap in the middle. Users
 * read that as "selecting a range turns the volume down", which is the opposite of
 * what a selection is supposed to mean.
 *
 * {@link rangeMakeupGain} returns the compensating gain that puts the band's center
 * back at unity.
 */

/** Q of the highpass/lowpass pair — Butterworth, i.e. maximally flat, no resonance. */
export const RANGE_FILTER_Q = 0.707;

/**
 * Constrain a frequency to the selected band.
 *
 * Single-frequency sources are gated by *moving* them rather than by filtering them, so
 * "the band is the region you're auditioning" holds for every source without a bandpass
 * that could only ever attenuate them. This is the tone's case — one frequency pulled to
 * the nearest edge. A sweep is **not** two calls to this: clamping its endpoints
 * independently collapses both onto the same edge whenever the new band clears the old
 * one, so the sweep takes the band as its span outright (`#syncSweepToRange`).
 */
export function clampToBand(hz: number, fromHz: number, toHz: number): number {
	const lo = Math.min(fromHz, toHz);
	const hi = Math.max(fromHz, toHz);
	return Math.min(Math.max(hz, lo), hi);
}

/**
 * Makeup gain (linear) that restores unity at the geometric center of [fromHz, toHz].
 *
 * For a Butterworth (Q = 1/√2) pair, magnitude at the center works out to the same
 * value for both filters. With `k² = toHz / fromHz`, the center sits at `k` times the
 * highpass corner and `1/k` times the lowpass corner, giving
 *
 *     |H_hp| = |H_lp| = k² / √(1 + k⁴)
 *
 * so the combined loss is `k⁴ / (1 + k⁴)` and the compensating gain reduces to
 *
 *     1 + (fromHz / toHz)²
 *
 * That is inherently bounded: it tends to 1 (0 dB) for a wide band and to 2 (+6 dB)
 * as the band closes, so no clamp is needed to keep the output from blowing up.
 */
export function rangeMakeupGain(fromHz: number, toHz: number): number {
	const lo = Math.min(fromHz, toHz);
	const hi = Math.max(fromHz, toHz);
	if (!(lo > 0) || !(hi > 0)) return 1;
	const ratio = lo / hi;
	return 1 + ratio * ratio;
}
