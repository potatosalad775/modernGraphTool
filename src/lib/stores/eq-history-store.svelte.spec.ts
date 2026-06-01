import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EQFilter } from '$lib/utils/equalizer.js';
import { eqHistoryStore, summarize, snapshotMatches } from './eq-history-store.svelte.js';

function pk(o: Partial<EQFilter> = {}): EQFilter {
	return { enabled: true, type: 'PK', freq: 1000, q: 1, gain: 0, ...o };
}

describe('summarize', () => {
	it('reports the dominant band (largest |gain|) with a +N tail for the rest', () => {
		const filters = [pk({ freq: 100, gain: 2 }), pk({ freq: 3000, gain: -6 }), pk({ freq: 8000, gain: 1 })];
		// dominant = 3000 Hz / -6 dB; two other enabled bands → ' +2'
		expect(summarize(filters, -2.4)).toBe('PK 3.0k Hz -6.0 dB +2, preamp -2.4 dB');
	});

	it('omits the +N tail for a single band and shows sub-1k freqs as plain Hz', () => {
		expect(summarize([pk({ freq: 200, gain: 3 })], 0)).toBe('PK 200 Hz +3.0 dB, preamp 0.0 dB');
	});

	it('rounds freqs ≥10 kHz to whole-k', () => {
		expect(summarize([pk({ freq: 12000, gain: -2 })], 0)).toBe('PK 12k Hz -2.0 dB, preamp 0.0 dB');
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
