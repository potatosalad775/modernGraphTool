/**
 * AutoEQ engine — turboEQ (wasm) with the TypeScript optimizer as fallback.
 *
 * Two optimizers exist and they are not the same algorithm. `utils/equalizer.ts`
 * is the CrinGraph lineage: greedy coordinate descent, one filter at a time on a
 * quantized frequency grid, no perceptual stage. turboEQ is a Zig port of the
 * original AutoEq — gradient-based joint optimization of every parameter at
 * once, behind a perceptual stage that smooths, protects narrow dips, limits
 * slope to 18 dB/oct and caps the correction's largest boost.
 *
 * turboEQ runs two orders of magnitude faster, and from eight bands up it fits
 * closer; the numbers are in the docs' autoeq-benchmarks page. It is also the
 * only one of the two that returns the band count it was asked for — the
 * TypeScript one drops bands in its prune pass, so "ask 8, get 7" is normal
 * there and impossible in turboEQ.
 *
 * **The request is in turboEQ's terms, not the old engine's.** `peaking` counts
 * peaking bands only and `shelves` adds two more, which is how AutoEq writes
 * `PEQ_CONFIGS['N_PEAKING_WITH_SHELVES']`; `planBands` is the one place that
 * turns a row budget into that split. Per-band limits are *bounds the fit lands
 * inside*, not a clamp applied to the answer afterwards, and a graphic EQ is a
 * bank with fc and Q pinned rather than a free fit snapped onto the grid.
 *
 * **Exact match is the default.** AutoEq reads the treble cautiously — smoothed
 * over two octaves, slope-limited, scored on its mean level only above 10 kHz —
 * and its objective also penalizes steep bands, smooths the target a fifth of
 * an octave and pins the level before fitting. That is right for a rig nobody
 * trusts up there and wrong for a user lining the EQ'd curve up against the
 * target on the graph. turboEQ's `fit: 'exact'` turns all of it off; see
 * `FitMode`.
 *
 * **The fallback fires on any failure, not just a missing module.** The
 * TypeScript engine tolerates input turboEQ rejects outright — a null source
 * curve optimizes against silence rather than throwing — and callers here
 * depend on that. The outcome says which of the two failures it was
 * (`FallbackCause`), because the UI answers them differently.
 *
 * **The fallback does not fit graphic EQs.** It has no pinned bank: it would
 * place bands freely and leave them off the preset's sliders, which is why
 * AutoEQ was unavailable in graphic mode before turboEQ. It still is whenever
 * turboEQ fails, and the outcome says so with `engine: 'none'`.
 */

import { Equalizer, type EQFilter } from '$lib/utils/equalizer.js';
import {
	bandCount,
	type AutoEqOutcome,
	type AutoEqRequest,
	type BandLimits,
	type FallbackCause,
	type FitMode,
	type LossBand
} from './autoeq-request.js';
import type {
	TurboEQ as TurboEQClass,
	TurboEQBankSpec,
	TurboEQFilter,
	TurboEQRunOptions
} from '@potatosalad775/turboeq';

/** Hz. mGT's chain runs at 48 kHz; AutoEq's own default is 44100. */
const SAMPLE_RATE = 48000;

/** turboEQ's filter kinds against mGT's. */
const TYPE_OF = { peaking: 'PK', low_shelf: 'LSQ', high_shelf: 'HSQ' } as const;

/**
 * The run options a request adds beyond its banks.
 *
 * **The boost cap is the user's gain ceiling, in both fit modes.** AutoEq caps
 * the correction curve's largest boost at 6 dB unless told otherwise, which
 * would make the gain range's maximum a number the fit silently ignores. It
 * was also most of what separated turboEQ from the CrinGraph-lineage engine,
 * whose only boost limit was that same ceiling: on the bundled sample set,
 * exact mode trailed the old engine against the raw target until the cap
 * moved, and beat it on seven of eight once it did. With no ceiling given,
 * AutoEq's stays.
 *
 * The boost this allows is headroom the preamp has to give back. `EqFilterList`
 * derives it from whatever filters are in the store, so a fit needs to do
 * nothing about it here.
 */
function runOptions(request: AutoEqRequest): TurboEQRunOptions {
	const ceiling = request.kind === 'graphic' ? request.gain?.max : request.limits?.maxGain;
	return {
		fit: fitMode(request),
		...(typeof ceiling === 'number' && Number.isFinite(ceiling)
			? { maxGain: Math.max(0, ceiling) }
			: {})
	};
}

