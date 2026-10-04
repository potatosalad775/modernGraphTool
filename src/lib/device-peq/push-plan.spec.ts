import { describe, it, expect } from 'vitest';
import type { EQFilter } from '$lib/utils/equalizer.js';
import { hardwareProfile } from '$lib/utils/__fixtures__/eq-profiles.js';
import { needsConfirmation, planPush } from './push-plan.js';

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

	it('sends neither disabled nor per-channel bands, and counts the latter', () => {
		const plan = planPush(
			[pk(1000, 3, { enabled: false }), pk(2000, 2, { channel: 'L' }), pk(4000, 1)],
			-1,
			FIVE_BAND,
			WRITES_PREAMP
		);
		expect(plan.filters.filter((f) => f.gain !== 0)).toEqual([
			{ type: 'PK', freq: 4000, q: 1, gain: 1 }
		]);
		expect(plan.skippedChannel).toBe(1);
		expect(needsConfirmation(plan)).toBe(true);
	});

	it('leaves the preamp out where the protocol can’t write it, and warns of clipping', () => {
		const plan = planPush([pk(1000, 3)], -3, FIVE_BAND, { writesPreamp: false });
		expect(plan.preamp).toBeUndefined();
		expect(plan.clipRisk).toBe(true);
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
