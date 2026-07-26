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
	#pending: { filters: EQFilter[]; preamp: number } | null = null;
	#lastCommitTimestamp = 0;
	#suppress = false;

	/**
	 * Skip the next `record()` call exactly once. Used by A/B apply so that
	 * restoring a snapshot doesn't add a duplicate entry to the history list.
	 */
	suppressNext(): void {
		this.#suppress = true;
	}

	/**
	 * Schedule a snapshot of the current filter state. Repeated calls within
	 * the debounce window collapse into one snapshot, and back-to-back commits
	 * are spaced by at least RECORD_MIN_GAP_MS so a single drag doesn't fill
	 * the list with near-duplicates.
	 */
	record(filters: EQFilter[], preamp: number): void {
		if (this.#suppress) {
			this.#suppress = false;
			return;
		}
		// Snapshot the values now (state may shift before the timer fires).
		this.#pending = {
			filters: filters.map((f) => ({ ...f })),
			preamp
		};
		if (this.#pendingTimer) clearTimeout(this.#pendingTimer);
		this.#pendingTimer = setTimeout(() => {
			const captured = this.#pending;
			this.#pendingTimer = null;
			this.#pending = null;
			if (captured) this.#commit(captured.filters, captured.preamp);
		}, RECORD_DEBOUNCE_MS);
	}

	/**
	 * Commit any pending debounced record right now (e.g. before a phone
	 * change), so the last edit of a burst isn't lost.
	 */
	flush(): void {
		const captured = this.#pending;
		this.cancelPending();
		if (captured) this.#commit(captured.filters, captured.preamp);
	}

	/** Drop any pending debounced record without committing it. */
	cancelPending(): void {
		if (this.#pendingTimer) {
			clearTimeout(this.#pendingTimer);
			this.#pendingTimer = null;
		}
		this.#pending = null;
	}

	/** Drop every snapshot (e.g. on source phone change). */
	clear(): void {
		// Discard rather than flush — a pending record belongs to the state
		// being cleared, so committing it would resurrect it into the empty log.
		this.cancelPending();
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
		let nextA = this.aSnapshotId;
		let nextB = this.bSnapshotId;
		if (withinGap) {
			// The coalesced entry supersedes the one it replaces — carry any A/B
			// selection over so the pick doesn't silently dangle.
			const replacedId = last!.id;
			if (nextA === replacedId) nextA = entry.id;
			if (nextB === replacedId) nextB = entry.id;
			next = [...this.snapshots.slice(0, -1), entry];
		} else {
			next = [...this.snapshots, entry];
		}
		// Cap at SNAPSHOT_CAP — drop oldest when overflowing.
		if (next.length > SNAPSHOT_CAP) {
			next = next.slice(next.length - SNAPSHOT_CAP);
			// Trimmed-away snapshots can't stay selected.
			const kept = new Set(next.map((s) => s.id));
			if (nextA !== null && !kept.has(nextA)) nextA = null;
			if (nextB !== null && !kept.has(nextB)) nextB = null;
		}
		this.snapshots = next;
		if (nextA !== this.aSnapshotId) this.aSnapshotId = nextA;
		if (nextB !== this.bSnapshotId) this.bSnapshotId = nextB;
		this.#lastCommitTimestamp = now;
	}
}

function makeId(now: number): string {
	return `${now}-${Math.random().toString(36).slice(2, 8)}`;
}

export function summarize(filters: EQFilter[], preamp: number): string {
	const enabled = filters.filter((f) => f.enabled && f.freq != null && f.gain != null);
	const preampStr = `preamp ${preamp.toFixed(1)} dB`;
	if (!enabled.length) return `no bands, ${preampStr}`;

	const dominant = enabled.reduce((a, b) => (Math.abs(b.gain!) > Math.abs(a.gain!) ? b : a));
	const f = dominant.freq!;
	const hz = f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k` : `${f}`;
	const gain = dominant.gain!;
	const gainStr = `${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB`;
	const tail = enabled.length > 1 ? ` +${enabled.length - 1}` : '';
	return `${dominant.type} ${hz} Hz ${gainStr}${tail}, ${preampStr}`;
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
