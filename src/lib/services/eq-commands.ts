import type { Command } from './commands.js';
import type { FRStoreWriteAPI } from './command-history.svelte.js';
import { commandHistory } from './command-history.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { eqConstraintsStore } from '$lib/stores/eq-constraints-store.svelte.js';
import { eqHistoryStore } from '$lib/stores/eq-history-store.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import type { EQFilter } from '$lib/utils/equalizer.js';
import {
	clampFilterToConstraint,
	clampFiltersToConstraint
} from '$lib/utils/eq-constraint-clamp.js';

/**
 * EQ-store commands — add/remove/update filter bands and bulk-replace the
 * filter list through the shared `commandHistory`. Each command implements
 * the FR `Command` interface but ignores the injected `FRStoreWriteAPI`
 * argument and mutates `eqStore` directly. The shared sentinel uuid
 * (`EQ_COMMAND_UUID`) lets consumers identify EQ-targeted commands without
 * a dedicated discriminator.
 *
 * Most user-visible filter edits should go through `eqCommands.*`. The
 * direct-mutation API on `eqStore` (addBand / removeBandAt / updateBandAt)
 * remains for boot-time restoration (url-provider) and tests, where the
 * change is not user-initiated and shouldn't enter undo history.
 */
export const EQ_COMMAND_UUID = '__eq__';

function eqFiltersEqual(a: EQFilter, b: EQFilter): boolean {
	return (
		a.enabled === b.enabled &&
		a.type === b.type &&
		a.freq === b.freq &&
		a.q === b.q &&
		a.gain === b.gain
	);
}

// ─── Update a single filter ──────────────────────────────────────────────────

export class UpdateEqFilterCommand implements Command {
	readonly uuid = EQ_COMMAND_UUID;
	readonly #index: number;
	readonly #oldFilter: EQFilter;
	readonly #newFilter: EQFilter;

	/**
	 * @param index Filter index in eqStore.filters
	 * @param newFilter The full new filter state
	 * @param oldFilter The pre-edit filter state. Defaults to the current
	 *   `eqStore.filters[index]` at construction time. For drag/burst flows,
	 *   pass a pre-captured snapshot taken before any direct mutations so the
	 *   command represents the whole drag rather than its final mid-drag tick.
	 */
	constructor(index: number, newFilter: EQFilter, oldFilter?: EQFilter) {
		this.#index = index;
		const cur = oldFilter ?? eqStore.filters[index];
		if (!cur) {
			throw new Error(`UpdateEqFilterCommand: index ${index} out of range`);
		}
		this.#oldFilter = { ...cur };
		this.#newFilter = { ...newFilter };
	}

