/**
 * The AutoEQ request vocabulary — what a caller asks for, with no engine
 * behind it.
 *
 * Separate from `autoeq-engine.ts` so the UI can describe a run without
 * pulling the wasm module into the main bundle: only the worker ever loads
 * that. Everything here is data plus one pure function.
 */

import type { TurboEQBandLimits } from '@potatosalad775/turboeq';
import type { EQFilter } from '$lib/utils/equalizer.js';

/**
 * The cap for a preset that says "unlimited": a fit has to be asked for a
 * finite number of bands, and 32 is past what a listener can hear apart.
 *
 * turboEQ's `MAX_FILTERS`, written out rather than imported. Importing any
 * value from the package pulls `TurboEQ.load()` into the main build, and Vite
 * emits the two wasm files its `new URL(..., import.meta.url)` names before
 * tree-shaking drops the code that would fetch them. `autoeq-engine.spec.ts`
 * holds the two numbers together.
 */
export const MAX_BANDS = 32;

/**
 * Per-band bounds. Q and gain are intersected with AutoEq's own defaults;
 * frequency is too, except in exact-match mode, which lets a band reach 20 kHz.
 */
export type BandLimits = TurboEQBandLimits;

/** The band the error is scored over — *not* where filters may sit. */
export interface LossBand {
	minF?: number;
	maxF?: number;
}

/**
 * How the curve is read before it is fitted.
 *
 * - `'exact'` fits the shape of the curve on the graph, to 20 kHz: no treble
 *   smoothing, no slope limit, error scored at every frequency. This is what
 *   the CrinGraph-lineage engine always did, and what a user comparing the
 *   EQ'd curve against the target on screen expects.
 * - `'autoeq'` is AutoEq's own caution: the treble smoothed over two octaves,
 *   the correction held to 18 dB/oct, only the mean level scored above
 *   10 kHz, and no band placed above 10 kHz — because bands up there, scored
 *   on the mean alone, cancel each other at extreme gains.
 *
 * In both, the correction's largest boost is capped at the gain range's
 * maximum — AutoEq's own 6 dB only when no maximum is given.
 */
export type FitMode = 'exact' | 'autoeq';

/**
 * What to fit. The two shapes are the two things a constraint preset can
 * describe, and neither carries a number that means two different things.
 */
export type AutoEqRequest =
	| {
			kind: 'parametric';
			/** Peaking bands. The shelves below are **not** counted here. */
			peaking: number;
			/** Add a low shelf at 105 Hz and a high shelf at 10 kHz, gain free. */
			shelves: boolean;
			/** Where a band may sit and how far it may go. */
			limits?: BandLimits;
			/** Gain window for the shelves, if it differs from `limits`. */
			shelfLimits?: BandLimits;
			loss?: LossBand;
			/** Defaults to `'exact'`. */
			fit?: FitMode;
	  }
	| {
			kind: 'graphic';
			/** The sliders, in order. fc and Q are pinned to these. */
			bands: { freq: number; q?: number }[];
			/** How far each slider may travel. */
			gain?: { min?: number; max?: number };
			loss?: LossBand;
			/** Defaults to `'exact'`. */
			fit?: FitMode;
	  };

/**
 * Why turboEQ did not answer. The two call for different things from the UI.
 *
 * - `'unavailable'`: the module never loaded. Nothing turboEQ-only means
 *   anything until it does, so the fit-mode control goes away.
 * - `'rejected'`: it loaded and refused this request — treble-safe with a
 *   frequency window entirely above 10 kHz, say. The control has to stay:
 *   switching it is often how the user gets turboEQ back.
 */
export type FallbackCause = 'unavailable' | 'rejected';

export interface AutoEqOutcome {
	/** Empty, and not to be written anywhere, when `engine` is `'none'`. */
	filters: EQFilter[];
	/**
	 * Which optimizer produced them. `'typescript'` means turboEQ failed and the
	 * fallback fitted instead; `'none'` means turboEQ failed on a request the
	 * fallback cannot express — a graphic EQ, whose fc and Q it would not keep.
	 */
	engine: 'turboeq' | 'typescript' | 'none';
	/** Fit error against the equalization curve, dB. turboEQ only. */
	rmse?: number;
	/** What a player's preamp should be set to, dB. Never positive. */
	preamp?: number;
	/** Set whenever `engine` is not `'turboeq'`. */
	fallback?: FallbackCause;
	/** turboEQ's own error message, when it failed. */
	fallbackReason?: string;
}

/**
 * Split a row budget into turboEQ's peaking count and its two shelves.
 *
 * mGT counts every row a device or preset allows, shelves included; turboEQ
 * counts peaking bands and treats the shelves as being outside that number.
 * The subtraction is real — it lives in the host's model, not in the API — so
 * it happens here, once, where it can be tested, rather than at every call
 * site where getting it wrong still produces a plausible-looking EQ.
 *
 * A budget of two with shelves asked for is two shelves and no peaking band,
 * which fits nothing; one peaking band beats that, so shelves are dropped
 * below four rows.
 */
export function planBands(
	budget: number,
	wantShelves: boolean
): { peaking: number; shelves: boolean } {
	const rows = Math.max(1, Math.floor(budget));
	const shelves = wantShelves && rows >= 4;
	return { peaking: shelves ? rows - 2 : rows, shelves };
}

/** How many rows a request asks for, which is what the caller gets back. */
export function bandCount(request: AutoEqRequest): number {
	return request.kind === 'graphic'
		? request.bands.length
		: request.peaking + (request.shelves ? 2 : 0);
}
