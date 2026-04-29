import type { Command } from './commands.js';
import type { FRStoreWriteAPI } from './command-history.svelte.js';
import { commandHistory } from './command-history.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import type { EQFilter } from '$lib/utils/equalizer.js';

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
	 */
	updateBand(index: number, partial: Partial<EQFilter>): void {
		coalescer.updateBand(index, partial);
	},

	/** Force-commit any pending burst for `index` (no-op if none pending). */
	flushBand(index: number): void {
		coalescer.flushBand(index);
	},

	/** Force-commit all pending bursts. */
	flushAll(): void {
		coalescer.flushAll();
	},

	/** Append a new filter band. Pushes immediately to history. */
	addBand(filter: EQFilter): void {
		coalescer.flushAll();
		commandHistory.execute(new AddEqFilterCommand(filter), frStore);
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
	 */
	replaceFilters(filters: EQFilter[]): void {
		coalescer.clear();
		commandHistory.execute(new ReplaceEqFiltersCommand(filters), frStore);
	}
};
