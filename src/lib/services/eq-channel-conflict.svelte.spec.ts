import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { eqStore, type EQFilter } from '#lib/stores/eq-store.svelte.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import {
	eqConstraintsStore,
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID,
	DEVICE_CONSTRAINT_ID
} from '#lib/stores/eq-constraints-store.svelte.js';
import { hardwareProfile } from '#lib/utils/__fixtures__/eq-profiles.js';
import { commandHistory } from './command-history.svelte.js';
import { eqChannelConflict } from './eq-channel-conflict.svelte.js';

const GRAPHIC = 'generic-10-band';
const shared: EQFilter = { enabled: true, type: 'PK', freq: 1000, q: 1, gain: 3 };
const left: EQFilter = { ...shared, freq: 200, channel: 'L' };

const device = hardwareProfile('spec-device', {
	bandCount: 5,
	band: {
		types: ['PK'],
		freq: { min: 20, max: 20000 },
		q: { min: 0.1, max: 10 },
		gain: { min: -6, max: 6 }
	}
});

describe('eqChannelConflict', () => {
	beforeEach(() => {
		eqConstraintsStore.clearDeviceConstraint();
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		eqStore.filters = [shared, left];
		eqStore.channelScope = 'L';
		commandHistory.clear();
		eqChannelConflict.install();
		flushSync();
	});

	afterEach(() => {
		eqChannelConflict.reset();
		eqConstraintsStore.clearDeviceConstraint();
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		eqStore.filters = [];
		flushSync();
	});

	it('applies a preset straight away when no band is pinned to one ear', () => {
		eqStore.filters = [shared];
		eqChannelConflict.applyPreset(GRAPHIC);
		expect(eqChannelConflict.question).toBeNull();
		expect(eqConstraintsStore.activeId).toBe(GRAPHIC);
	});

	it('asks before a preset pick, and Cancel changes nothing', () => {
		eqChannelConflict.applyPreset(GRAPHIC);
		expect(eqChannelConflict.question).toMatchObject({ kind: 'preset', count: 1 });
		expect(eqConstraintsStore.activeId).toBe(DEFAULT_CONSTRAINT_ID);

		eqChannelConflict.answer(false);
		flushSync();
		expect(eqChannelConflict.question).toBeNull();
		expect(eqConstraintsStore.activeId).toBe(DEFAULT_CONSTRAINT_ID);
		expect(eqStore.filters).toHaveLength(2);
		expect(eqStore.channelScope).toBe('L');
	});

	it('removes the per-ear bands and applies the preset as one undo entry', () => {
		eqChannelConflict.applyPreset(GRAPHIC);
		eqChannelConflict.answer(true);
		flushSync();
		expect(eqConstraintsStore.activeId).toBe(GRAPHIC);
		expect(eqStore.filters.some((f) => f.channel != null)).toBe(false);
		expect(eqStore.channelScope).toBe('BOTH');

		// Undo takes the restriction back with the bands, so they never meet.
		commandHistory.undo(frStore);
		flushSync();
		expect(eqConstraintsStore.activeId).toBe(DEFAULT_CONSTRAINT_ID);
		expect(eqStore.filters).toEqual([shared, left]);
		expect(eqStore.channelScope).toBe('L');
		expect(eqChannelConflict.question).toBeNull();

		commandHistory.redo(frStore);
		expect(eqConstraintsStore.activeId).toBe(GRAPHIC);
		expect(eqStore.filters.some((f) => f.channel != null)).toBe(false);
	});

	it('asks when a device connects, and "don\'t restrict" leaves its preset in the picker', () => {
		eqConstraintsStore.setDeviceConstraint(device, 'Spec Device');
		flushSync();
		expect(eqChannelConflict.question).toMatchObject({ kind: 'device', label: 'Spec Device' });

		eqChannelConflict.answer(false);
		flushSync();
		expect(eqConstraintsStore.activeId).toBe(DEFAULT_CONSTRAINT_ID);
		expect(eqConstraintsStore.presets.some((p) => p.id === DEVICE_CONSTRAINT_ID)).toBe(true);
		expect(eqStore.filters).toHaveLength(2);
		expect(eqChannelConflict.question).toBeNull();
	});

	it('removes the per-ear bands under a connected device, leaving it restricted', () => {
		eqConstraintsStore.setDeviceConstraint(device, 'Spec Device');
		flushSync();
		eqChannelConflict.answer(true);
		flushSync();
		expect(eqConstraintsStore.activeId).toBe(DEVICE_CONSTRAINT_ID);
		expect(eqStore.filters).toEqual([shared]);
		expect(eqChannelConflict.question).toBeNull();
	});

	it('catches per-ear bands coming back under a restriction, as an undo would', () => {
		eqStore.filters = [shared];
		eqChannelConflict.applyPreset(GRAPHIC);
		flushSync();
		eqStore.filters = [shared, left];
		flushSync();
		expect(eqChannelConflict.question).toMatchObject({ kind: 'restriction', count: 1 });
		eqChannelConflict.answer(false);
		flushSync();
		expect(eqConstraintsStore.activeId).toBe(DEFAULT_CONSTRAINT_ID);
	});
});
