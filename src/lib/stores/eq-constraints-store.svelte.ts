import type { Profile } from '@potatosalad775/eqcaps-core';
import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';
import { eqStore } from './eq-store.svelte.js';
import {
	assignSlots,
	filterViolations,
	graphicProfile,
	isGraphicProfile,
	maxBandsOf,
	uniformProfile,
	type FilterViolation
} from '$lib/utils/eq-constraint.js';

const ACTIVE_ID_LS_KEY = 'gt-eq-constraint-active-id';
/** The last catalog profile picked, so a saved `eqcaps:` id resolves on first paint, offline. */
const CATALOG_LS_KEY = 'gt-eq-constraint-catalog';

/** Synthetic preset id reserved for the currently-connected device. */
export const DEVICE_CONSTRAINT_ID = '__device-peq__';

/** id of the unlimited-parametric default. */
export const DEFAULT_CONSTRAINT_ID = 'default';

/** Prefix of a preset picked from the eqcaps database. */
export const CATALOG_PREFIX = 'eqcaps:';

/**
 * The presets baked into the binary. Everything else comes from the eqcaps database: the profile of
 * a device the user connected (`setDeviceConstraint`), or one they picked in the constraint picker
 * (`addCatalogProfile`).
 */
export const BUILTIN_PRESETS: EqConstraintPreset[] = [
	{
		id: DEFAULT_CONSTRAINT_ID,
		label: 'Default (unlimited)',
		source: 'builtin',
		profile: uniformProfile({
			id: 'moderngraphtool-default',
			model: 'Default',
			bandCount: null,
			freq: { min: 20, max: 20000 },
			q: { min: 0.1, max: 10 },
			gain: { min: -20, max: 20 }
		})
	},
	{
		id: 'generic-10-band',
		label: 'Generic 10-band Graphic EQ',
		source: 'builtin',
		profile: graphicProfile({
			id: 'moderngraphtool-generic-10-band',
			model: 'Generic 10-band Graphic EQ',
			bands: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map((freq) => ({
				freq,
				q: 1.4
			})),
			gain: { min: -10, max: 10 }
		})
	}
];

/** Picker label of an eqcaps profile: "FiiO KA17", "Poweramp Equalizer · Graphic EQ". */
export function profileLabel(profile: Pick<Profile, 'device' | 'engine'>): string {
	const name = `${profile.device.brand} ${profile.device.model}`;
	return profile.engine ? `${name} · ${profile.engine}` : name;
}

/**
 * Active EQ constraint + the presets the picker offers.
 *
 * Nothing is fetched here: the store is fully resolved from construction, so a saved active id
 * resolves on first paint. A catalog pick is stored with its profile for the same reason.
 *
 * Activating a preset never edits the filters by itself. A preset the user picks is folded in by
 * `eqCommands.reclampToActiveConstraint()` (the picker calls it, as one undoable command); a
 * device's profile only flags what doesn't fit until the user asks to fit it.
 */
class EqConstraintsStore {
	presets = $state<EqConstraintPreset[]>([...BUILTIN_PRESETS]);
	activeId = $state<string>(DEFAULT_CONSTRAINT_ID);
	/** Active id snapshot before a device's preset took over — restored on disconnect. */
	#preDeviceActiveId: string | null = null;

