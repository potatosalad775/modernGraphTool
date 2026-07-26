import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eqStore, type EQFilter } from '$lib/stores/eq-store.svelte.js';
import { commandHistory } from './command-history.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import {
	eqConstraintsStore,
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID
} from '$lib/stores/eq-constraints-store.svelte.js';
import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';
import { eqCommands } from './eq-commands.js';

function makeFilter(overrides: Partial<EQFilter> = {}): EQFilter {
	return { enabled: true, type: 'PK', freq: 1000, q: 1.0, gain: 0, ...overrides };
}

describe('eqCommands', () => {
	beforeEach(() => {
		eqStore.filters = [];
		eqStore.preamp = 0;
		commandHistory.clear();
		eqCommands.flushAll();
	});

	describe('addBand', () => {
		it('appends a filter and is undoable', () => {
			eqCommands.addBand(makeFilter({ freq: 500, gain: 3 }));
			expect(eqStore.filters).toHaveLength(1);
			expect(eqStore.filters[0].freq).toBe(500);

			commandHistory.undo(frStore);
			expect(eqStore.filters).toHaveLength(0);

			commandHistory.redo(frStore);
			expect(eqStore.filters).toHaveLength(1);
			expect(eqStore.filters[0].gain).toBe(3);
		});

		it('preserves order across multiple adds and undos', () => {
			eqCommands.addBand(makeFilter({ freq: 100 }));
			eqCommands.addBand(makeFilter({ freq: 1000 }));
			eqCommands.addBand(makeFilter({ freq: 10000 }));
			expect(eqStore.filters.map((f) => f.freq)).toEqual([100, 1000, 10000]);

			commandHistory.undo(frStore);
			expect(eqStore.filters.map((f) => f.freq)).toEqual([100, 1000]);

			commandHistory.undo(frStore);
			expect(eqStore.filters.map((f) => f.freq)).toEqual([100]);
		});
	});

	describe('removeBand', () => {
		it('removes the band at index and undo restores it in place', () => {
			eqCommands.addBand(makeFilter({ freq: 100 }));
			eqCommands.addBand(makeFilter({ freq: 1000 }));
			eqCommands.addBand(makeFilter({ freq: 10000 }));

			eqCommands.removeBand(1);
			expect(eqStore.filters.map((f) => f.freq)).toEqual([100, 10000]);

			commandHistory.undo(frStore);
			expect(eqStore.filters.map((f) => f.freq)).toEqual([100, 1000, 10000]);
		});
	});

	describe('replaceFilters', () => {
		it('replaces the whole list and undo restores the prior list', () => {
			eqCommands.addBand(makeFilter({ freq: 100, gain: 1 }));
			eqCommands.addBand(makeFilter({ freq: 200, gain: 2 }));
			expect(eqStore.filters).toHaveLength(2);

			const incoming = [makeFilter({ freq: 5000, gain: -3 }), makeFilter({ freq: 8000, gain: 4 })];
			eqCommands.replaceFilters(incoming);
			expect(eqStore.filters.map((f) => f.freq)).toEqual([5000, 8000]);

			commandHistory.undo(frStore);
			expect(eqStore.filters.map((f) => f.freq)).toEqual([100, 200]);
			expect(eqStore.filters[1].gain).toBe(2);
		});
	});

	describe('applySnapshot', () => {
		it('replaces filters + preamp and is undoable', () => {
			eqStore.filters = [makeFilter({ freq: 1000, gain: 5 })];
			eqStore.preamp = -1;

			eqCommands.applySnapshot([makeFilter({ freq: 500, gain: -3 })], -2.5);
			expect(eqStore.filters[0].freq).toBe(500);
			expect(eqStore.filters[0].gain).toBe(-3);
			expect(eqStore.preamp).toBe(-2.5);

			commandHistory.undo(frStore);
			expect(eqStore.filters[0].freq).toBe(1000);
			expect(eqStore.filters[0].gain).toBe(5);
			expect(eqStore.preamp).toBe(-1);
		});

		it('skips no-op applies (live state already matches the snapshot)', () => {
			eqStore.filters = [makeFilter({ freq: 1000, gain: 0 })];
			eqStore.preamp = 0;
			expect(commandHistory.canUndo).toBe(false);
			eqCommands.applySnapshot([makeFilter({ freq: 1000, gain: 0 })], 0);
			expect(commandHistory.canUndo).toBe(false);
		});
	});

	describe('updateBand coalescing', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('multiple rapid edits to the same band collapse into one history entry', () => {
			eqCommands.addBand(makeFilter({ freq: 1000, gain: 0 }));

			// Simulate a drag — many quick updates
			eqCommands.updateBand(0, { gain: 1 });
			eqCommands.updateBand(0, { gain: 2 });
			eqCommands.updateBand(0, { gain: 3 });
			eqCommands.updateBand(0, { gain: 4 });
			eqCommands.updateBand(0, { gain: 5 });
			expect(eqStore.filters[0].gain).toBe(5);

			// Flush by dragend — pushes one history entry for the entire burst
			eqCommands.flushBand(0);

			// One undo should jump from gain=5 back to gain=0, not gain=4
			commandHistory.undo(frStore);
			expect(eqStore.filters[0].gain).toBe(0);

			// One more undo unwinds the addBand — history now empty
			commandHistory.undo(frStore);
			expect(eqStore.filters).toHaveLength(0);
			expect(commandHistory.canUndo).toBe(false);

			// Two redos restore the gain=5 state
			commandHistory.redo(frStore);
			commandHistory.redo(frStore);
			expect(eqStore.filters[0].gain).toBe(5);
		});

		it('auto-flushes after the coalesce window elapses', () => {
			eqCommands.addBand(makeFilter({ freq: 1000, gain: 0 }));

			eqCommands.updateBand(0, { gain: 7 });

			// Burst auto-commits after 400ms quiet period
			vi.advanceTimersByTime(500);

			commandHistory.undo(frStore);
			expect(eqStore.filters[0].gain).toBe(0);

			commandHistory.undo(frStore);
			expect(eqStore.filters).toHaveLength(0);
			expect(commandHistory.canUndo).toBe(false);
		});

		it('skips committing a no-op burst (capturedOld === final)', () => {
			eqCommands.addBand(makeFilter({ freq: 1000, gain: 5 }));

			eqCommands.updateBand(0, { gain: 5 }); // same value, after a roundtrip
			eqCommands.flushBand(0);

			// Only one history entry — the addBand. No phantom updateBand.
			commandHistory.undo(frStore);
			expect(eqStore.filters).toHaveLength(0);
			expect(commandHistory.canUndo).toBe(false);
		});
	});

	describe('toggleBandEnabled', () => {
		it('toggle is its own undo entry and is undoable', () => {
			eqCommands.addBand(makeFilter({ freq: 1000, gain: 3, enabled: true }));
			eqCommands.toggleBandEnabled(0, false);
			expect(eqStore.filters[0].enabled).toBe(false);

			commandHistory.undo(frStore);
			expect(eqStore.filters[0].enabled).toBe(true);
			expect(eqStore.filters[0].gain).toBe(3);
		});

		it('flushes a pending drag burst on another band before committing', () => {
			vi.useFakeTimers();
			eqCommands.addBand(makeFilter({ freq: 500, gain: 0 }));
			eqCommands.addBand(makeFilter({ freq: 1000, gain: 0 }));

			eqCommands.updateBand(1, { gain: 5 }); // pending burst for band 1
			eqCommands.toggleBandEnabled(0, false); // should flush band 1 first

			// history: [add0, add1, drag1, toggle0]
			commandHistory.undo(frStore); // undo toggle → enabled restored
			expect(eqStore.filters[0].enabled).toBe(true);
			expect(eqStore.filters[1].gain).toBe(5); // drag still committed

			vi.useRealTimers();
		});

		it('is a no-op when the band already has the target enabled state', () => {
			eqCommands.addBand(makeFilter({ freq: 1000, enabled: true }));
			eqCommands.toggleBandEnabled(0, true); // already true
			expect(commandHistory.canUndo).toBe(true); // only addBand in history
			commandHistory.undo(frStore);
			expect(commandHistory.canUndo).toBe(false);
		});
	});

	describe('active constraint enforcement', () => {
		const strict: EqConstraintPreset = {
			id: 'strict',
			label: 'Strict 2-band',
			mode: 'parametric',
			maxBands: 2,
			allowPk: true,
			allowLsq: false,
			allowHsq: false,
			freqMin: 100,
			freqMax: 10000,
			gainMin: -6,
			gainMax: 6,
			qMin: 0.5,
			qMax: 5
		};

		beforeEach(() => {
			eqConstraintsStore.presets = [strict];
			eqConstraintsStore.activeId = strict.id;
		});

		afterEach(() => {
			eqConstraintsStore.presets = [...BUILTIN_PRESETS];
			eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		});

		it('updateBand clamps the edit to the preset bounds before recording it', () => {
			eqStore.filters = [makeFilter({ freq: 1000, gain: 0 })];

			eqCommands.updateBand(0, { gain: 20 }); // beyond gainMax
			expect(eqStore.filters[0].gain).toBe(6);
			eqCommands.flushBand(0);

			commandHistory.undo(frStore);
			expect(eqStore.filters[0].gain).toBe(0);
		});

		it('updateBand pins a disallowed type to an allowed one', () => {
			eqStore.filters = [makeFilter({ freq: 1000 })];
			eqCommands.updateBand(0, { type: 'LSQ' }); // allowLsq is false
			eqCommands.flushBand(0);
			expect(eqStore.filters[0].type).toBe('PK');
		});

		it('addBand rejects additions past maxBands and creates no history entry', () => {
			expect(eqCommands.addBand(makeFilter({ freq: 500 }))).toBe(true);
			expect(eqCommands.addBand(makeFilter({ freq: 600 }))).toBe(true);
			expect(eqCommands.addBand(makeFilter({ freq: 700 }))).toBe(false);
			expect(eqStore.filters.map((f) => f.freq)).toEqual([500, 600]);

			// Exactly two entries in history — the rejected add pushed nothing.
			commandHistory.undo(frStore);
			commandHistory.undo(frStore);
			expect(eqStore.filters).toHaveLength(0);
			expect(commandHistory.canUndo).toBe(false);
		});

		it('addBand clamps the incoming filter into range', () => {
			eqCommands.addBand(makeFilter({ freq: 20, gain: -30, q: 9 }));
			expect(eqStore.filters[0]).toMatchObject({ freq: 100, gain: -6, q: 5 });
		});

		it('replaceFilters clamps values, trims to maxBands, and stays undoable', () => {
			eqStore.filters = [makeFilter({ freq: 1000, gain: 1 })];

			eqCommands.replaceFilters([
				makeFilter({ freq: 50, gain: 12, q: 0.2 }),
				makeFilter({ freq: 15000, gain: -12, q: 8 }),
				makeFilter({ freq: 2000, gain: 3 })
			]);

			expect(eqStore.filters).toHaveLength(2); // third row trimmed by maxBands
			expect(eqStore.filters[0]).toMatchObject({ freq: 100, gain: 6, q: 0.5 });
			expect(eqStore.filters[1]).toMatchObject({ freq: 10000, gain: -6, q: 5 });

			commandHistory.undo(frStore);
			expect(eqStore.filters).toHaveLength(1);
			expect(eqStore.filters[0].gain).toBe(1);
		});
	});
});
