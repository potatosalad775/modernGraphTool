import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';

const ACTIVE_ID_LS_KEY = 'gt-eq-constraint-active-id';

/** Synthetic preset id reserved for the currently-connected device. */
const DEVICE_CONSTRAINT_ID = '__device-peq__';

/** id of the unlimited-parametric default. */
export const DEFAULT_CONSTRAINT_ID = 'default';

/**
 * The complete preset catalog, baked into the binary.
 *
 * There used to be a curated dictionary of device-specific profiles on top of
 * these — a bundled `eq-constraints.json`, an operator `EQ` config section, and
 * a phone-name auto-match that selected a profile for you. All of it is gone
 * until a shared constraints service exists to maintain those profiles; a
 * hand-maintained device list in this repo goes stale faster than it is useful,
 * and the auto-match silently clamped the user's filters with the picker hidden.
 *
 * Hardware profiles now come from exactly one place: a device the user actually
 * connected, derived from what that device reports (`setDeviceConstraint`).
 */
export const BUILTIN_PRESETS: EqConstraintPreset[] = [
	{
		id: DEFAULT_CONSTRAINT_ID,
		label: 'Default (unlimited)',
		mode: 'parametric',
		maxBands: 0,
		allowPk: true,
		allowLsq: true,
		allowHsq: true,
		freqMin: 20,
		freqMax: 20000,
		gainMin: -20,
		gainMax: 20,
		qMin: 0.1,
		qMax: 10
	},
	{
		id: 'generic-10-band',
		label: 'Generic 10-band Graphic EQ',
		mode: 'graphic',
		maxBands: 10,
		allowPk: true,
		allowLsq: false,
		allowHsq: false,
		graphicBands: [
			{ freq: 31, q: 1.4 },
			{ freq: 62, q: 1.4 },
			{ freq: 125, q: 1.4 },
			{ freq: 250, q: 1.4 },
			{ freq: 500, q: 1.4 },
			{ freq: 1000, q: 1.4 },
			{ freq: 2000, q: 1.4 },
			{ freq: 4000, q: 1.4 },
			{ freq: 8000, q: 1.4 },
			{ freq: 16000, q: 1.4 }
		],
		gainMin: -10,
		gainMax: 10
	}
];

/**
 * Active EQ constraint preset + the catalog of available presets.
 *
 * The catalog is `BUILTIN_PRESETS` plus, while a supported device is
 * connected, that device's derived profile. Nothing is fetched — the store is
 * fully resolved from construction, so a saved active id resolves on first
 * paint.
 */
class EqConstraintsStore {
	presets = $state<EqConstraintPreset[]>([...BUILTIN_PRESETS]);
	activeId = $state<string>(DEFAULT_CONSTRAINT_ID);
	/** Active id snapshot before a device's preset took over — restored on disconnect. */
	#preDeviceActiveId: string | null = null;

	constructor() {
		this.activeId = this.restoreActiveOrDefault(DEFAULT_CONSTRAINT_ID);
	}

	get active(): EqConstraintPreset | null {
		return this.presets.find((p) => p.id === this.activeId) ?? this.presets[0] ?? null;
	}

	setActive(id: string): void {
		if (this.presets.some((p) => p.id === id)) {
			this.activeId = id;
			this.persistActive();
		}
	}

	/**
	 * Inject the connected device's derived constraint preset and auto-select
	 * it. Replaces any previous device preset (devices reconnecting under a
	 * different model). The user-selected preset is remembered so disconnect
	 * can restore it.
	 */
	setDeviceConstraint(preset: EqConstraintPreset): void {
		const withId: EqConstraintPreset = { ...preset, id: DEVICE_CONSTRAINT_ID };
		const idx = this.presets.findIndex((p) => p.id === DEVICE_CONSTRAINT_ID);
		const next = [...this.presets];
		if (idx >= 0) next[idx] = withId;
		else next.push(withId);
		this.presets = next;
		// Remember what the user had selected so disconnect can restore.
		if (this.activeId !== DEVICE_CONSTRAINT_ID) {
			this.#preDeviceActiveId = this.activeId;
		}
		this.activeId = DEVICE_CONSTRAINT_ID;
		// Don't persist — the device preset is session-scoped, not user choice.
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

	private persistActive(): void {
		try {
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem(ACTIVE_ID_LS_KEY, this.activeId);
			}
		} catch {
			/* localStorage unavailable (private mode) — ignore. */
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
