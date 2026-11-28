import { browser } from '$app/env';
import { SvelteMap } from 'svelte/reactivity';
import { Equalizer, type EQFilter } from '#lib/utils/equalizer.js';
import { getConfigValue, uniqueBy } from '#lib/utils/config.js';
import type { ParsedFRData } from '#lib/types/data-types.js';

export interface TargetFilterDef {
	id: string;
	name: string;
	type: 'TILT' | 'LSQ' | 'HSQ' | 'PK';
	freq: number;
	q: number;
	description?: string;
	/**
	 * Slider limits and step, in the filter's own unit. Each falls back to the type's default, and
	 * `filterGainRange` says what it accepts.
	 */
	min?: number;
	max?: number;
	step?: number;
}

export interface GainRange {
	min: number;
	max: number;
	step: number;
}

const TILT_RANGE: GainRange = { min: -2, max: 2, step: 0.1 };
const GAIN_RANGE: GainRange = { min: -20, max: 20, step: 0.5 };

/** The finest step a slider takes, and so the most decimals a gain is printed with (three). */
const FINEST_STEP = 0.001;
const MAX_DECIMALS = 3;

/** Steps tried, in order, when a filter sets none or sets one its limits cannot take. */
const FALLBACK_STEPS = [0.1, 0.01, FINEST_STEP];

/** Called with what was wrong in a filter's range, once per fault. */
type RangeReport = (problem: string) => void;

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

/** Whether `value` is a whole number of `step`s, within float noise. */
function isMultipleOf(value: number, step: number): boolean {
	const count = value / step;
	return Math.abs(count - Math.round(count)) < 1e-6;
}

/**
 * Whether a range input with this step can sit on 0 and on both limits. It counts its positions
 * from `min`, so `min` and `max` both have to be a whole number of steps away from 0.
 */
function stepFits(step: number, min: number, max: number): boolean {
	return (
		step >= FINEST_STEP && step <= max - min && isMultipleOf(min, step) && isMultipleOf(max, step)
	);
}

/**
 * The limits a filter asks for, each checked on its own so one bad key does not cost the other.
 * 0 is "this filter does nothing" and where a newly added filter starts, so it has to stay inside
 * the range: `min` may not be above it, `max` not below it.
 */
function resolveLimits(
	def: TargetFilterDef,
	base: GainRange,
	report?: RangeReport
): { min: number; max: number } {
	let { min, max } = base;
	if (def.min !== undefined) {
		if (isFiniteNumber(def.min) && def.min <= 0) min = def.min;
		else report?.(`min has to be a number at or below 0, using ${base.min}`);
	}
	if (def.max !== undefined) {
		if (isFiniteNumber(def.max) && def.max >= 0) max = def.max;
		else report?.(`max has to be a number at or above 0, using ${base.max}`);
	}
	if (min === max) {
		report?.(`min and max are both 0, using ${base.min} to ${base.max}`);
		return { min: base.min, max: base.max };
	}
	return { min, max };
}

/**
 * The slider range of a filter: the operator's `min` / `max` / `step` over the type's default.
 *
 * Whatever config.js holds, the result is a slider that moves, can sit on 0 and reaches both of
 * its limits. A key that would break that is dropped for the default (`report` hears why), and a
 * step that does not fit the limits gives way to the type's own, then to 0.1, 0.01 and 0.001.
 */
export function filterGainRange(def: TargetFilterDef, report?: RangeReport): GainRange {
	const base = def.type === 'TILT' ? TILT_RANGE : GAIN_RANGE;
	const { min, max } = resolveLimits(def, base, report);

	if (def.step !== undefined) {
		if (isFiniteNumber(def.step) && stepFits(def.step, min, max)) {
			return { min, max, step: def.step };
		}
		report?.(
			`step has to be at least ${FINEST_STEP}, no larger than max - min, and divide both ` +
				'min and max evenly, using the nearest default'
		);
	}
	const step = [base.step, ...FALLBACK_STEPS].find((candidate) => stepFits(candidate, min, max));
	if (step === undefined) {
		report?.(`min and max are finer than ${FINEST_STEP}, using ${base.min} to ${base.max}`);
		return base;
	}
	return { min, max, step };
}