let enginePromise: Promise<TurboEQClass> | null = null;

/**
 * The wasm module, instantiated once per worker. The import is dynamic so a
 * build that cannot resolve the asset — or a runtime with no `WebAssembly` —
 * fails here rather than at module load, where it would take the fallback down
 * with it.
 *
 * `load()` fetches the SIMD build where the engine runs it and the scalar one
 * elsewhere; the two return bit-identical fits. Vite emits both from the
 * package's own `new URL(..., import.meta.url)`, in dev as well as build.
 */
export async function loadTurboEq(): Promise<TurboEQClass> {
	if (!enginePromise) {
		enginePromise = import('@potatosalad775/turboeq').then(({ TurboEQ }) => TurboEQ.load());
		// A failed instantiation must not be cached: a transient fetch error
		// would otherwise pin every later run to the fallback.
		enginePromise.catch(() => {
			enginePromise = null;
		});
	}
	return enginePromise;
}

/** The banks `request` describes, built against the module's own defaults. */
export function buildBanks(eq: TurboEQClass, request: AutoEqRequest): TurboEQBankSpec[] {
	if (request.kind === 'graphic') {
		// Every slider can carry its own Q, so this is not `graphicBank`'s
		// single-Q shape; the bank is written out band by band. fc and Q are
		// supplied, which is how AutoEq's configs say "do not optimize this".
		const gain = request.gain ?? {};
		const bounds = eq.defaultLimits('peaking');
		const minGain = Math.max(gain.min ?? bounds.minGain, bounds.minGain);
		const maxGain = Math.min(gain.max ?? bounds.maxGain, bounds.maxGain);
		return [
			{
				filters: request.bands.map((band) => ({
					type: 'peaking' as const,
					fc: band.freq,
					q: band.q ?? Math.SQRT2,
					minGain,
					maxGain
				})),
				...lossBand(request.loss)
			}
		];
	}

	// The user's Q and gain windows are the bounds, as given. turboEQ's helpers
	// narrow a host's range to AutoEq's defaults unless told otherwise, which
	// turned a Q 0.1 to 10 request into 0.18 to 6 and a ±40 dB one into ±20
	// without a word. Only fc differs by mode: treble-safe keeps AutoEq's
	// 10 kHz ceiling, because its loss sees only the level above it and bands
	// up there would cancel each other; exact match scores the shape to the
	// top, so the user's window stands, 20 kHz by default.
	const peak = eq.defaultLimits('peaking');
	const limits = request.limits ?? {};
	const exact = fitMode(request) === 'exact';
	const bandLimits: Required<BandLimits> = {
		minFc: limits.minFc ?? peak.minFc,
		maxFc: exact ? (limits.maxFc ?? GRID_MAX_F) : Math.min(limits.maxFc ?? peak.maxFc, peak.maxFc),
		minQ: limits.minQ ?? peak.minQ,
		maxQ: limits.maxQ ?? peak.maxQ,
		minGain: limits.minGain ?? peak.minGain,
		maxGain: limits.maxGain ?? peak.maxGain
	};
	const bank = eq.peakingBank({
		peaking: request.peaking,
		shelves: request.shelves,
		shelfPlacement: 'free',
		limits: bandLimits,
		shelfLimits: shelfWindow(eq, bandLimits, request.shelfLimits),
		bounds: 'as-given'
	});
	return [{ ...bank, ...lossBand(request.loss) }];
}

/** The top of turboEQ's fitting grid, Hz. */
const GRID_MAX_F = 20000;

/**
 * Where the shelves may go. They are always free to move: pinning them at
 * 105 Hz and 10 kHz, as every AutoEq preset does, spends two bands on fixed
 * places, which is 40% of a five-band budget.
 *
 * fc takes the peaking bands' window. Q stays inside AutoEq's shelf window,
 * 0.4 to 0.7, narrowed by the user's: past 0.707 a shelf overshoots into a
 * bump, which is a peaking band's job. A user window that misses it
 * altogether pins Q at the nearest value the user allows.
 */
