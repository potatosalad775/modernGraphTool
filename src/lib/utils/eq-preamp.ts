import { Equalizer, type EQFilter } from './equalizer.js';
import { effectiveFilters } from './eq-channel.js';

/** 1/48 octave, 20 Hz to 20 kHz: where the preamp looks for the largest boost. */
const PREAMP_GRID = Array.from({ length: 480 }, (_, i) => 20 * Math.pow(1000, i / 479));

/**
 * The preamp for a filter list: minus the largest boost the enabled bands
 * apply, so the EQ can't clip. Nothing sets the preamp by hand — AutoEQ
 * included — so this has to be right for any filter a fit can return.
 */
export function derivePreamp(filters: EQFilter[]): number {
	const enabled = filters.filter((f) => f.enabled && f.freq && f.q && f.gain);
	if (!enabled.length) return 0;
	// Every band's own centre is sampled too: a narrow boost peaks there, and
	// a grid that straddles it under-reads the peak — by up to 0.9 dB at Q 6
	// on the 100-point grid this used to be, which clipped by exactly that.
	const freqs = [...PREAMP_GRID, ...enabled.map((f) => f.freq!)];
	const baseFR: [number, number][] = freqs.map((f) => [f, 0]);
	const eq = new Equalizer();
	// One global preamp, sized for the ear that needs the most headroom.
	// Taking the worst case is what keeps the louder channel from clipping;
	// with no per-channel bands both sides compute the same number, so this
	// is the old value exactly.
	const perEar = (['L', 'R'] as const).map((ch) =>
		eq.calculatePreamp(baseFR, effectiveFilters(enabled, ch))
	);
	return parseFloat(Math.min(...perEar).toFixed(1));
}
