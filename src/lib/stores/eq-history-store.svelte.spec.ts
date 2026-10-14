import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { EQFilter } from '$lib/utils/equalizer.js';
import { eqHistoryStore, summarize, snapshotMatches } from './eq-history-store.svelte.js';
import { eqBookmarkStore } from './eq-bookmark-store.svelte.js';
import { eqStore } from './eq-store.svelte.js';

function pk(o: Partial<EQFilter> = {}): EQFilter {
	return { enabled: true, type: 'PK', freq: 1000, q: 1, gain: 0, ...o };
}

describe('summarize', () => {
	it('describes the dominant band and counts the rest', () => {
		const filters = [pk(), pk({ type: 'LSQ', gain: -6 }), pk({ type: 'HSQ' }), pk()];
		expect(summarize(filters, -2.4)).toBe('LSQ 1.0k Hz -6.0 dB +3, preamp -2.4 dB');
	});

	it('omits the extra-band count for a single band', () => {
		expect(summarize([pk()], 0)).toBe('PK 1.0k Hz +0.0 dB, preamp 0.0 dB');
	});

	it('says "no bands" when all filters are disabled', () => {
		expect(summarize([pk({ enabled: false })], 0)).toBe('no bands, preamp 0.0 dB');
	});
});

describe('snapshotMatches', () => {
	it('returns true for byte-equal filter lists and preamps', () => {
		const filters = [pk({ freq: 100, gain: 3 })];
		const snap = {
			id: 'x',
			timestamp: 0,
			filters: filters.map((f) => ({ ...f })),
			preamp: -1.5,
			summary: ''
		};
		expect(snapshotMatches(snap, filters, -1.5)).toBe(true);
	});

	it('returns false on any field difference', () => {
		const snap = {
			id: 'x',
			timestamp: 0,
			filters: [pk({ gain: 3 })],
			preamp: 0,
			summary: ''
		};
		expect(snapshotMatches(snap, [pk({ gain: 4 })], 0)).toBe(false);
		expect(snapshotMatches(snap, [pk({ gain: 3 })], -0.5)).toBe(false);
	});
});

/** Back to an empty log, no picks and no bookmarks. */
function reset() {
	eqHistoryStore.clear();
	eqHistoryStore.aSnapshotId = null;
	eqHistoryStore.bSnapshotId = null;
	eqBookmarkStore.items = [];
	localStorage.clear();
}

/** Commit one snapshot past the min-gap window and return its id. */
function commit(gain: number): string {
	vi.advanceTimersByTime(2000);
	eqHistoryStore.record([pk({ gain })], 0);
	vi.advanceTimersByTime(600);
	return eqHistoryStore.snapshots.at(-1)!.id;
}

function bookmark(gain: number): string {
	return eqBookmarkStore.add({
		name: `b${gain}`,
		filters: [pk({ gain })],
		preamp: 0,
		device: null
	})!.id;
}

