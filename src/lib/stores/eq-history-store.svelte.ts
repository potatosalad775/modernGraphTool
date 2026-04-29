import type { EQFilter } from '$lib/utils/equalizer.js';

/**
 * One frozen EQ state at a point in time. The list is independent of the
 * fine-grained command-history undo/redo stack — it's a coarser log meant
 * for the user-visible "History & Compare" UI (commit 11) where two
 * snapshots get nominated as A/B for ghost-trace + live-audio comparison.
 *
 * Snapshots are session-scoped: not persisted to localStorage, cleared
 * when the source phone changes. The 1:1 fineness vs the command stack is
 * intentional — Cmd-Z handles "undo this gain tick", the snapshot list
 * handles "rewind 5 minutes".
 */
export interface EqSnapshot {
	id: string;
	timestamp: number;
	filters: EQFilter[];
	preamp: number;
	/** Brief human-readable line shown in the list (e.g. "5 PK bands, preamp -2.4 dB"). */
	summary: string;
}

const RECORD_DEBOUNCE_MS = 500;
const RECORD_MIN_GAP_MS = 1000;
const SNAPSHOT_CAP = 100;

class EqHistoryStore {
	snapshots = $state<EqSnapshot[]>([]);
	/** A-side selection. `null` falls back to "first snapshot in this session". */
	aSnapshotId = $state<string | null>(null);
	/**
	 * B-side selection. `null` is the sentinel "current state", i.e. don't pin
	 * to a specific snapshot — the live `eqStore.filters` is the B value.
	 */
	bSnapshotId = $state<string | null>(null);

	#pendingTimer: ReturnType<typeof setTimeout> | null = null;
	#lastCommitTimestamp = 0;

	/**
	 * Schedule a snapshot of the current filter state. Repeated calls within
	 * the debounce window collapse into one snapshot, and back-to-back commits
	 * are spaced by at least RECORD_MIN_GAP_MS so a single drag doesn't fill
	 * the list with near-duplicates.
	 */
	record(filters: EQFilter[], preamp: number): void {
		// Snapshot the values now (state may shift before the timer fires).
		const captured = {
			filters: filters.map((f) => ({ ...f })),
			preamp
		};
		if (this.#pendingTimer) clearTimeout(this.#pendingTimer);
		this.#pendingTimer = setTimeout(() => {
			this.#pendingTimer = null;
			this.#commit(captured.filters, captured.preamp);
		}, RECORD_DEBOUNCE_MS);
	}

	/** Force-flush any pending debounced record (e.g. before phone change). */
	flush(): void {
		if (this.#pendingTimer) {
			clearTimeout(this.#pendingTimer);
			this.#pendingTimer = null;
		}
	}

	/** Drop every snapshot (e.g. on source phone change). */
	clear(): void {
		this.flush();
		this.snapshots = [];
		this.aSnapshotId = null;
		this.bSnapshotId = null;
		this.#lastCommitTimestamp = 0;
	}

	setA(id: string | null): void {
		if (id !== null && !this.snapshots.some((s) => s.id === id)) return;
		this.aSnapshotId = id;
	}

	setB(id: string | null): void {
		if (id !== null && !this.snapshots.some((s) => s.id === id)) return;
		this.bSnapshotId = id;
	}

	#commit(filters: EQFilter[], preamp: number): void {
		const now = Date.now();
		// Coalesce when commits would land within the minimum gap — replace the
		// most recent entry rather than creating a near-identical sibling.
		const last = this.snapshots.at(-1);
		const withinGap = last !== undefined && now - this.#lastCommitTimestamp < RECORD_MIN_GAP_MS;
		// Skip when the new state is byte-equal to the last one — no point logging.
		if (last && snapshotMatches(last, filters, preamp)) return;

		const entry: EqSnapshot = {
			id: makeId(now),
			timestamp: now,
			filters,
			preamp,
			summary: summarize(filters, preamp)
		};

		let next: EqSnapshot[];
		if (withinGap) {
			next = [...this.snapshots.slice(0, -1), entry];
		} else {
			next = [...this.snapshots, entry];
		}
		// Cap at SNAPSHOT_CAP — drop oldest when overflowing.
		if (next.length > SNAPSHOT_CAP) next = next.slice(next.length - SNAPSHOT_CAP);
		this.snapshots = next;
		this.#lastCommitTimestamp = now;
	}
}

function makeId(now: number): string {
	return `${now}-${Math.random().toString(36).slice(2, 8)}`;
}

export function summarize(filters: EQFilter[], preamp: number): string {
	const enabled = filters.filter((f) => f.enabled);
	const pk = enabled.filter((f) => f.type === 'PK').length;
	const ls = enabled.filter((f) => f.type === 'LSQ').length;
	const hs = enabled.filter((f) => f.type === 'HSQ').length;
	const parts: string[] = [];
	if (pk) parts.push(`${pk} PK`);
	if (ls) parts.push(`${ls} LS`);
	if (hs) parts.push(`${hs} HS`);
	const filterPart = parts.length ? parts.join(' / ') : 'no bands';
	return `${filterPart}, preamp ${preamp.toFixed(1)} dB`;
}

export function snapshotMatches(
	snapshot: EqSnapshot,
	filters: EQFilter[],
	preamp: number
): boolean {
	if (snapshot.filters.length !== filters.length) return false;
	if (snapshot.preamp !== preamp) return false;
	for (let i = 0; i < filters.length; i++) {
		const a = snapshot.filters[i];
		const b = filters[i];
		if (
			a.enabled !== b.enabled ||
			a.type !== b.type ||
			a.freq !== b.freq ||
			a.q !== b.q ||
			a.gain !== b.gain
		) {
			return false;
		}
	}
	return true;
}

export const eqHistoryStore = new EqHistoryStore();