function shelfWindow(
	eq: TurboEQClass,
	band: Required<BandLimits>,
	given: BandLimits | undefined
): BandLimits {
	const shelf = eq.defaultLimits('low_shelf');
	let minQ = Math.max(shelf.minQ, band.minQ);
	let maxQ = Math.min(shelf.maxQ, band.maxQ);
	if (minQ > maxQ) {
		const q = Math.min(Math.max(shelf.maxQ, band.minQ), band.maxQ);
		minQ = maxQ = q;
	}
	return {
		minFc: band.minFc,
		maxFc: band.maxFc,
		minQ,
		maxQ,
		minGain: given?.minGain ?? band.minGain,
		maxGain: given?.maxGain ?? band.maxGain
	};
}

function fitMode(request: AutoEqRequest): FitMode {
	return request.fit ?? 'exact';
}

function lossBand(loss: LossBand | undefined): { minF?: number; maxF?: number } {
	if (!loss) return {};
	const out: { minF?: number; maxF?: number } = {};
	if (typeof loss.minF === 'number') out.minF = loss.minF;
	if (typeof loss.maxF === 'number') out.maxF = loss.maxF;
	return out;
}

/**
 * Fit `source` to `target`. Falls back to the TypeScript optimizer on any
 * failure, including one turboEQ raised deliberately.
 */
export async function runAutoEq(
	source: [number, number][],
	target: [number, number][],
	request: AutoEqRequest,
	deps: { loadEngine?: () => Promise<TurboEQClass> } = {}
): Promise<AutoEqOutcome> {
	let eq: TurboEQClass;
	try {
		eq = await (deps.loadEngine ?? loadTurboEq)();
	} catch (err) {
		return runFallback(source, target, request, 'unavailable', err);
	}
	try {
		const options: TurboEQRunOptions = {
			sampleRate: SAMPLE_RATE,
			...runOptions(request),
			banks: buildBanks(eq, request)
		};
		const result = eq.run(source, target, options);
		return {
			filters: toFilters(result.filters, request),
			engine: 'turboeq',
			rmse: result.rmse,
			preamp: result.preamp
		};
	} catch (err) {
		return runFallback(source, target, request, 'rejected', err);
	}
}

/**
 * turboEQ's filters as mGT rows: at the precision a filter card edits — whole
 * hertz, Q to 0.01, gain to 0.1 dB — and low to high, which is what the
 * TypeScript engine has always returned. The solver's full doubles would
 * otherwise reach the list, the export and the device as-is.
 *
 * A graphic bank's fc and Q are the preset's own, pinned rather than fitted,
 * so only gain is rounded there: 31.25 Hz rounded to 31 is off its slider.
 */
function toFilters(filters: TurboEQFilter[], request: AutoEqRequest): EQFilter[] {
	const pinned = request.kind === 'graphic';
	return filters
		.map((f) => ({
			enabled: true,
			type: TYPE_OF[f.type],
			freq: pinned ? f.fc : Math.round(f.fc),
			q: pinned ? f.q : Math.round(f.q * 100) / 100,
			gain: Math.round(f.gain * 10) / 10
		}))
		.sort((a, b) => a.freq - b.freq);
}

/**
 * The CrinGraph-lineage optimizer, asked for the same thing in the only terms
 * it has: one band count with the shelves inside it, and one frequency range
 * that means both "place no bands here" and "ignore error here".
 *
 * `fit` is not among them. The old engine has one mode, which is what exact
 * match reproduces, so a treble-safe request gets the fit it always got.
 */
function runFallback(
	source: [number, number][],
	target: [number, number][],
	request: AutoEqRequest,
	cause: FallbackCause,
	err: unknown
): AutoEqOutcome {
	const failed = {
		fallback: cause,
		fallbackReason: err instanceof Error ? err.message : String(err)
	};
	if (request.kind === 'graphic') return { filters: [], engine: 'none', ...failed };

	const limits = request.limits ?? {};
	const filters = new Equalizer().autoEQ(source, target, {
		maxFilters: bandCount(request),
		freqRange: [
			limits.minFc ?? request.loss?.minF ?? 20,
			limits.maxFc ?? request.loss?.maxF ?? 20000
		],
		qRange: [limits.minQ ?? 0.5, limits.maxQ ?? 2],
		gainRange: [limits.minGain ?? -12, limits.maxGain ?? 12],
		useShelfFilter: request.shelves
	});
	return { filters, engine: 'typescript', ...failed };
}
