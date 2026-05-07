import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EQFilter } from '$lib/utils/equalizer.js';
import { eqHistoryStore, summarize, snapshotMatches } from './eq-history-store.svelte.js';

function pk(o: Partial<EQFilter> = {}): EQFilter {
	return { enabled: true, type: 'PK', freq: 1000, q: 1, gain: 0, ...o };
}

describe('summarize', () => {
	it('counts each filter type and includes preamp', () => {
		const filters = [pk(), pk({ type: 'LSQ' }), pk({ type: 'HSQ' }), pk()];
		expect(summarize(filters, -2.4)).toBe('2 PK / 1 LS / 1 HS, preamp -2.4 dB');
	});

	it('skips counts of zero', () => {
		expect(summarize([pk()], 0)).toBe('1 PK, preamp 0.0 dB');
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

describe('eqHistoryStore.record', () => {
	beforeEach(() => {
		eqHistoryStore.clear();
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
