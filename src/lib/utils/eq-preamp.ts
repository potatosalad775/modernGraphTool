import { Equalizer, type EQFilter } from './equalizer.js';
import { effectiveFilters } from './eq-channel.js';

/** 1/48 octave, 20 Hz to 20 kHz: where the preamp looks for the largest boost. */
const PREAMP_GRID = Array.from({ length: 480 }, (_, i) => 20 * Math.pow(1000, i / 479));

/**
 * The preamp for a filter list: minus the largest boost the enabled bands
 * apply, so the EQ can't clip. Nothing sets the preamp by hand — AutoEQ
 * included — so this has to be right for any filter a fit can return.
 *
 * Never positive: a cut-only list gets no make-up gain, so no EQ plays louder
 * than the source at any frequency. The peak rounds up to 0.1 dB, so the
 * rounding never gives back headroom. Both are uniPEQ's rule too, so a linked
 * list shows the same preamp on both sides (uniPEQ src/lib/eq/eq-preamp.ts).
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
	const peak = Math.max(0, -Math.min(...perEar));
	// The epsilon keeps an exact 6 dB peak at -6.0 rather than -6.1.
	return -Math.ceil(peak * 10 - 1e-6) / 10 || 0;
}
