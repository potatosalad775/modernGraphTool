/**
 * EQ constraint preset — describes the limits of an EQ editing context.
 *
 * Three orthogonal kinds, expressed by a single shape:
 *   - "Default" (unlimited parametric): no bands cap, full ranges. The starting
 *     preset for general-purpose EQ work.
 *   - Hardware parametric (e.g. Fiio EH11): caps maxBands and clamps freq / Q
 *     / gain to the device's allowed ranges.
 *   - Graphic EQ (e.g. generic 10-band): a fixed list of `graphicBands` where
 *     only `gain` is user-editable; `freq` and `q` are locked per band.
 *     Different bands can carry different Q values.
 *
 * Presets come from two places only: `BUILTIN_PRESETS` in eq-constraints-store
 * (Default unlimited PEQ + Generic 10-band), and a profile derived from a
 * hardware device the user connected. There is deliberately no operator-authored
 * catalog — see the note on `BUILTIN_PRESETS`.
 */
export interface EqConstraintGraphicBand {
	/** Center frequency (Hz). Locked — not user-editable in graphic mode. */
	freq: number;
	/** Per-band Q. Optional; falls back to the preset's `qDefault`, then 1.0. */
	q?: number;
}

export interface EqConstraintPreset {
	/** Unique ID. Later sources overriding the same id replace the earlier one. */
	id: string;
	/** Human-readable label shown in the picker. */
	label: string;
	/** "graphic" locks freq + q per band; "parametric" allows free editing within ranges. */
	mode: 'graphic' | 'parametric';
	/** Cap on filter rows. 0 = unlimited (parametric only). */
	maxBands: number;
	/** Allowed filter types (parametric only — graphic bands always behave as PK). */
	allowPk: boolean;
	allowLsq: boolean;
	allowHsq: boolean;
	/** Parametric mode — frequency range in Hz. Ignored when mode is graphic. */
	freqMin?: number;
	freqMax?: number;
	/** Graphic mode — fixed (freq, q) bands. Ignored when mode is parametric. */
	graphicBands?: EqConstraintGraphicBand[];
	/** Default Q used when a graphic band omits its `q`, or for parametric clamping. */
	qDefault?: number;
	/** Gain range in dB (always applies). */
	gainMin: number;
	gainMax: number;
	/** Parametric mode — Q range. Ignored when mode is graphic. */
	qMin?: number;
	qMax?: number;
	/**
	 * Forward-compat flag for per-channel L/R EQ. Always treated as `false`
	 * by the current code; reserved so future presets don't need re-authoring
	 * once 2-channel support lands.
	 */
	twoChannelSupport?: boolean;
}