	execute(_store: FRStoreWriteAPI): void {
		const next = this.#newFilter;
		eqStore.filters = eqStore.filters.map((f, i) => (i === this.#index ? next : f));
	}

	undo(_store: FRStoreWriteAPI): void {
		const prev = this.#oldFilter;
		eqStore.filters = eqStore.filters.map((f, i) => (i === this.#index ? prev : f));
	}
}

// ─── Add a filter ────────────────────────────────────────────────────────────

export class AddEqFilterCommand implements Command {
	readonly uuid = EQ_COMMAND_UUID;
	readonly #filter: EQFilter;
	#insertedIndex = -1;

	constructor(filter: EQFilter) {
		this.#filter = { ...filter };
	}

	execute(_store: FRStoreWriteAPI): void {
		this.#insertedIndex = eqStore.filters.length;
		eqStore.filters = [...eqStore.filters, { ...this.#filter }];
	}

	undo(_store: FRStoreWriteAPI): void {
		if (this.#insertedIndex < 0) return;
		eqStore.filters = eqStore.filters.filter((_, i) => i !== this.#insertedIndex);
	}
}

// ─── Remove a filter ─────────────────────────────────────────────────────────

export class RemoveEqFilterCommand implements Command {
	readonly uuid = EQ_COMMAND_UUID;
	readonly #index: number;
	#removed: EQFilter | null = null;

	constructor(index: number) {
		this.#index = index;
	}

	execute(_store: FRStoreWriteAPI): void {
		const target = eqStore.filters[this.#index];
		if (!target) return;
		this.#removed = { ...target };
		eqStore.filters = eqStore.filters.filter((_, i) => i !== this.#index);
	}

	undo(_store: FRStoreWriteAPI): void {
		if (!this.#removed) return;
		const restored = this.#removed;
		const next = [...eqStore.filters];
		next.splice(this.#index, 0, restored);
		eqStore.filters = next;
	}
}

// ─── Bulk replace ─ AutoEQ result, file import, device pull, sort ─────────────

export class ReplaceEqFiltersCommand implements Command {
	readonly uuid = EQ_COMMAND_UUID;
	readonly #newFilters: EQFilter[];
	#oldFilters: EQFilter[] | null = null;

	constructor(newFilters: EQFilter[]) {
		this.#newFilters = newFilters.map((f) => ({ ...f }));
	}

	execute(_store: FRStoreWriteAPI): void {
		this.#oldFilters = eqStore.filters.map((f) => ({ ...f }));
		eqStore.filters = this.#newFilters.map((f) => ({ ...f }));
	}

	undo(_store: FRStoreWriteAPI): void {
		if (!this.#oldFilters) return;
		eqStore.filters = this.#oldFilters.map((f) => ({ ...f }));
	}
}

// ─── Apply EQ history snapshot ──────────────────────────────────────────────

/**
 * ApplyEqSnapshotCommand — apply a logged history snapshot's filters and
 * preamp as one undoable transition. Wraps ReplaceEqFiltersCommand and
 * also captures preamp so an A/B switch is fully reversible.
 */
export class ApplyEqSnapshotCommand implements Command {
	readonly uuid = EQ_COMMAND_UUID;
	readonly #newFilters: EQFilter[];
	readonly #newPreamp: number;
	#oldFilters: EQFilter[] | null = null;
	#oldPreamp = 0;

	constructor(filters: EQFilter[], preamp: number) {
		this.#newFilters = filters.map((f) => ({ ...f }));
		this.#newPreamp = preamp;
	}

	execute(_store: FRStoreWriteAPI): void {
		this.#oldFilters = eqStore.filters.map((f) => ({ ...f }));
		this.#oldPreamp = eqStore.preamp;
		eqStore.filters = this.#newFilters.map((f) => ({ ...f }));
		eqStore.preamp = this.#newPreamp;
	}

	undo(_store: FRStoreWriteAPI): void {
		if (!this.#oldFilters) return;
		eqStore.filters = this.#oldFilters.map((f) => ({ ...f }));
		eqStore.preamp = this.#oldPreamp;
	}
}

// ─── Coalescing layer for rapid repeated edits ───────────────────────────────

const COALESCE_WINDOW_MS = 400;

interface PendingBurst {
	capturedOld: EQFilter;
	timer: ReturnType<typeof setTimeout> | null;
}

class EqEditCoalescer {
	#pending: Map<number, PendingBurst> = new Map();

	/**
	 * Apply a partial update directly to the store and arm a deferred commit.
	 * Repeated calls to the same band within {@link COALESCE_WINDOW_MS}
	 * extend the deadline and merge into a single history entry.
	 */
	updateBand(index: number, partial: Partial<EQFilter>): void {
		const cur = eqStore.filters[index];
		if (!cur) return;

		let pending = this.#pending.get(index);
		if (!pending) {
			pending = { capturedOld: { ...cur }, timer: null };
			this.#pending.set(index, pending);
		} else if (pending.timer) {
			clearTimeout(pending.timer);
		}

		// Apply directly to the store — live preview without history churn.
		eqStore.updateBandAt(index, partial);

		pending.timer = setTimeout(() => this.flushBand(index), COALESCE_WINDOW_MS);
	}

	/** Force-commit any pending burst for one band (e.g. on drag-end). */
	flushBand(index: number): void {
		const entry = this.#pending.get(index);
		if (!entry) return;
		this.#pending.delete(index);
		if (entry.timer) clearTimeout(entry.timer);

		const final = eqStore.filters[index];
		if (!final) return;
		if (eqFiltersEqual(entry.capturedOld, final)) return; // no-op burst

		const cmd = new UpdateEqFilterCommand(index, final, entry.capturedOld);
		commandHistory.execute(cmd, frStore);
	}

	/** Force-commit all pending bursts (e.g. on phone-source change). */
	flushAll(): void {
		for (const idx of [...this.#pending.keys()]) this.flushBand(idx);
	}

	/** Drop pending bursts without committing. Used when bands are bulk-replaced. */
	clear(): void {
		for (const entry of this.#pending.values()) {
			if (entry.timer) clearTimeout(entry.timer);
		}
		this.#pending.clear();
	}
}

const coalescer = new EqEditCoalescer();

// ─── Public API ──────────────────────────────────────────────────────────────

export const eqCommands = {
	/**
	 * Update a single filter band. Repeated calls to the same band within
	 * ~400 ms coalesce into a single undo entry. Drag/scroll/slider flows
	 * should call this and then `flushBand(index)` on release.
	 *
	 * The partial is clamped against the active constraint preset before
	 * application — out-of-range entries get pinned to the bound rather
	 * than silently letting the store hold an invalid value.
	 */
	updateBand(index: number, partial: Partial<EQFilter>): void {
		const cur = eqStore.filters[index];
		if (!cur) return;
		const preset = eqConstraintsStore.active;
		const merged: EQFilter = { ...cur, ...partial };
		const clamped = preset ? clampFilterToConstraint(merged, preset) : merged;
		// Translate the clamped result back into a partial diff so the coalescer
		// only commits what actually changed.
		const diff: Partial<EQFilter> = {};
		(Object.keys(partial) as (keyof EQFilter)[]).forEach((k) => {
			if (clamped[k] !== cur[k]) (diff[k] as unknown) = clamped[k];
		});
		// Also include any field that clamping moved beyond the original partial
		// (e.g. graphic-mode freq edit also pins Q to the band's locked Q).
		(['type', 'freq', 'q', 'gain'] as (keyof EQFilter)[]).forEach((k) => {
			if (clamped[k] !== cur[k] && diff[k] === undefined) {
				(diff[k] as unknown) = clamped[k];
			}
		});
		if (Object.keys(diff).length === 0) return;
		coalescer.updateBand(index, diff);
	},

	/** Force-commit any pending burst for `index` (no-op if none pending). */
	flushBand(index: number): void {
		coalescer.flushBand(index);
	},

	/** Force-commit all pending bursts. */
	flushAll(): void {
		coalescer.flushAll();
	},

	/**
	 * Toggle the enabled state of a single band. Bypasses the burst coalescer
	 * so the toggle is always its own distinct undo entry, independent of any
	 * concurrent gain/freq drag.
	 */
	toggleBandEnabled(index: number, enabled: boolean): void {
		const cur = eqStore.filters[index];
		if (!cur || cur.enabled === enabled) return;
		coalescer.flushBand(index);
		commandHistory.execute(new UpdateEqFilterCommand(index, { ...cur, enabled }), frStore);
	},

	/**
	 * Append a new filter band. Pushes immediately to history. The filter
	 * is clamped against the active constraint, and the call is rejected
	 * (no command pushed) if it would exceed the preset's `maxBands` cap.
	 * Returns whether the band was added.
	 */
	addBand(filter: EQFilter): boolean {
		coalescer.flushAll();
		const preset = eqConstraintsStore.active;
		if (preset && preset.maxBands > 0 && eqStore.filters.length >= preset.maxBands) {
			return false;
		}
		const clamped = preset ? clampFilterToConstraint(filter, preset) : filter;
		commandHistory.execute(new AddEqFilterCommand(clamped), frStore);
		return true;
	},

	/** Remove the band at `index`. Pushes immediately to history. */
	removeBand(index: number): void {
		coalescer.flushAll();
		commandHistory.execute(new RemoveEqFilterCommand(index), frStore);
	},

	/**
	 * Replace the entire filter list (sort, import, AutoEQ, device pull).
	 * Pushes immediately to history. Discards any pending burst-coalesced
	 * mid-edits since they would point at indices in the old list.
	 *
	 * The new list is clamped against the active constraint and trimmed to
	 * `maxBands`, so importing more filters than the preset allows silently
	 * drops the trailing rows rather than leaving them in an invalid state.
	 */
	replaceFilters(filters: EQFilter[]): void {
		coalescer.clear();
		const preset = eqConstraintsStore.active;
		const clamped = preset ? clampFiltersToConstraint(filters, preset) : filters;
		commandHistory.execute(new ReplaceEqFiltersCommand(clamped), frStore);
	},

	/**
	 * Apply a history snapshot's filters + preamp as one undoable command.
	 * Used by the History & Compare UI's A/B switch. Skips when the live
	 * state already matches the snapshot byte-for-byte.
	 */
	applySnapshot(filters: EQFilter[], preamp: number): void {
		coalescer.flushAll();
		const sameLength = eqStore.filters.length === filters.length;
		const samePreamp = eqStore.preamp === preamp;
		const sameContent =
			sameLength &&
			filters.every((f, i) => {
				const c = eqStore.filters[i];
				return (
					c &&
					c.enabled === f.enabled &&
					c.type === f.type &&
					c.freq === f.freq &&
					c.q === f.q &&
					c.gain === f.gain
				);
			});
		if (samePreamp && sameContent) return;
		eqHistoryStore.suppressNext();
		commandHistory.execute(new ApplyEqSnapshotCommand(filters, preamp), frStore);
	},

	/**
	 * Re-clamp every existing filter against the currently active preset and
	 * push the result as one undoable command. Called when the user switches
	 * to a different preset — folds in-place rather than rejecting changes.
	 */
	reclampToActiveConstraint(): void {
		coalescer.clear();
		const preset = eqConstraintsStore.active;
		if (!preset) return;
		const next = clampFiltersToConstraint(eqStore.filters, preset);
		// Skip if nothing actually changes.
		if (
			next.length === eqStore.filters.length &&
			next.every((f, i) => {
				const c = eqStore.filters[i];
				return (
					f.enabled === c.enabled &&
					f.type === c.type &&
					f.freq === c.freq &&
					f.q === c.q &&
					f.gain === c.gain
				);
			})
		) {
			return;
		}
		commandHistory.execute(new ReplaceEqFiltersCommand(next), frStore);
	}
};
