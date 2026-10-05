import { describe, it, expect, vi } from 'vitest';
import type { EQFilter } from '$lib/utils/equalizer.js';
import { hardwareProfile } from '$lib/utils/__fixtures__/eq-profiles.js';
import { needsConfirmation, needsReview, planPush, readLayout } from './push-plan.js';
import type { Filter } from '@potatosalad775/eqcaps-core';
import type { PeqDevice } from './types.js';

const pk = (freq: number, gain: number, extra: Partial<EQFilter> = {}): EQFilter => ({
	enabled: true,
	type: 'PK',
	freq,
	q: 1,
	gain,
	...extra
});

const FIVE_BAND = hardwareProfile('five', {
	bandCount: 5,
	band: {
		types: ['PK'],
		freq: { min: 20, max: 20000, step: 1 },
		q: { min: 0.1, max: 10, step: 0.01 },
		gain: { min: -12, max: 12, step: 0.5 }
	}
});

const WRITES_PREAMP = { writesPreamp: true };

describe('planPush', () => {
	it('sends every device band, filling unused ones with flat filters', () => {
		const plan = planPush([pk(1000, 3)], -3, FIVE_BAND, WRITES_PREAMP);
		expect(plan.filters).toHaveLength(5);
		expect(plan.filters[0]).toEqual({ type: 'PK', freq: 1000, q: 1, gain: 3 });
		expect(plan.filters.slice(1).every((f) => f.gain === 0)).toBe(true);
		expect(plan.preamp).toBe(-3);
		expect(needsConfirmation(plan)).toBe(false);
	});

	it('lists every value it had to move instead of changing it silently', () => {
		const plan = planPush([pk(1000, 14.2)], -14.5, FIVE_BAND, WRITES_PREAMP);
		expect(plan.changes).toContainEqual({
			kind: 'field',
			band: 1,
			field: 'gain',
			wanted: 14.2,
			written: 12
		});
		expect(plan.changes).toContainEqual({ kind: 'preamp', wanted: -14.5, written: -12 });
		expect(needsConfirmation(plan)).toBe(true);
	});

	it('maps shelves to the device’s codes and reports a type the slot refuses', () => {
		const plan = planPush([pk(100, 3, { type: 'LSQ' })], -3, FIVE_BAND, WRITES_PREAMP);
		expect(plan.filters[0].type).toBe('PK');
		expect(plan.changes).toContainEqual({
			kind: 'field',
			band: 1,
			field: 'type',
			wanted: 'LSC',
			written: 'PK'
		});
	});

	it('reports bands that found no slot, by their place in the list', () => {
		const filters = [1, 2, 3, 4, 5, 6].map((g, i) => pk(100 * 2 ** i, g));
		const plan = planPush(filters, -6, FIVE_BAND, WRITES_PREAMP);
		// The least significant band (smallest |gain|) is the one left out.
		expect(plan.changes).toContainEqual({ kind: 'dropped', band: 1 });
		expect(plan.filters).toHaveLength(5);
	});

	it('sends a disabled band flat in its own slot, and skips per-channel bands', () => {
		const plan = planPush(
			[pk(1000, 3, { enabled: false }), pk(2000, 2, { channel: 'L' }), pk(4000, 1)],
			-1,
			FIVE_BAND,
			WRITES_PREAMP
		);
		expect(plan.filters.slice(0, 2)).toEqual([
			{ type: 'PK', freq: 1000, q: 1, gain: 0 },
			{ type: 'PK', freq: 4000, q: 1, gain: 1 }
		]);
		expect(plan.changes).toEqual([]);
		expect(plan.skippedChannel).toBe(1);
		expect(needsConfirmation(plan)).toBe(true);
	});

	it('writes flat bands as they are, in list order', () => {
		const bands = [31, 62, 125, 250, 500];
		const plan = planPush(
			bands.map((f, i) => pk(f, i === 0 ? 3 : 0, { q: 0.75 })),
			-3,
			FIVE_BAND,
			WRITES_PREAMP
		);
		expect(plan.filters.map((f) => [f.freq, f.q, f.gain])).toEqual(
			bands.map((f, i) => [f, 0.75, i === 0 ? 3 : 0])
		);
		expect(needsConfirmation(plan)).toBe(false);
	});

	it('leaves the preamp out where the protocol can’t write it, and warns of clipping', () => {
		const plan = planPush([pk(1000, 3)], -3, FIVE_BAND, { writesPreamp: false });
		expect(plan.preamp).toBeUndefined();
		expect(plan.clipRisk).toBe(true);
		// Shown before a button write, but not a reason for auto-write to pause.
		expect(needsConfirmation(plan)).toBe(true);
		expect(needsReview(plan)).toBe(false);
	});

	it('trusts a device that sets its own headroom', () => {
		const auto = hardwareProfile('auto', { bandCount: 5, preamp: { mode: 'auto' } });
		const plan = planPush([pk(1000, 3)], -3, auto, WRITES_PREAMP);
		expect(plan.preamp).toBeUndefined();
		expect(plan.clipRisk).toBe(false);
	});

	it('does not count a band that was flat to begin with as dropped', () => {
		const plan = planPush([pk(1000, 0), pk(2000, 3)], -3, FIVE_BAND, WRITES_PREAMP);
		expect(plan.changes.filter((c) => c.kind === 'dropped')).toEqual([]);
	});
});

describe('planPush with the device’s layout', () => {
	it('counts the device bands the list leaves empty', () => {
		expect(planPush([pk(1000, 3)], 0, FIVE_BAND, WRITES_PREAMP).emptySlots).toBe(4);
		const full = [100, 200, 400, 800, 1600].map((f) => pk(f, 1));
		expect(planPush(full, 0, FIVE_BAND, WRITES_PREAMP).emptySlots).toBe(0);
	});

	it('writes what the device held in each empty band, flat', () => {
		const held = [31, 62, 125, 250, 500].map((freq): Filter => ({
			type: 'PK',
			freq,
			q: 0.7,
			gain: 4
		}));
		const plan = planPush([pk(1000, 3)], -3, FIVE_BAND, WRITES_PREAMP, held);
		expect(plan.filters.map((f) => [f.freq, f.q, f.gain])).toEqual([
			[1000, 1, 3],
			[62, 0.7, 0],
			[125, 0.7, 0],
			[250, 0.7, 0],
			[500, 0.7, 0]
		]);
		expect(needsConfirmation(plan)).toBe(false);
	});
});

describe('readLayout', () => {
	const HELD: (Filter | null)[] = [{ type: 'PK', freq: 100, q: 1, gain: 2 }, null];
	const device = () => ({ pull: vi.fn<PeqDevice['pull']>(async () => ({ filters: HELD })) });

	it('reads the preset the request reaches', async () => {
		const d = device();
		expect(await readLayout(d, { slot: 1 })).toEqual(HELD);
		expect(d.pull).toHaveBeenCalledWith({ slot: 1 });
	});

	it('reads nothing when the preset can’t be reached', async () => {
		const d = device();
		expect(await readLayout(d, null)).toBeNull();
		expect(d.pull).not.toHaveBeenCalled();
	});

	it('gives up quietly when the read fails', async () => {
		const d = device();
		d.pull.mockRejectedValue(new Error('timeout'));
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(await readLayout(d, {})).toBeNull();
		warn.mockRestore();
	});
});
