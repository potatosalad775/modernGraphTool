import type { EQFilter } from './equalizer.js';
import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';

/**
 * Pure helpers that translate an `EqConstraintPreset` into actions on
 * `EQFilter` data — clamping into range, snapping to graphic bands, and
 * flagging out-of-range fields for UI styling.
 *
 * The store is the source of truth; these helpers are stateless, used by
 * eq-commands at write time and by EqFilterCard for violation hints.
 */

/** What's wrong with a filter, per field. All `false` means it's valid. */
export interface FilterViolation {
	type: boolean;
	freq: boolean;
	q: boolean;
	gain: boolean;
}

const PASS: FilterViolation = { type: false, freq: false, q: false, gain: false };

/** True if the constraint allows this filter type. */
export function isTypeAllowed(type: EQFilter['type'], preset: EqConstraintPreset): boolean {
	if (type === 'PK') return preset.allowPk;
	if (type === 'LSQ') return preset.allowLsq;
	if (type === 'HSQ') return preset.allowHsq;
	return false;
}

/** Pick the closest allowed type to `type` if `type` itself is disallowed. */
export function pickAllowedType(
	type: EQFilter['type'],
	preset: EqConstraintPreset
): EQFilter['type'] {
	if (isTypeAllowed(type, preset)) return type;
	if (preset.allowPk) return 'PK';
	if (preset.allowLsq) return 'LSQ';
	if (preset.allowHsq) return 'HSQ';
	// Pathological preset — no types allowed. Caller will clamp gain to 0
	// later; the type itself is unenforceable.
	return type;
}

/** Snap a frequency to the nearest band in a graphic-mode preset. */
export function snapToGraphicBand(
	freq: number,
	preset: EqConstraintPreset
): { freq: number; q: number } {
	const bands = preset.graphicBands;
	if (!bands || bands.length === 0) {
		return { freq, q: preset.qDefault ?? 1.0 };
	}
	let best = bands[0];
	let bestDelta = Math.abs(Math.log(freq / best.freq));
	for (const b of bands) {
		const delta = Math.abs(Math.log(freq / b.freq));
		if (delta < bestDelta) {
			best = b;
			bestDelta = delta;
		}
	}
	return { freq: best.freq, q: best.q ?? preset.qDefault ?? 1.0 };
}

/**
 * Clamp a filter into the preset's bounds. Returns a new filter object;
 * the input is not mutated. Null fields stay null (incomplete bands).
 */
export function clampFilterToConstraint(filter: EQFilter, preset: EqConstraintPreset): EQFilter {
	const out: EQFilter = { ...filter };

	out.type = pickAllowedType(out.type, preset);

	if (preset.mode === 'graphic') {
		// Graphic mode: snap freq + Q to nearest band.
		if (out.freq != null) {
			const snapped = snapToGraphicBand(out.freq, preset);
			out.freq = snapped.freq;
			out.q = snapped.q;
		}
		// Graphic bands always behave as PK.
		if (preset.allowPk) out.type = 'PK';
	} else {
		// Parametric: clamp freq + Q to ranges if specified.
		if (out.freq != null && preset.freqMin != null) {
			out.freq = Math.max(preset.freqMin, out.freq);
		}
		if (out.freq != null && preset.freqMax != null) {
			out.freq = Math.min(preset.freqMax, out.freq);
		}
		if (out.q != null && preset.qMin != null) {
			out.q = Math.max(preset.qMin, out.q);
		}
		if (out.q != null && preset.qMax != null) {
			out.q = Math.min(preset.qMax, out.q);
		}
	}

	if (out.gain != null) {
		out.gain = Math.max(preset.gainMin, Math.min(preset.gainMax, out.gain));
	}

	return out;
}

/** Per-field flags indicating which fields are out of preset range. */
export function getFilterViolation(filter: EQFilter, preset: EqConstraintPreset): FilterViolation {
	if (!filter.enabled) return PASS;

	const result: FilterViolation = { type: false, freq: false, q: false, gain: false };
	result.type = !isTypeAllowed(filter.type, preset);

	if (preset.mode === 'graphic') {
		if (filter.freq != null && preset.graphicBands) {
			const allowedFreqs = new Set(preset.graphicBands.map((b) => b.freq));
			result.freq = !allowedFreqs.has(filter.freq);
		}
	} else {
		if (filter.freq != null) {
			if (preset.freqMin != null && filter.freq < preset.freqMin) result.freq = true;
			if (preset.freqMax != null && filter.freq > preset.freqMax) result.freq = true;
		}
		if (filter.q != null) {
			if (preset.qMin != null && filter.q < preset.qMin) result.q = true;
			if (preset.qMax != null && filter.q > preset.qMax) result.q = true;
		}
	}

	if (filter.gain != null) {
		if (filter.gain < preset.gainMin || filter.gain > preset.gainMax) result.gain = true;
	}

	return result;
}

/** Whether `filter` index is past the preset's `maxBands` cap (0 = unlimited). */
export function isPastMaxBands(index: number, preset: EqConstraintPreset): boolean {
	return preset.maxBands > 0 && index >= preset.maxBands;
}

/**
 * Bulk-clamp every filter against a preset and trim to maxBands. Used when
 * the active preset changes — the user's existing filters get folded onto
 * the new shape instead of going out of range.
 */
export function clampFiltersToConstraint(
	filters: EQFilter[],
	preset: EqConstraintPreset
): EQFilter[] {
	const clamped = filters.map((f) => clampFilterToConstraint(f, preset));
	if (preset.maxBands > 0 && clamped.length > preset.maxBands) {
		return clamped.slice(0, preset.maxBands);
	}
	return clamped;
}
