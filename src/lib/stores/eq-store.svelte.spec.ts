import { describe, it, expect, beforeEach } from 'vitest';
import { eqStore, type EQFilter } from './eq-store.svelte.js';

function makeFilter(overrides: Partial<EQFilter> = {}): EQFilter {
	return {
		enabled: true,
		type: 'PK',
		freq: 1000,
		q: 1.0,
		gain: 0,
		...overrides
	};
}

describe('EQStore', () => {
	beforeEach(() => {
		eqStore.filters = [];
		eqStore.preamp = 0;
		eqStore.isEnabled = false;
		eqStore.sourcePhoneUUID = null;
		eqStore.autoEqTargetUUID = null;
	});

	describe('initial state', () => {
		it('starts with empty filters', () => {
			expect(eqStore.filters).toEqual([]);
		});

		it('starts with preamp at 0', () => {
			expect(eqStore.preamp).toBe(0);
		});

		it('starts disabled', () => {
			expect(eqStore.isEnabled).toBe(false);
		});

		it('starts with null UUIDs', () => {
			expect(eqStore.sourcePhoneUUID).toBeNull();
			expect(eqStore.autoEqTargetUUID).toBeNull();
		});
	});

	describe('addBand', () => {
		it('adds a filter to the list', () => {
			const f = makeFilter({ freq: 500, gain: 3 });
			eqStore.addBand(f);
			expect(eqStore.filters).toHaveLength(1);
			expect(eqStore.filters[0].freq).toBe(500);
		});

		it('appends to existing filters', () => {
			eqStore.addBand(makeFilter({ freq: 100 }));
			eqStore.addBand(makeFilter({ freq: 1000 }));
			eqStore.addBand(makeFilter({ freq: 10000 }));
			expect(eqStore.filters).toHaveLength(3);
		});
	});

	describe('removeBandAt', () => {
		it('removes filter at the given index', () => {
			eqStore.addBand(makeFilter({ freq: 100 }));
			eqStore.addBand(makeFilter({ freq: 1000 }));
			eqStore.addBand(makeFilter({ freq: 10000 }));

			eqStore.removeBandAt(1);
			expect(eqStore.filters).toHaveLength(2);
			expect(eqStore.filters[0].freq).toBe(100);
			expect(eqStore.filters[1].freq).toBe(10000);
		});

		it('removes the first element', () => {
			eqStore.addBand(makeFilter({ freq: 100 }));
			eqStore.addBand(makeFilter({ freq: 1000 }));
			eqStore.removeBandAt(0);
			expect(eqStore.filters).toHaveLength(1);
			expect(eqStore.filters[0].freq).toBe(1000);
		});

		it('removes the last element', () => {
			eqStore.addBand(makeFilter({ freq: 100 }));
			eqStore.addBand(makeFilter({ freq: 1000 }));
			eqStore.removeBandAt(1);
			expect(eqStore.filters).toHaveLength(1);
			expect(eqStore.filters[0].freq).toBe(100);
		});
	});

	describe('updateBandAt', () => {
		it('updates a specific property of a filter', () => {
			eqStore.addBand(makeFilter({ freq: 1000, gain: 0 }));
			eqStore.updateBandAt(0, { gain: 6 });
			expect(eqStore.filters[0].gain).toBe(6);
			expect(eqStore.filters[0].freq).toBe(1000); // unchanged
		});

		it('updates multiple properties at once', () => {
			eqStore.addBand(makeFilter({ freq: 1000, q: 1.0, gain: 0 }));
			eqStore.updateBandAt(0, { freq: 2000, q: 0.5, gain: -3 });
			expect(eqStore.filters[0].freq).toBe(2000);
			expect(eqStore.filters[0].q).toBe(0.5);
			expect(eqStore.filters[0].gain).toBe(-3);
		});

		it('ignores out-of-bounds index', () => {
			eqStore.addBand(makeFilter());
			eqStore.updateBandAt(5, { gain: 10 });
			expect(eqStore.filters[0].gain).toBe(0); // unchanged
		});

		it('ignores negative index', () => {
			eqStore.addBand(makeFilter());
			eqStore.updateBandAt(-1, { gain: 10 });
			expect(eqStore.filters[0].gain).toBe(0);
		});
	});

	describe('state updates', () => {
		it('allows setting preamp', () => {
			eqStore.preamp = -3.5;
			expect(eqStore.preamp).toBe(-3.5);
		});

		it('allows toggling isEnabled', () => {
			eqStore.isEnabled = true;
			expect(eqStore.isEnabled).toBe(true);
		});

		it('allows setting sourcePhoneUUID', () => {
			eqStore.sourcePhoneUUID = 'uuid-123';
			expect(eqStore.sourcePhoneUUID).toBe('uuid-123');
		});

		it('allows setting autoEqTargetUUID', () => {
			eqStore.autoEqTargetUUID = 'target-uuid';
			expect(eqStore.autoEqTargetUUID).toBe('target-uuid');
		});
	});
});
