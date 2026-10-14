import { untrack } from 'svelte';
import type { EQFilter } from '$lib/utils/equalizer.js';
import { snapshotMatches } from '$lib/utils/eq-snapshot.js';
import { eqStore } from './eq-store.svelte.js';
import {
	BOOKMARK_ID_PREFIX,
	eqBookmarkStore,
	type EqBookmark
} from './eq-bookmark-store.svelte.js';

export { snapshotMatches };

/**
 * One frozen EQ state at a point in time. The list is independent of the
 * fine-grained command-history undo/redo stack — it's a coarser log meant
 * for the user-visible "History & Compare" UI (commit 11) where two
 * snapshots get nominated as A/B for ghost-trace + live-audio comparison.
 *
 * Snapshots are session-scoped: not persisted to localStorage, cleared
 * when the source phone changes. The 1:1 fineness vs the command stack is
 * intentional — Cmd-Z handles "undo this gain tick", the snapshot list
 * handles "rewind 5 minutes". Bookmarks (`eq-bookmark-store`) are the
 * persistent, named counterpart.
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

/** Either list an A/B pick can point into. */
export type EqCompareEntry = EqSnapshot | EqBookmark;

export function isBookmarkId(id: string): boolean {
	return id.startsWith(BOOKMARK_ID_PREFIX);
}

class EqHistoryStore {
	snapshots = $state<EqSnapshot[]>([]);
	/**
	 * A/B selection: an id into the history **or** the bookmarks (`findEntry`),
	 * so A can be a bookmark and B a history entry. `null` is unset. A deleted
	 * bookmark leaves the id resolving to nothing, so read `aEntry` / `bEntry`.
	 */
	aSnapshotId = $state<string | null>(null);
	bSnapshotId = $state<string | null>(null);

	get aEntry(): EqCompareEntry | null {
		return this.aSnapshotId ? this.findEntry(this.aSnapshotId) : null;
	}

	get bEntry(): EqCompareEntry | null {
		return this.bSnapshotId ? this.findEntry(this.bSnapshotId) : null;
	}

	#installed = false;
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

	/**
	 * Drop every snapshot (e.g. on source phone change). A/B picks of a
	 * bookmark survive — bookmarks outlive the history, and whether one still
	 * fits the active constraint is decided where it is used.
	 */
	clear(): void {
		// Discard rather than flush — a pending record belongs to the state
		// being cleared, so committing it would resurrect it into the empty log.
		this.cancelPending();
		this.snapshots = [];
		if (this.aSnapshotId !== null && !isBookmarkId(this.aSnapshotId)) this.aSnapshotId = null;
		if (this.bSnapshotId !== null && !isBookmarkId(this.bSnapshotId)) this.bSnapshotId = null;
		this.#lastCommitTimestamp = 0;
	}

	/** Drop one snapshot, and any A/B pick pointing at it. */
	remove(id: string): void {
		const next = this.snapshots.filter((s) => s.id !== id);
		if (next.length === this.snapshots.length) return;
		this.snapshots = next;
		if (this.aSnapshotId === id) this.aSnapshotId = null;
		if (this.bSnapshotId === id) this.bSnapshotId = null;
	}

	/** Resolve an A/B id against the history and the bookmarks. */
	findEntry(id: string): EqCompareEntry | null {
		if (isBookmarkId(id)) return eqBookmarkStore.get(id);
		return this.snapshots.find((s) => s.id === id) ?? null;
	}

	setA(id: string | null): void {
		if (id !== null && !this.findEntry(id)) return;
		this.aSnapshotId = id;
	}

	setB(id: string | null): void {
		if (id !== null && !this.findEntry(id)) return;
		this.bSnapshotId = id;
	}

	/**
	 * Record the EQ state and clear the log on a source-device change, for the
	 * lifetime of the page. Installed once from `AppShell.onMount`: the
	 * Equalizer panel unmounts on every panel switch, so effects there missed
	 * edits and device changes made while another panel was open.
	 */
	install(): void {
		if (this.#installed) return;
		this.#installed = true;

		let prevSourceUUID: string | null = eqStore.sourcePhoneUUID;
		$effect.root(() => {
			// Declared before the recorder, so a device change clears the old
			// device's log before the new device's first state is recorded.
			$effect(() => {
				const current = eqStore.sourcePhoneUUID;
				const prev = prevSourceUUID;
				prevSourceUUID = current;
				if (prev && prev !== current) untrack(() => this.clear());
			});

			// Debounced and min-gapped inside `record`, so a slider drag becomes
			// one entry, not 60.
			$effect(() => {
				const filters = eqStore.filters;
				const preamp = eqStore.preamp;
				untrack(() => this.record(filters, preamp));
			});
		});
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
			id: `h-${now}-${Math.random().toString(36).slice(2, 8)}`,
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

export const eqHistoryStore = new EqHistoryStore();