/** How many decimals `value` needs to print exactly, up to `MAX_DECIMALS`. */
function decimalsOf(value: number): number {
	for (let decimals = 0; decimals < MAX_DECIMALS; decimals++) {
		if (isMultipleOf(value, 10 ** -decimals)) return decimals;
	}
	return MAX_DECIMALS;
}

/**
 * A filter's gain as the readout and the curve label print it: one decimal, or as many as the
 * filter's step or the value itself needs (a preset can sit off the slider's grid), so two
 * neighbouring slider positions never read the same. Not `formatGain` in `utils/log-scale.ts`,
 * which signs the number and takes no filter.
 */
export function formatFilterGain(def: TargetFilterDef, value: number): string {
	const { step } = filterGainRange(def);
	return value.toFixed(Math.max(1, decimalsOf(step), decimalsOf(value)));
}

export interface TargetFilterPreset {
	name: string;
	filter: Record<string, number>;
}

/**
 * Per-target slider state. Treated as immutable — every edit replaces the whole
 * record via `SvelteMap.set`, which is what drives reactivity for readers.
 */
export interface TargetAdjustment {
	/** Filter ids the user has added, in the order they were added. */
	activeIds: string[];
	/** Filter id → gain (dB, or dB/oct for a TILT filter). */
	values: Record<string, number>;
	/** Selected preset name; `''` when none. */
	preset: string;
}

/**
 * Filters offered when the operator doesn't specify `TARGET_CUSTOMIZER.FILTERS`.
 *
 * Kept to the four general-purpose controls. More specialized sets — the Harman
 * 2025 MoA filters, say — are a deployment choice rather than a default, and
 * ship as a commented example in `defaults/config.js`. Setting `FILTERS`
 * replaces this list outright, so an operator adding one filter has to restate
 * the ones they want to keep.
 */
const DEFAULT_FILTERS: TargetFilterDef[] = [
	{ id: 'tilt', name: 'Tilt (dB/oct)', type: 'TILT', freq: 0, q: 0 },
	{ id: 'bass', name: 'Bass (dB)', type: 'LSQ', freq: 105, q: 0.707 },
	{ id: 'treble', name: 'Treble (dB)', type: 'HSQ', freq: 2500, q: 0.42 },
	{ id: 'ear', name: 'Ear (dB)', type: 'PK', freq: 2750, q: 1 }
];

/** Presets offered when the operator doesn't specify `TARGET_CUSTOMIZER.FILTER_PRESET`. */
const DEFAULT_FILTER_PRESETS: TargetFilterPreset[] = [
	{ name: 'Harman 2013', filter: { bass: 6.6, treble: -1.4 } },
	{ name: 'Harman 2015', filter: { bass: 6.6, treble: -3, ear: -1.8 } },
	{ name: 'Harman 2018', filter: { bass: 4.8, treble: -4.4 } }
];

const EMPTY_ADJUSTMENT: TargetAdjustment = Object.freeze({
	activeIds: [],
	values: {},
	preset: ''
});

export function normalizeTargetName(name: string): string {
	const trimmed = name.trim();
	return trimmed.endsWith(' Target') ? trimmed : `${trimmed} Target`;
}

/**
 * TargetAdjustmentStore — Tilt / Bass / Treble / … slider state for customizable
 * targets, keyed by FR-data UUID.
 *
 * This state used to live inside `TargetCustomizer.svelte`, which renders through
 * `SelectionList` → `GraphPanel`. `AppShell` tears that subtree down on every panel
 * switch (`{#key menuStore.currentPanel}`), so the user's adjustments were discarded
 * and re-seeded from `INITIAL_TARGET_FILTERS` on the way back to the Graph tab.
 *
 * Holding the state here also lets `DataProvider` re-apply adjustments itself after
 * `reSmoothAll()` / `renormalizeAll()` rebuild a target from its raw source, instead
 * of depending on a mounted component to notice and re-apply them.
 */
class TargetAdjustmentStore {
	readonly #byUuid = new SvelteMap<string, TargetAdjustment>();
	readonly #eq = new Equalizer();

