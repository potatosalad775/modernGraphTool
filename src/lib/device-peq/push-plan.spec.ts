import { describe, it, expect, vi } from 'vitest';
import type { EQFilter } from '#lib/utils/equalizer.js';
import { hardwareProfile } from '#lib/utils/__fixtures__/eq-profiles.js';
import {
	drivesChannelsApart,
	listFromPull,
	needsConfirmation,
	needsReview,
	planPush,
	readLayout
} from './push-plan.js';
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
const APART = { writesPreamp: true, perChannel: true };

/** The same device, with a filter set per channel. */
const TWO_EARS = { ...FIVE_BAND, channels: 'independent' as const };

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
		// The band written boosts 12 dB, which the -12 dB written covers.
		expect(plan.clipRisk).toBe(false);
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

	it('warns of clipping where the bands need more headroom than the preamp reaches', () => {
		// Two overlapping +12 peaks boost about 22 dB; the preamp stops at -12, and Auto's is held
		// there (`headroomPreamp`), so the plan itself sees nothing to change.
		const stacked = [pk(10000, 12, { q: 0.7 }), pk(12000, 12, { q: 0.7 })];
		const plan = planPush(stacked, -12, FIVE_BAND, WRITES_PREAMP);
		expect(plan.preamp).toBe(-12);
		expect(plan.clipRisk).toBe(true);
		expect(needsReview(plan)).toBe(false);

		const right = stacked.map((f) => ({ ...f, channel: 'R' as const }));
		expect(planPush(right, -12, TWO_EARS, APART).clipRisk).toBe(true);
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
		expect(await readLayout(d, { slot: 1 })).toEqual({ filters: HELD });
		expect(d.pull).toHaveBeenCalledWith({ slot: 1 });
	});

	it('carries the right channel when the pull returned one', async () => {
		const RIGHT: (Filter | null)[] = [{ type: 'PK', freq: 200, q: 1, gain: -2 }, null];
		const d = device();
		d.pull.mockResolvedValue({ filters: HELD, right: { filters: RIGHT } });
		expect(await readLayout(d, { slot: 1 })).toEqual({ filters: HELD, right: RIGHT });
	});

	it('leaves the right channel out when the pull has none', async () => {
		expect(await readLayout(device(), { slot: 1 })).not.toHaveProperty('right');
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

describe('drivesChannelsApart', () => {
	const profile = (channels?: 'linked' | 'independent') => ({ channels });

	it('needs a filter set per channel and a bridge that can send the right one', () => {
		expect(drivesChannelsApart(profile('independent'), { perChannel: true })).toBe(true);
		expect(drivesChannelsApart(profile('independent'), { perChannel: false })).toBe(false);
		expect(drivesChannelsApart(profile('linked'), { perChannel: true })).toBe(false);
		expect(drivesChannelsApart(profile('linked'), { perChannel: false })).toBe(false);
	});

	it('is false while the bridge does not say', () => {
		expect(drivesChannelsApart(profile('independent'), {})).toBe(false);
		expect(drivesChannelsApart(profile('independent'), { perChannel: undefined })).toBe(false);
	});

	it('is false for a profile that names no channels', () => {
		expect(drivesChannelsApart(profile(), { perChannel: true })).toBe(false);
	});
});

describe('planPush on a device that drives its channels apart', () => {
	const gains = (filters: Filter[]) => filters.filter((f) => f.gain !== 0);

	it('writes a list of shared bands to both ears alike', () => {
		const plan = planPush([pk(1000, 3), pk(2000, -2)], -3, TWO_EARS, APART);
		expect(plan.right).toBeDefined();
		expect(plan.right).toEqual(plan.filters);
		expect(plan.skippedChannel).toBe(0);
		expect(plan.preamp).toBe(-3);
		expect(needsConfirmation(plan)).toBe(false);
	});

	it('sends exactly the band count to each ear', () => {
		const plan = planPush([pk(1000, 3), pk(2000, 2, { channel: 'L' })], -3, TWO_EARS, APART);
		expect(plan.filters).toHaveLength(5);
		expect(plan.right).toHaveLength(5);
	});

	it('writes a left-only band to the left ear alone, and a right-only one to the right', () => {
		const plan = planPush(
			[pk(1000, 3), pk(2000, 2, { channel: 'L' }), pk(4000, -2, { channel: 'R' })],
			-3,
			TWO_EARS,
			APART
		);
		expect(gains(plan.filters).map((f) => [f.freq, f.gain])).toEqual([
			[1000, 3],
			[2000, 2]
		]);
		expect(gains(plan.right!).map((f) => [f.freq, f.gain])).toEqual([
			[1000, 3],
			[4000, -2]
		]);
		expect(plan.skippedChannel).toBe(0);
		expect(needsReview(plan)).toBe(false);
	});

	it('sends a disabled per-ear band flat, in that ear only', () => {
		const plan = planPush(
			[pk(1000, 3), pk(2000, 2, { channel: 'R', enabled: false })],
			-3,
			TWO_EARS,
			APART
		);
		expect(plan.right![1]).toEqual({ type: 'PK', freq: 2000, q: 1, gain: 0 });
		expect(plan.filters.some((f) => f.freq === 2000)).toBe(false);
		expect(plan.changes).toEqual([]);
	});

	it('lists a shared band that had to move once, not once per ear', () => {
		const plan = planPush([pk(1000, 14)], -3, TWO_EARS, APART);
		expect(plan.changes).toEqual([
			{ kind: 'field', band: 1, field: 'gain', wanted: 14, written: 12 }
		]);
		expect(plan.filters[0].gain).toBe(12);
		expect(plan.right![0].gain).toBe(12);
	});

	it('lists the preamp once when both ears move it', () => {
		const plan = planPush([pk(1000, 14)], -14.5, TWO_EARS, APART);
		expect(plan.changes.filter((c) => c.kind === 'preamp')).toEqual([
			{ kind: 'preamp', wanted: -14.5, written: -12 }
		]);
		expect(plan.preamp).toBe(-12);
	});

	it('lists a one-ear band that had to move by its place in the list on screen', () => {
		const plan = planPush(
			[pk(500, 1), pk(1000, 14, { channel: 'L' }), pk(2000, 1, { channel: 'R' })],
			-3,
			TWO_EARS,
			APART
		);
		expect(plan.changes).toEqual([
			{ kind: 'field', band: 2, field: 'gain', wanted: 14, written: 12, ear: 'L' }
		]);
		expect(plan.filters.find((f) => f.freq === 1000)?.gain).toBe(12);
		expect(plan.right!.some((f) => f.freq === 1000)).toBe(false);
		expect(needsReview(plan)).toBe(true);
	});

	it('lists the same one-ear problem on each ear separately', () => {
		const plan = planPush(
			[pk(1000, 14, { channel: 'L' }), pk(2000, 14, { channel: 'R' })],
			-3,
			TWO_EARS,
			APART
		);
		expect(plan.changes.map((c) => (c.kind === 'field' ? c.band : null))).toEqual([1, 2]);
	});

	it('drops bands on the ear that has too many, and only there', () => {
		const left = [1, 2, 3, 4, 5].map((g, i) => pk(200 * 2 ** i, g, { channel: 'L' }));
		const plan = planPush([pk(100, 6), ...left], -6, TWO_EARS, APART);
		// The shared band plus the left's five don't fit five slots: the weakest goes.
		expect(plan.changes.filter((c) => c.kind === 'dropped')).toEqual([
			{ kind: 'dropped', band: 2, ear: 'L' }
		]);
		expect(plan.filters).toHaveLength(5);
		expect(gains(plan.filters)).toHaveLength(5);
		expect(gains(plan.filters).some((f) => f.freq === 200)).toBe(false);
		// The right ear holds the shared band alone, with nothing lost.
		expect(plan.right).toHaveLength(5);
		expect(gains(plan.right!).map((f) => f.freq)).toEqual([100]);
	});

	it('names the ear a shared band is dropped on when the other still gets it', () => {
		const left = [1, 2, 3, 4, 5].map((g, i) => pk(200 * 2 ** i, g, { channel: 'L' }));
		const plan = planPush([pk(100, 0.5), ...left], -6, TWO_EARS, APART);
		expect(plan.changes.filter((c) => c.kind === 'dropped')).toEqual([
			{ kind: 'dropped', band: 1, ear: 'L' }
		]);
		expect(gains(plan.right!).map((f) => f.freq)).toEqual([100]);
	});

	it('counts each band of the list it sends once, whichever ears it reaches', () => {
		const left = [1, 2, 3, 4, 5].map((g, i) => pk(200 * 2 ** i, g, { channel: 'L' }));
		// The shared band reaches the right ear only; the left's five fill the left ear.
		expect(planPush([pk(100, 0.5), ...left], -6, TWO_EARS, APART).sent).toBe(6);
		expect(planPush([pk(100, 1), pk(200, 1)], -1, TWO_EARS, APART).sent).toBe(2);
		expect(planPush([pk(1000, 3)], -3, FIVE_BAND, WRITES_PREAMP).sent).toBe(1);
	});

	it('reports the larger of the two ears’ spare slots', () => {
		const leftHeavy = planPush(
			[pk(100, 1, { channel: 'L' }), pk(200, 1, { channel: 'L' }), pk(300, 1, { channel: 'L' })],
			0,
			TWO_EARS,
			APART
		);
		// The left has 2 slots free, the right ear all 5.
		expect(leftHeavy.emptySlots).toBe(5);

		const rightHeavy = planPush(
			[pk(100, 1, { channel: 'L' }), pk(200, 1, { channel: 'R' }), pk(300, 1, { channel: 'R' })],
			0,
			TWO_EARS,
			APART
		);
		// The left has 4 slots free, the right ear 3.
		expect(rightHeavy.emptySlots).toBe(4);

		const full = planPush(
			[100, 200, 400, 800, 1600].map((f) => pk(f, 1)),
			0,
			TWO_EARS,
			APART
		);
		expect(full.emptySlots).toBe(0);
	});

	it('warns of clipping when only one ear boosts', () => {
		const noPreamp = { writesPreamp: false, perChannel: true };
		const plan = planPush([pk(1000, 3, { channel: 'R' })], -3, TWO_EARS, noPreamp);
		expect(plan.clipRisk).toBe(true);
		expect(plan.preamp).toBeUndefined();
		expect(planPush([pk(1000, 0)], -3, TWO_EARS, noPreamp).clipRisk).toBe(false);
	});

	it('is not infeasible while every band fits', () => {
		expect(planPush([pk(1000, 3, { channel: 'L' })], -3, TWO_EARS, APART).infeasible).toBe(false);
	});

	describe('with the device’s layout', () => {
		const held = (freqs: number[], q: number): Filter[] =>
			freqs.map((freq) => ({ type: 'PK', freq, q, gain: 4 }));
		const LEFT = held([31, 62, 125, 250, 500], 0.7);
		const RIGHT = held([41, 82, 164, 328, 656], 0.5);
		const shape = (filters: Filter[]) => filters.map((f) => [f.freq, f.q, f.gain]);

		it('fills the right ear’s empty slots from the right’s own bands when it has them', () => {
			const plan = planPush([pk(1000, 3)], -3, TWO_EARS, APART, { filters: LEFT, right: RIGHT });
			expect(shape(plan.filters)).toEqual([
				[1000, 1, 3],
				[62, 0.7, 0],
				[125, 0.7, 0],
				[250, 0.7, 0],
				[500, 0.7, 0]
			]);
			expect(shape(plan.right!)).toEqual([
				[1000, 1, 3],
				[82, 0.5, 0],
				[164, 0.5, 0],
				[328, 0.5, 0],
				[656, 0.5, 0]
			]);
		});

		it('fills the right ear from the left’s when only the left was read', () => {
			const plan = planPush([pk(1000, 3)], -3, TWO_EARS, APART, { filters: LEFT });
			expect(shape(plan.filters).slice(1)).toEqual([
				[62, 0.7, 0],
				[125, 0.7, 0],
				[250, 0.7, 0],
				[500, 0.7, 0]
			]);
			expect(plan.right).toEqual(plan.filters);
		});

		it('takes a plain list as the left’s, and gives the right ear the same', () => {
			const plan = planPush([pk(1000, 3)], -3, TWO_EARS, APART, LEFT);
			expect(shape(plan.filters).slice(1)).toEqual([
				[62, 0.7, 0],
				[125, 0.7, 0],
				[250, 0.7, 0],
				[500, 0.7, 0]
			]);
			expect(plan.right).toEqual(plan.filters);
		});
	});
});

describe('planPush where one filter set drives both ears', () => {
	const mixed = [pk(1000, 3), pk(2000, 2, { channel: 'L' }), pk(4000, -2, { channel: 'R' })];
	const written = (filters: Filter[]) => filters.filter((f) => f.gain !== 0).map((f) => f.freq);

	it('sends shared bands only when the EQ has a set per channel but the bridge cannot send it', () => {
		const plan = planPush(mixed, -3, TWO_EARS, { writesPreamp: true, perChannel: false });
		expect(plan.right).toBeUndefined();
		expect(plan.skippedChannel).toBe(2);
		expect(written(plan.filters)).toEqual([1000]);
		expect(needsReview(plan)).toBe(true);
	});

	it('sends shared bands only when the bridge could, but the EQ is linked', () => {
		const plan = planPush(mixed, -3, FIVE_BAND, APART);
		expect(plan.right).toBeUndefined();
		expect(plan.skippedChannel).toBe(2);
		expect(written(plan.filters)).toEqual([1000]);
	});

	it('takes a bridge that does not say as unable', () => {
		const plan = planPush(mixed, -3, TWO_EARS, WRITES_PREAMP);
		expect(plan.right).toBeUndefined();
		expect(plan.skippedChannel).toBe(2);
	});

	it('uses a Layout’s left bands as the hints, and ignores its right', () => {
		const left: Filter[] = [31, 62, 125, 250, 500].map((freq) => ({
			type: 'PK',
			freq,
			q: 0.7,
			gain: 4
		}));
		const plan = planPush([pk(1000, 3)], -3, FIVE_BAND, WRITES_PREAMP, {
			filters: left,
			right: left.map((f) => ({ ...f, freq: f.freq * 2 }))
		});
		expect(plan.filters.map((f) => f.freq)).toEqual([1000, 62, 125, 250, 500]);
		expect(plan.right).toBeUndefined();
	});
});

describe('listFromPull', () => {
	const f = (freq: number, gain = 2, extra: Partial<Filter> = {}): Filter => ({
		type: 'PK',
		freq,
		q: 1,
		gain,
		...extra
	});
	const band = (freq: number, gain = 2, channel?: 'L' | 'R'): EQFilter =>
		pk(freq, gain, channel ? { channel } : {});

	it('makes every band shared when one filter set came back', () => {
		const { filters, skipped } = listFromPull({ filters: [f(100), f(200), f(300, 1)] });
		expect(filters).toEqual([band(100), band(200), band(300, 1)]);
		expect(skipped).toBe(0);
	});

	it('skips an empty slot', () => {
		expect(listFromPull({ filters: [f(100), null, f(300)] }).filters).toEqual([
			band(100),
			band(300)
		]);
	});

	it('makes every band shared when the right channel equals the left, slot by slot', () => {
		const { filters } = listFromPull({
			filters: [f(100), null, f(300)],
			right: { filters: [f(100), null, f(300)] }
		});
		expect(filters).toEqual([band(100), band(300)]);
		expect(filters.every((b) => b.channel === undefined)).toBe(true);
	});

	it('splits a differing right channel: alike slots shared, the rest per ear', () => {
		const { filters, skipped } = listFromPull({
			filters: [f(100), f(200), f(300)],
			right: { filters: [f(100), f(250, -1), f(300)] }
		});
		expect(filters).toEqual([band(100), band(300), band(200, 2, 'L'), band(250, -1, 'R')]);
		expect(skipped).toBe(0);
	});

	it('orders shared first, then left, then right, whatever the slot order', () => {
		const { filters } = listFromPull({
			filters: [f(100, 1), f(200), f(300, 3)],
			right: { filters: [f(110, 1), f(200), f(310, 3)] }
		});
		expect(filters.map((b) => [b.freq, b.channel])).toEqual([
			[200, undefined],
			[100, 'L'],
			[300, 'L'],
			[110, 'R'],
			[310, 'R']
		]);
	});

	it('gives a band only one ear holds to that ear', () => {
		const { filters } = listFromPull({
			filters: [f(100), null],
			right: { filters: [null, f(400)] }
		});
		expect(filters).toEqual([band(100, 2, 'L'), band(400, 2, 'R')]);
	});

	it('does not call two bands alike when any of type, frequency, Q or gain differs', () => {
		const left = f(100);
		for (const other of [f(100, 2, { type: 'LSC' }), f(101), f(100, 2, { q: 2 }), f(100, 3)]) {
			const { filters } = listFromPull({ filters: [left], right: { filters: [other] } });
			expect(filters.map((b) => b.channel)).toEqual(['L', 'R']);
		}
	});

	it('copes with a right channel of another length', () => {
		const { filters } = listFromPull({
			filters: [f(100)],
			right: { filters: [f(100), f(200)] }
		});
		expect(filters).toEqual([band(100), band(200, 2, 'R')]);
	});

	it('counts the bands whose type has no row, in either ear', () => {
		const odd = f(100, 0, { type: 'x-weird' as Filter['type'] });
		expect(listFromPull({ filters: [odd, f(200)] })).toEqual({
			filters: [band(200)],
			skipped: 1
		});
		const split = listFromPull({
			filters: [odd, f(200)],
			right: { filters: [f(100), f(200, 1)] }
		});
		expect(split.skipped).toBe(1);
		expect(split.filters).toEqual([band(200, 2, 'L'), band(100, 2, 'R'), band(200, 1, 'R')]);
	});

	it('maps a shelf to the app’s type', () => {
		expect(listFromPull({ filters: [f(100, 2, { type: 'LSC' })] }).filters[0].type).toBe('LSQ');
	});
});
