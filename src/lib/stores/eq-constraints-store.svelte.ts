import type { EqConstraintPreset, EqConstraintsFile } from '$lib/types/eq-constraint.js';
import { getConfigValue } from '$lib/utils/config.js';

const ACTIVE_ID_LS_KEY = 'gt-eq-constraint-active-id';
const FETCH_TIMEOUT_MS = 4000;

/** Synthetic preset id reserved for the currently-connected device. */
const DEVICE_CONSTRAINT_ID = '__device-peq__';

/** id of the unlimited-parametric default — also the only preset eligible for phone-match auto-pick. */
export const DEFAULT_CONSTRAINT_ID = 'default';

/**
 * General-purpose presets baked into the binary. Always available
 * synchronously — the picker never starts empty, and a saved active id
 * pointing at one of these resolves on first paint regardless of
 * `EQ.CONSTRAINTS_URL` fetch latency. The JSON file (and inline config)
 * is reserved for device-specific PEQ profiles.
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
 * Active EQ constraint preset + the merged catalog of available presets.
 *
 * Built-ins (default + generic 10-band) are baked into this module and
 * always present from construction. Hydration runs once at app boot and
 * appends device-specific presets from three sources, in priority order
 * (later overrides earlier for the same `id`):
 *   1. Bundled fallback (`defaults/eq-constraints.json`, embedded at build).
 *   2. The list at `EQ.CONSTRAINTS_URL` from operator config — usually the
 *      same file, but can be a remote URL pointing at a curated list shared
 *      across deployments.
 *   3. Inline `EQ.CUSTOM_CONSTRAINTS` from operator config.
 *
 * If (2) fails to fetch (network error / 404 / parse error) we fall back to
 * (1)+(3), so the picker never starts empty.
 */
class EqConstraintsStore {
	presets = $state<EqConstraintPreset[]>([...BUILTIN_PRESETS]);
	activeId = $state<string>(DEFAULT_CONSTRAINT_ID);
	isLoaded = $state(false);
	/** Active id snapshot before a device's preset took over — restored on disconnect. */
	#preDeviceActiveId: string | null = null;
	#preDeviceAutoPicked = false;
	/**
	 * `true` when `activeId` was set by `applyPhoneMatch` rather than by an
	 * explicit user pick or hardware-device connection. Auto-picks are not
	 * persisted to localStorage and stay eligible to be re-routed by future
	 * phone changes; manual picks stick.
	 */
	#isAutoPicked = false;

	get active(): EqConstraintPreset | null {
		return this.presets.find((p) => p.id === this.activeId) ?? this.presets[0] ?? null;
	}

	setActive(id: string): void {
		if (this.presets.some((p) => p.id === id)) {
			this.activeId = id;
			this.#isAutoPicked = false;
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
			this.#preDeviceAutoPicked = this.#isAutoPicked;
		}
		this.activeId = DEVICE_CONSTRAINT_ID;
		this.#isAutoPicked = false;
		// Don't persist — the device preset is session-scoped, not user choice.
	}

	/** Remove the connected-device preset and restore the user's prior pick. */
	clearDeviceConstraint(): void {
		const had = this.presets.some((p) => p.id === DEVICE_CONSTRAINT_ID);
		if (!had) return;
		this.presets = this.presets.filter((p) => p.id !== DEVICE_CONSTRAINT_ID);
		const restore = this.#preDeviceActiveId;
		const restoreAuto = this.#preDeviceAutoPicked;
		this.#preDeviceActiveId = null;
		this.#preDeviceAutoPicked = false;
		if (restore && this.presets.some((p) => p.id === restore)) {
			this.activeId = restore;
			this.#isAutoPicked = restoreAuto;
		} else {
			this.activeId = this.presets[0]?.id ?? DEFAULT_CONSTRAINT_ID;
			this.#isAutoPicked = false;
		}
	}