	// Operator config — read lazily, since `config.js` is a plain script tag and is
	// not present during prerender.
	#configLoaded = false;
	#customizableTargets: string[] = [];
	#availableFilters: TargetFilterDef[] = DEFAULT_FILTERS;
	#filterPresets: TargetFilterPreset[] = DEFAULT_FILTER_PRESETS;
	#initialFilters: { name: string; filter: Record<string, number> }[] = [];

	// ── Config ────────────────────────────────────────────────────────────────

	#loadConfig(): void {
		if (this.#configLoaded || !browser) return;
		this.#configLoaded = true;

		const cfg = getConfigValue('TARGET_CUSTOMIZER') as
			| {
					CUSTOMIZABLE_TARGETS?: string[];
					FILTERS?: TargetFilterDef[];
					FILTER_PRESET?: TargetFilterPreset[];
					INITIAL_TARGET_FILTERS?: { name: string; filter: Record<string, number> }[];
			  }
			| undefined;

		this.#customizableTargets = (cfg?.CUSTOMIZABLE_TARGETS ?? []).map(normalizeTargetName);
		this.#availableFilters = uniqueBy(
			cfg?.FILTERS ?? DEFAULT_FILTERS,
			(def) => def.id,
			'TARGET_CUSTOMIZER.FILTERS id'
		);
		// Say once, here, what a filter's range had wrong: `filterGainRange` runs on every render.
		for (const def of this.#availableFilters) {
			filterGainRange(def, (problem) => {
				console.warn(
					`[modernGraphTool] config.js: TARGET_CUSTOMIZER.FILTERS "${def.id}": ${problem}`
				);
			});
		}
		this.#filterPresets = uniqueBy(
			cfg?.FILTER_PRESET ?? DEFAULT_FILTER_PRESETS,
			(preset) => preset.name,
			'TARGET_CUSTOMIZER.FILTER_PRESET name'
		);
		this.#initialFilters = cfg?.INITIAL_TARGET_FILTERS ?? [];
	}

	get availableFilters(): TargetFilterDef[] {
		this.#loadConfig();
		return this.#availableFilters;
	}

	get filterPresets(): TargetFilterPreset[] {
		this.#loadConfig();
		return this.#filterPresets;
	}

	isCustomizable(identifier: string): boolean {
		this.#loadConfig();
		return this.#customizableTargets.includes(normalizeTargetName(identifier));
	}

	// ── Per-target state ──────────────────────────────────────────────────────

	get(uuid: string): TargetAdjustment {
		return this.#byUuid.get(uuid) ?? EMPTY_ADJUSTMENT;
	}

	has(uuid: string): boolean {
		return this.#byUuid.has(uuid);
	}

	delete(uuid: string): void {
		this.#byUuid.delete(uuid);
	}

	/**
	 * Put a record back as it was: undo and redo of an adjustment. `undefined` means the target had
	 * none, so the record goes (reading it then gives the empty stack). Stores a copy, so the
	 * command that handed it in keeps its own.
	 */
	restore(uuid: string, record: TargetAdjustment | undefined): void {
		if (record) this.#byUuid.set(uuid, structuredClone(record));
		else this.#byUuid.delete(uuid);
	}

	/**
	 * Register a target on first sight, seeding it from `INITIAL_TARGET_FILTERS`.
	 * Idempotent — a target that already has state (because the user adjusted it and
	 * then switched panels) keeps it.
	 */
	ensure(uuid: string, identifier: string): void {
		if (this.#byUuid.has(uuid)) return;
		this.#loadConfig();

		const normalized = normalizeTargetName(identifier);
		const initial = this.#initialFilters.find((f) => normalizeTargetName(f.name) === normalized);

		const activeIds: string[] = [];
		const values: Record<string, number> = {};
		if (initial) {
			for (const [id, value] of Object.entries(initial.filter)) {
				if (this.#availableFilters.some((f) => f.id === id)) {
					activeIds.push(id);
					values[id] = value;
				}
			}
		}
		this.#byUuid.set(uuid, { activeIds, values, preset: '' });
	}

	addFilter(uuid: string, id: string): void {
		const adj = this.get(uuid);
		if (adj.activeIds.includes(id)) return;
		this.#byUuid.set(uuid, {
			activeIds: [...adj.activeIds, id],
			values: { ...adj.values, [id]: 0 },
			preset: adj.preset
		});
	}

	removeFilter(uuid: string, id: string): void {
		const adj = this.get(uuid);
		const { [id]: _removed, ...values } = adj.values;
		this.#byUuid.set(uuid, {
			activeIds: adj.activeIds.filter((x) => x !== id),
			values,
			preset: adj.preset
		});
	}

	setValue(uuid: string, id: string, value: number): void {
		const adj = this.get(uuid);
		this.#byUuid.set(uuid, {
			activeIds: adj.activeIds,
			values: { ...adj.values, [id]: value },
			preset: adj.preset
		});
	}

	reset(uuid: string): void {
		this.#byUuid.set(uuid, { activeIds: [], values: {}, preset: '' });
	}

	applyPreset(uuid: string, presetName: string): void {
		this.#loadConfig();
		const preset = this.#filterPresets.find((p) => p.name === presetName);
		if (!preset) {
			this.#byUuid.set(uuid, { ...this.get(uuid), preset: presetName });
			return;
		}
		const activeIds: string[] = [];
		const values: Record<string, number> = {};
		for (const [id, value] of Object.entries(preset.filter)) {
			if (value !== 0 && this.#availableFilters.some((f) => f.id === id)) {
				activeIds.push(id);
				values[id] = value;
			}
		}
		this.#byUuid.set(uuid, { activeIds, values, preset: presetName });
	}

	// ── Derived output ────────────────────────────────────────────────────────

	/** True when the target has at least one filter contributing a non-zero gain. */
	hasActiveAdjustment(uuid: string): boolean {
		const adj = this.#byUuid.get(uuid);
		if (!adj) return false;
		return adj.activeIds.some((id) => (adj.values[id] ?? 0) !== 0);
	}

	/**
	 * Apply the target's tilt + shelf/peak stack to a set of pre-adjustment channels.
	 * Returns a copy of `original` when nothing is active, so callers can use the
	 * result unconditionally.
	 */
	adjustedChannels(uuid: string, original: ParsedFRData): ParsedFRData {
		this.#loadConfig();
		const adj = this.#byUuid.get(uuid);

		const eqFilters: EQFilter[] = [];
		let tilt = 0;
		if (adj) {
			for (const def of this.#availableFilters) {
				if (!adj.activeIds.includes(def.id)) continue;
				const value = adj.values[def.id] ?? 0;
				if (value === 0) continue;
				if (def.type === 'TILT') {
					tilt = value;
					continue;
				}
				eqFilters.push({
					enabled: true,
					type: def.type,
					freq: def.freq,
					q: def.q,
					gain: value
				});
			}
		}

		const out: ParsedFRData = {};
		for (const key of Object.keys(original) as (keyof ParsedFRData)[]) {
			const ch = original[key];
			if (!ch) continue;
			let points: [number, number][] = ch.data.map(([f, d]) => [f, d] as [number, number]);
			if (tilt !== 0) {
				points = points.map(([f, d]) => [f, d + tilt * Math.log2(f / 1000)] as [number, number]);
			}
			if (eqFilters.length > 0) {
				points = this.#eq.applyFilters(points, eqFilters);
			}
			out[key] = {
				data: points,
				metadata: {
					minFreq: points[0]?.[0] ?? 20,
					maxFreq: points[points.length - 1]?.[0] ?? 20000
				}
			};
		}
		return out;
	}

	/** `(Bass: +3.0dB, Tilt: -0.5dB/oct)` — appended to the curve label, or null. */
	label(uuid: string): string | null {
		this.#loadConfig();
		const adj = this.#byUuid.get(uuid);
		if (!adj) return null;

		const parts: string[] = [];
		for (const def of this.#availableFilters) {
			if (!adj.activeIds.includes(def.id)) continue;
			const v = adj.values[def.id] ?? 0;
			if (v === 0) continue;
			const paren = def.name.indexOf(' (');
			const shortName = paren >= 0 ? def.name.slice(0, paren) : def.name;
			const unit = def.type === 'TILT' ? 'dB/oct' : 'dB';
			const sign = v > 0 ? '+' : '';
			parts.push(`${shortName}: ${sign}${formatFilterGain(def, v)}${unit}`);
		}
		return parts.length > 0 ? `(${parts.join(', ')})` : null;
	}
}

export const targetAdjustmentStore = new TargetAdjustmentStore();