	/**
	 * The live band list read against the active profile, computed once per change and shared by
	 * every card: the slot each band sits in, and what each band breaks.
	 */
	#analysis = $derived.by(() => {
		const filters = eqStore.filters;
		const profile = this.profile;
		return {
			slots: assignSlots(filters, profile),
			violations: filterViolations(filters, profile)
		};
	});

	constructor() {
		this.restoreCatalog();
		this.activeId = this.restoreActiveOrDefault(DEFAULT_CONSTRAINT_ID);
	}

	get active(): EqConstraintPreset {
		return (
			this.presets.find((p) => p.id === this.activeId) ?? this.presets[0] ?? BUILTIN_PRESETS[0]
		);
	}

	/** The active eqcaps profile. */
	get profile(): Profile {
		return this.active.profile;
	}

	/** Fixed bands with locked frequency: one row per band, only gain edits. */
	get isGraphic(): boolean {
		return isGraphicProfile(this.profile);
	}

	/** Band cap per output; 0 = unlimited. */
	get maxBands(): number {
		return maxBandsOf(this.profile);
	}

	/** The slot each band of `eqStore.filters` sits in, by flat index. */
	get slots(): number[] {
		return this.#analysis.slots;
	}

	/** What each band of `eqStore.filters` breaks, by flat index. */
	get violations(): FilterViolation[] {
		return this.#analysis.violations;
	}

	/** Bands that break the active profile somewhere. */
	get violationCount(): number {
		return this.#analysis.violations.filter((v) => v.type || v.freq || v.q || v.gain).length;
	}

	/** Anything other than the unlimited default is limiting the filters. */
	get isLimiting(): boolean {
		return this.activeId !== DEFAULT_CONSTRAINT_ID;
	}

	setActive(id: string): void {
		if (this.presets.some((p) => p.id === id)) {
			this.activeId = id;
			this.persistActive();
		}
	}

	/**
	 * Add a profile picked from the eqcaps database and select it. Returns its preset id. Picking
	 * one again replaces the stored copy, so a revised profile takes effect.
	 */
	addCatalogProfile(profile: Profile): string {
		const preset: EqConstraintPreset = {
			id: CATALOG_PREFIX + profile.id,
			label: profileLabel(profile),
			source: 'catalog',
			profile
		};
		this.upsert(preset);
		this.setActive(preset.id);
		try {
			localStorage.setItem(CATALOG_LS_KEY, JSON.stringify(preset));
		} catch {
			/* localStorage unavailable (private mode) — the pick lasts the session. */
		}
		return preset.id;
	}

	/**
	 * Inject the connected device's profile and select it. Replaces any previous device preset. The
	 * user-selected preset is remembered so disconnect can restore it. Session-scoped: never
	 * persisted.
	 */
	setDeviceConstraint(profile: Profile, label = profileLabel(profile)): void {
		this.upsert({ id: DEVICE_CONSTRAINT_ID, label, source: 'device', profile });
		if (this.activeId !== DEVICE_CONSTRAINT_ID) {
			this.#preDeviceActiveId = this.activeId;
		}
		this.activeId = DEVICE_CONSTRAINT_ID;
	}

	/** Remove the connected-device preset and restore the user's prior pick. */
	clearDeviceConstraint(): void {
		const had = this.presets.some((p) => p.id === DEVICE_CONSTRAINT_ID);
		if (!had) return;
		this.presets = this.presets.filter((p) => p.id !== DEVICE_CONSTRAINT_ID);
		const restore = this.#preDeviceActiveId;
		this.#preDeviceActiveId = null;
		if (restore && this.presets.some((p) => p.id === restore)) {
			this.activeId = restore;
		} else {
			this.activeId = this.presets[0]?.id ?? DEFAULT_CONSTRAINT_ID;
		}
	}

	private upsert(preset: EqConstraintPreset): void {
		const idx = this.presets.findIndex((p) => p.id === preset.id);
		const next = [...this.presets];
		if (idx >= 0) next[idx] = preset;
		else next.push(preset);
		this.presets = next;
	}

	private persistActive(): void {
		try {
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem(ACTIVE_ID_LS_KEY, this.activeId);
			}
		} catch {
			/* localStorage unavailable (private mode) — ignore. */
		}
	}

	private restoreCatalog(): void {
		try {
			if (typeof localStorage === 'undefined') return;
			const raw = localStorage.getItem(CATALOG_LS_KEY);
			if (!raw) return;
			const preset = JSON.parse(raw) as EqConstraintPreset;
			if (
				typeof preset?.id === 'string' &&
				preset.id.startsWith(CATALOG_PREFIX) &&
				preset.source === 'catalog' &&
				typeof preset.label === 'string' &&
				preset.profile &&
				typeof preset.profile === 'object' &&
				preset.profile.band
			) {
				this.presets = [...this.presets, preset];
			}
		} catch {
			/* Malformed or unavailable — start without it. */
		}
	}

	private restoreActiveOrDefault(fallback: string): string {
		try {
			if (typeof localStorage !== 'undefined') {
				const stored = localStorage.getItem(ACTIVE_ID_LS_KEY);
				if (stored && this.presets.some((p) => p.id === stored)) return stored;
			}
		} catch {
			/* ignore */
		}
		if (this.presets.some((p) => p.id === fallback)) return fallback;
		return this.presets[0]?.id ?? DEFAULT_CONSTRAINT_ID;
	}
}

export const eqConstraintsStore = new EqConstraintsStore();
