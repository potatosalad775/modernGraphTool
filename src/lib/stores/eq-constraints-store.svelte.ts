import type { EqConstraintPreset, EqConstraintsFile } from '$lib/types/eq-constraint.js';
import { getConfigValue } from '$lib/utils/config.js';

const ACTIVE_ID_LS_KEY = 'gt-eq-constraint-active-id';
const FETCH_TIMEOUT_MS = 4000;

/**
 * Active EQ constraint preset + the merged catalog of available presets.
 *
 * Hydration runs once at app boot and combines three sources, in priority
 * order (later overrides earlier for the same `id`):
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
	presets = $state<EqConstraintPreset[]>([]);
	activeId = $state<string>('default');
	isLoaded = $state(false);

	get active(): EqConstraintPreset | null {
		return this.presets.find((p) => p.id === this.activeId) ?? this.presets[0] ?? null;
	}

	setActive(id: string): void {
		if (this.presets.some((p) => p.id === id)) {
			this.activeId = id;
			this.persistActive();
		}
	}

	/** Idempotent — calling more than once is a no-op after first success. */
	async hydrate(bundled: EqConstraintsFile): Promise<void> {
		if (this.isLoaded) return;

		const url = (getConfigValue('EQ.CONSTRAINTS_URL') as string | undefined) ?? '';
		const inline =
			(getConfigValue('EQ.CUSTOM_CONSTRAINTS') as EqConstraintPreset[] | undefined) ?? [];
		const initialId =
			(getConfigValue('EQ.DEFAULT_CONSTRAINT_ID') as string | undefined) ?? 'default';

		let fetched: EqConstraintPreset[] = [];
		if (url) {
			try {
				fetched = await fetchPresets(url);
			} catch (err) {
				console.warn(`[eq-constraints] failed to fetch ${url}; using bundled defaults only.`, err);
				fetched = [];
			}
		}

		this.presets = mergePresets([bundled.presets, fetched, sanitizeInlinePresets(inline)]);
		this.activeId = this.restoreActiveOrDefault(initialId);
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
		return this.presets[0]?.id ?? 'default';
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