	/**
	 * Auto-pick a device-specific preset whose `matchPhones` substring is
	 * contained in the given phone identifier. Eligible to run when the
	 * active preset is `default` *or* was itself auto-picked — so swapping
	 * phones routes the auto-pick to the new match (and back to `default`
	 * when nothing matches the new phone). Manual picks and `__device-peq__`
	 * connections short-circuit. Returns the new active id when a switch
	 * happened, otherwise `null`.
	 */
	applyPhoneMatch(phoneIdentifier: string | null): string | null {
		const eligible =
			this.activeId === DEFAULT_CONSTRAINT_ID ||
			(this.#isAutoPicked && this.activeId !== DEVICE_CONSTRAINT_ID);
		if (!eligible) return null;

		const haystack = (phoneIdentifier ?? '').toLowerCase();
		const match = haystack
			? (this.presets.find(
					(p) =>
						p.id !== DEFAULT_CONSTRAINT_ID &&
						p.id !== DEVICE_CONSTRAINT_ID &&
						Array.isArray(p.matchPhones) &&
						p.matchPhones.some((needle) => {
							const n = needle.trim().toLowerCase();
							return n.length > 0 && haystack.includes(n);
						})
				) ?? null)
			: null;

		if (match) {
			if (this.activeId === match.id) return null;
			this.activeId = match.id;
			this.#isAutoPicked = true;
			// Don't persist auto-picks — only manual choices stick.
			return match.id;
		}

		// No match for this phone. If the current active was auto-picked,
		// revert to default so a non-matching phone doesn't keep a stale
		// device constraint applied.
		if (this.#isAutoPicked && this.activeId !== DEFAULT_CONSTRAINT_ID) {
			this.activeId = DEFAULT_CONSTRAINT_ID;
			this.#isAutoPicked = false;
			return DEFAULT_CONSTRAINT_ID;
		}
		return null;
	}

	/** Idempotent — calling more than once is a no-op after first success. */
	async hydrate(bundled: EqConstraintsFile): Promise<void> {
		if (this.isLoaded) return;

		const url = (getConfigValue('EQ.CONSTRAINTS_URL') as string | undefined) ?? '';
		const inline =
			(getConfigValue('EQ.CUSTOM_CONSTRAINTS') as EqConstraintPreset[] | undefined) ?? [];
		const initialId =
			(getConfigValue('EQ.DEFAULT_CONSTRAINT_ID') as string | undefined) ?? DEFAULT_CONSTRAINT_ID;

		let fetched: EqConstraintPreset[] = [];
		if (url) {
			try {
				fetched = await fetchPresets(url);
			} catch (err) {
				console.warn(`[eq-constraints] failed to fetch ${url}; using bundled defaults only.`, err);
				fetched = [];
			}
		}

		this.presets = mergePresets([
			BUILTIN_PRESETS,
			bundled.presets,
			fetched,
			sanitizeInlinePresets(inline)
		]);
		this.activeId = this.restoreActiveOrDefault(initialId);
		// A restored non-builtin id is almost certainly tied to a specific
		// device — treat it as auto-picked so the next `applyPhoneMatch`
		// call gets a chance to re-route it to whichever phone is loaded
		// now. Built-ins (Default / Generic 10-band) are always treated
		// as user-chosen.
		const builtinIds = new Set(BUILTIN_PRESETS.map((p) => p.id));
		this.#isAutoPicked = !builtinIds.has(this.activeId);
		this.isLoaded = true;
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

/**
 * Merge preset lists in priority order (later sources override earlier with
 * the same `id`). Preserves order: existing entries keep their slot when an
 * override comes in; new entries from later sources append at the end.
 */
export function mergePresets(sources: EqConstraintPreset[][]): EqConstraintPreset[] {
	const order: string[] = [];
	const byId = new Map<string, EqConstraintPreset>();
	for (const list of sources) {
		for (const p of list) {
			if (!p || typeof p.id !== 'string') continue;
			if (!byId.has(p.id)) order.push(p.id);
			byId.set(p.id, p);
		}
	}
	return order.map((id) => byId.get(id)!).filter(Boolean);
}

/** Drop entries that don't have at least an `id` and `label`; logs others. */
export function sanitizeInlinePresets(raw: unknown[]): EqConstraintPreset[] {
	const out: EqConstraintPreset[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') continue;
		const p = entry as EqConstraintPreset;
		if (typeof p.id !== 'string' || typeof p.label !== 'string') {
			console.warn('[eq-constraints] inline preset missing id/label, skipped:', entry);
			continue;
		}
		out.push(p);
	}
	return out;
}

async function fetchPresets(url: string): Promise<EqConstraintPreset[]> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, { signal: controller.signal });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const json = (await res.json()) as EqConstraintsFile;
		if (!json || !Array.isArray(json.presets)) {
			throw new Error('malformed: missing "presets" array');
		}
		return json.presets;
	} finally {
		clearTimeout(timer);
	}
}

export const eqConstraintsStore = new EqConstraintsStore();
