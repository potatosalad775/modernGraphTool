import { browser } from '$app/environment';
import { SvelteMap } from 'svelte/reactivity';
import { Equalizer, type EQFilter } from '$lib/utils/equalizer.js';
import { getConfigValue } from '$lib/utils/config.js';
import type { ParsedFRData } from '$lib/types/data-types.js';

export interface TargetFilterDef {
	id: string;
	name: string;
	type: 'TILT' | 'LSQ' | 'HSQ' | 'PK';
	freq: number;
	q: number;
	description?: string;
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

const DEFAULT_FILTERS: TargetFilterDef[] = [
	{ id: 'tilt', name: 'Tilt (dB/oct)', type: 'TILT', freq: 0, q: 0 },
	{ id: 'bass', name: 'Bass (dB)', type: 'LSQ', freq: 105, q: 0.707 },
	{ id: 'treble', name: 'Treble (dB)', type: 'HSQ', freq: 2500, q: 0.42 }
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
	#filterPresets: TargetFilterPreset[] = [];
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
		this.#availableFilters = cfg?.FILTERS ?? DEFAULT_FILTERS;
		this.#filterPresets = cfg?.FILTER_PRESET ?? [];
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
		const values = { ...adj.values };
		delete values[id];
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
				points = this.#eq.applyFilters(points, eqFilters) as [number, number][];
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
			parts.push(`${shortName}: ${sign}${v.toFixed(1)}${unit}`);
		}
		return parts.length > 0 ? `(${parts.join(', ')})` : null;
	}
}

export const targetAdjustmentStore = new TargetAdjustmentStore();