describe('eqHistoryStore.record', () => {
	beforeEach(() => {
		reset();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('coalesces a burst into one snapshot via the debounce window', () => {
		eqHistoryStore.record([pk({ gain: 1 })], 0);
		eqHistoryStore.record([pk({ gain: 2 })], 0);
		eqHistoryStore.record([pk({ gain: 3 })], 0);
		expect(eqHistoryStore.snapshots).toHaveLength(0); // debounce hasn’t fired yet
		vi.advanceTimersByTime(600);
		expect(eqHistoryStore.snapshots).toHaveLength(1);
		expect(eqHistoryStore.snapshots[0].filters[0].gain).toBe(3);
	});

	it('replaces the latest snapshot when commits land within the min-gap window', () => {
		eqHistoryStore.record([pk({ gain: 1 })], 0);
		vi.advanceTimersByTime(600);
		// Second commit ~100 ms later — within the 1 s gap, replace the prior entry
		eqHistoryStore.record([pk({ gain: 2 })], 0);
		vi.advanceTimersByTime(600);
		expect(eqHistoryStore.snapshots).toHaveLength(1);
		expect(eqHistoryStore.snapshots[0].filters[0].gain).toBe(2);
	});

	it('keeps separate entries when commits are spaced beyond the min gap', () => {
		eqHistoryStore.record([pk({ gain: 1 })], 0);
		vi.advanceTimersByTime(600);
		vi.advanceTimersByTime(1500); // bigger than RECORD_MIN_GAP_MS
		eqHistoryStore.record([pk({ gain: 2 })], 0);
		vi.advanceTimersByTime(600);
		expect(eqHistoryStore.snapshots).toHaveLength(2);
	});

	it('skips a commit when the state is byte-equal to the latest entry', () => {
		eqHistoryStore.record([pk({ gain: 1 })], 0);
		vi.advanceTimersByTime(600);
		vi.advanceTimersByTime(2000);
		eqHistoryStore.record([pk({ gain: 1 })], 0); // identical
		vi.advanceTimersByTime(600);
		expect(eqHistoryStore.snapshots).toHaveLength(1);
	});

	it('clear() wipes snapshots and the A/B selection', () => {
		eqHistoryStore.record([pk({ gain: 1 })], 0);
		vi.advanceTimersByTime(600);
		eqHistoryStore.setA(eqHistoryStore.snapshots[0].id);
		eqHistoryStore.clear();
		expect(eqHistoryStore.snapshots).toEqual([]);
		expect(eqHistoryStore.aSnapshotId).toBeNull();
	});

	it('suppressNext() skips exactly one record (used when applying a snapshot)', () => {
		eqHistoryStore.suppressNext();
		eqHistoryStore.record([pk({ gain: 1 })], 0);
		vi.advanceTimersByTime(600);
		expect(eqHistoryStore.snapshots).toHaveLength(0);

		// Only the next call is skipped — the following one records normally.
		eqHistoryStore.record([pk({ gain: 2 })], 0);
		vi.advanceTimersByTime(600);
		expect(eqHistoryStore.snapshots).toHaveLength(1);
		expect(eqHistoryStore.snapshots[0].filters[0].gain).toBe(2);
	});

	it('flush() commits the pending debounced record immediately', () => {
		eqHistoryStore.record([pk({ gain: 1 })], 0);
		eqHistoryStore.record([pk({ gain: 4 })], -1.5);
		expect(eqHistoryStore.snapshots).toHaveLength(0);

		eqHistoryStore.flush();
		expect(eqHistoryStore.snapshots).toHaveLength(1);
		expect(eqHistoryStore.snapshots[0].filters[0].gain).toBe(4);
		expect(eqHistoryStore.snapshots[0].preamp).toBe(-1.5);

		// The pending timer was consumed — no duplicate lands afterwards.
		vi.advanceTimersByTime(600);
		expect(eqHistoryStore.snapshots).toHaveLength(1);
	});

	it('cancelPending() drops the pending record without committing', () => {
		eqHistoryStore.record([pk({ gain: 1 })], 0);
		eqHistoryStore.cancelPending();
		vi.advanceTimersByTime(600);
		expect(eqHistoryStore.snapshots).toHaveLength(0);
	});

	it('carries an A/B selection onto the entry that supersedes it', () => {
		eqHistoryStore.record([pk({ gain: 1 })], 0);
		vi.advanceTimersByTime(600);
		const firstId = eqHistoryStore.snapshots[0].id;
		eqHistoryStore.setA(firstId);

		// Second commit within the min-gap window replaces the first entry.
		eqHistoryStore.record([pk({ gain: 2 })], 0);
		vi.advanceTimersByTime(600);
		expect(eqHistoryStore.snapshots).toHaveLength(1);
		expect(eqHistoryStore.aSnapshotId).toBe(eqHistoryStore.snapshots[0].id);
		expect(eqHistoryStore.snapshots[0].filters[0].gain).toBe(2);
	});

	it('setA / setB only accept ids that exist in the snapshot list', () => {
		eqHistoryStore.record([pk({ gain: 1 })], 0);
		vi.advanceTimersByTime(600);
		const realId = eqHistoryStore.snapshots[0].id;
		eqHistoryStore.setA(realId);
		eqHistoryStore.setA('does-not-exist');
		expect(eqHistoryStore.aSnapshotId).toBe(realId);
		eqHistoryStore.setA(null); // null is the "unset" sentinel and is allowed
		expect(eqHistoryStore.aSnapshotId).toBeNull();
	});
});

describe('eqHistoryStore.remove', () => {
	beforeEach(() => {
		reset();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('drops one entry and keeps the rest', () => {
		const first = commit(1);
		const second = commit(2);
		eqHistoryStore.remove(first);
		expect(eqHistoryStore.snapshots.map((s) => s.id)).toEqual([second]);
	});

	it('clears an A or B pick that pointed at the removed entry', () => {
		const first = commit(1);
		const second = commit(2);
		eqHistoryStore.setA(first);
		eqHistoryStore.setB(second);
		eqHistoryStore.remove(first);
		expect(eqHistoryStore.aSnapshotId).toBeNull();
		expect(eqHistoryStore.bSnapshotId).toBe(second);
	});

	it('ignores an unknown id', () => {
		commit(1);
		eqHistoryStore.remove('h-nope');
		expect(eqHistoryStore.snapshots).toHaveLength(1);
	});
});

describe('A/B across history and bookmarks', () => {
	beforeEach(() => {
		reset();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('never mints a history id that looks like a bookmark id', () => {
		const h = commit(1);
		const b = bookmark(2);
		expect(h).not.toBe(b);
		expect(eqHistoryStore.findEntry(h)).toBe(eqHistoryStore.snapshots[0]);
		expect(eqHistoryStore.findEntry(b)).toBe(eqBookmarkStore.items[0]);
	});

	it('lets A be a bookmark and B a history entry', () => {
		const h = commit(1);
		const b = bookmark(2);
		eqHistoryStore.setA(b);
		eqHistoryStore.setB(h);
		expect(eqHistoryStore.aEntry?.filters[0].gain).toBe(2);
		expect(eqHistoryStore.bEntry?.filters[0].gain).toBe(1);
	});

	it('clear() drops history picks but keeps a bookmark pick', () => {
		const h = commit(1);
		const b = bookmark(2);
		eqHistoryStore.setA(b);
		eqHistoryStore.setB(h);
		eqHistoryStore.clear();
		expect(eqHistoryStore.aSnapshotId).toBe(b);
		expect(eqHistoryStore.bSnapshotId).toBeNull();
	});

	it('a deleted bookmark resolves to no entry', () => {
		const b = bookmark(2);
		eqHistoryStore.setA(b);
		eqBookmarkStore.remove(b);
		expect(eqHistoryStore.aEntry).toBeNull();
	});
});

// Last: `install()` is page-lifetime, so its effects keep running for the
// rest of this file.
describe('eqHistoryStore.install', () => {
	beforeEach(() => {
		reset();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		eqStore.sourcePhoneUUID = null;
		eqStore.filters = [];
	});

	it('records edits without any panel mounted', () => {
		eqHistoryStore.install();
		eqStore.filters = [pk({ gain: 5 })];
		flushSync();
		vi.advanceTimersByTime(600);
		expect(eqHistoryStore.snapshots.at(-1)?.filters[0].gain).toBe(5);
	});

	it('clears the log on a device change but keeps a bookmark pick', () => {
		eqHistoryStore.install();
		eqStore.sourcePhoneUUID = 'device-a';
		flushSync();
		const h = commit(1);
		const b = bookmark(2);
		eqHistoryStore.setA(b);
		eqHistoryStore.setB(h);

		eqStore.sourcePhoneUUID = 'device-b';
		flushSync();
		expect(eqHistoryStore.snapshots).toEqual([]);
		expect(eqHistoryStore.aSnapshotId).toBe(b);
		expect(eqHistoryStore.bSnapshotId).toBeNull();
	});

	it('does not clear when the first device is picked', () => {
		eqHistoryStore.install();
		eqStore.sourcePhoneUUID = null;
		flushSync();
		commit(1);
		eqStore.sourcePhoneUUID = 'device-a';
		flushSync();
		expect(eqHistoryStore.snapshots).toHaveLength(1);
	});
});
