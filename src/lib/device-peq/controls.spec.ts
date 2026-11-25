import { describe, it, expect } from 'vitest';
import type { Control } from '@potatosalad775/eqcaps-core';
import {
	balanceOf,
	balanceValue,
	balanceWrites,
	deviceControls,
	eqControls,
	rangeChoices
} from './controls.js';

const toggle = (id: string, over: Partial<Control> = {}): Control => ({
	id,
	name: id,
	kind: 'toggle',
	...over
});

const range = (id: string, min: number, max: number, step?: number, over: Partial<Control> = {}) =>
	({
		id,
		name: id,
		kind: 'range',
		range: step === undefined ? { min, max } : { min, max, step },
		...over
	}) satisfies Control;

describe('deviceControls / eqControls', () => {
	const own = toggle('own', { eq: true });
	const listed = toggle('listed', { eq: 'user' });
	const other = toggle('other', { eq: 'speaker' });
	const device = toggle('device');
	const all = [own, listed, other, device];

	it('keeps the device settings: those bound to no EQ', () => {
		expect(deviceControls(all)).toEqual([device]);
	});

	it('gives the EQ the profile describes only the settings marked eq: true', () => {
		expect(eqControls(all)).toEqual([own]);
	});

	it('gives a listed EQ the settings named for its id', () => {
		expect(eqControls(all, 'user')).toEqual([listed]);
		expect(eqControls(all, 'speaker')).toEqual([other]);
		expect(eqControls(all, 'nobody')).toEqual([]);
	});

	it('leaves the order as given', () => {
		const a = toggle('a');
		const b = toggle('b');
		expect(deviceControls([b, own, a])).toEqual([b, a]);
	});
});

describe('rangeChoices', () => {
	it('offers a cut-only range from no cut downwards', () => {
		expect(rangeChoices(range('h', -12, 0, 6))).toEqual([0, -6, -12]);
	});

	it('offers any other short range upwards', () => {
		expect(rangeChoices(range('g', 0, 2, 1))).toEqual([0, 1, 2]);
		expect(rangeChoices(range('g', -3, 0.5, 3.5))).toEqual([-3, 0.5]);
	});

	it('offers a single step as two values', () => {
		expect(rangeChoices(range('g', 0, 1, 1))).toEqual([0, 1]);
	});

	it('leaves a range with more than three values to a slider', () => {
		expect(rangeChoices(range('g', 0, 50, 1))).toBeNull();
		expect(rangeChoices(range('g', 0, 3, 1))).toBeNull();
	});

	it('leaves a range with no step to a slider', () => {
		expect(rangeChoices(range('g', 0, 2))).toBeNull();
	});

	it('is null for a range with no values to step through', () => {
		expect(rangeChoices(range('g', 1, 1, 1))).toBeNull();
	});

	it('is null for a choice and a toggle', () => {
		const choice: Control = {
			id: 'c',
			name: 'c',
			kind: 'choice',
			values: [
				{ value: 0, name: 'A' },
				{ value: 1, name: 'B' }
			]
		};
		expect(rangeChoices(choice)).toBeNull();
		expect(rangeChoices(toggle('t'))).toBeNull();
	});

	it('is null for a range kind that carries no range', () => {
		expect(rangeChoices({ id: 'r', name: 'r', kind: 'range' })).toBeNull();
	});

	it('writes the values as the data does, with no float noise', () => {
		expect(rangeChoices(range('g', 0, 0.2, 0.1))).toEqual([0, 0.1, 0.2]);
		// 0.1 + 2 * 0.1 is 0.30000000000000004
		expect(rangeChoices(range('g', 0.1, 0.3, 0.1))).toEqual([0.1, 0.2, 0.3]);
		expect(rangeChoices(range('g', -0.3, -0.1, 0.1))).toEqual([-0.1, -0.2, -0.3]);
	});
});

describe('balance', () => {
	const left = range('l', -12, 0, 1, { role: 'balance-left' });
	const right = range('r', -12, 0, 1, { role: 'balance-right' });
	const balance = balanceOf([left, right])!;

	describe('balanceOf', () => {
		it('merges a pair on one grid into a slider across both gains', () => {
			expect(balance).toMatchObject({ left, right, min: -12, max: 12, step: 1 });
		});

		it('finds the pair among other settings, whatever the order', () => {
			const other = toggle('other');
			expect(balanceOf([right, other, left])).toMatchObject({ left, right });
		});

		it('takes the span of ranges that run up as well', () => {
			const l = range('l', -6, 6, 1, { role: 'balance-left' });
			const r = range('r', -6, 6, 1, { role: 'balance-right' });
			expect(balanceOf([l, r])).toMatchObject({ min: -12, max: 12 });
		});

		it('is continuous when neither side has a step', () => {
			const l = range('l', -12, 0, undefined, { role: 'balance-left' });
			const r = range('r', -12, 0, undefined, { role: 'balance-right' });
			expect(balanceOf([l, r])?.step).toBe('any');
		});

		it('stays two rows when the steps differ', () => {
			const coarse = range('r', -12, 0, 2, { role: 'balance-right' });
			expect(balanceOf([left, coarse])).toBeNull();
			const free = range('r', -12, 0, undefined, { role: 'balance-right' });
			expect(balanceOf([left, free])).toBeNull();
		});

		it('stays two rows when either side restarts the device', () => {
			const restarting = { ...left, reconnect: true };
			expect(balanceOf([restarting, right])).toBeNull();
			expect(balanceOf([left, { ...right, reconnect: true }])).toBeNull();
		});

		it('stays as it is when a side is missing, or is no range', () => {
			expect(balanceOf([left])).toBeNull();
			expect(balanceOf([right])).toBeNull();
			expect(balanceOf([])).toBeNull();
			expect(balanceOf([left, { ...right, kind: 'toggle', range: undefined }])).toBeNull();
		});
	});

	describe('balanceValue', () => {
		it('is 0 with both channels at their top, or unread', () => {
			expect(balanceValue(balance, { l: 0, r: 0 })).toBe(0);
			expect(balanceValue(balance, {})).toBe(0);
			expect(balanceValue(balance, { l: null, r: null })).toBe(0);
		});

		it('is positive for a cut left channel and negative for a cut right one', () => {
			expect(balanceValue(balance, { l: -6, r: 0 })).toBe(6);
			expect(balanceValue(balance, { l: 0, r: -4 })).toBe(-4);
		});

		it('reads two cut channels as their difference', () => {
			expect(balanceValue(balance, { l: -6, r: -2 })).toBe(4);
			expect(balanceValue(balance, { l: -3, r: -3 })).toBe(0);
		});

		it('measures a cut from the top of its own range', () => {
			const l = range('l', -6, 6, 1, { role: 'balance-left' });
			const r = range('r', -6, 6, 1, { role: 'balance-right' });
			const b = balanceOf([l, r])!;
			expect(balanceValue(b, { l: 0, r: 6 })).toBe(6);
		});
	});

	describe('balanceWrites', () => {
		it('cuts the left channel for a positive balance', () => {
			expect(balanceWrites(balance, 6, { l: 0, r: 0 })).toEqual([['l', -6]]);
		});

		it('cuts the right channel for a negative balance', () => {
			expect(balanceWrites(balance, -4, { l: 0, r: 0 })).toEqual([['r', -4]]);
		});

		it('writes the gain that lowers first, so it is never louder on the way', () => {
			// From 6 to -6: the right channel drops, then the left comes back up.
			expect(balanceWrites(balance, -6, { l: -6, r: 0 })).toEqual([
				['r', -6],
				['l', 0]
			]);
			// And the other way round.
			expect(balanceWrites(balance, 6, { l: 0, r: -6 })).toEqual([
				['l', -6],
				['r', 0]
			]);
		});

		it('leaves out a gain already in place', () => {
			expect(balanceWrites(balance, 6, { l: 0, r: 0 })).toHaveLength(1);
			expect(balanceWrites(balance, 6, { l: -6, r: 0 })).toEqual([]);
		});

		it('restores both channels at 0', () => {
			expect(balanceWrites(balance, 0, { l: -6, r: 0 })).toEqual([['l', 0]]);
			expect(balanceWrites(balance, 0, { l: 0, r: -6 })).toEqual([['r', 0]]);
			// Both come up; the smaller rise goes first.
			expect(balanceWrites(balance, 0, { l: -6, r: -2 })).toEqual([
				['r', 0],
				['l', 0]
			]);
		});

		it('treats an unread gain as at its top', () => {
			expect(balanceWrites(balance, 0, {})).toEqual([]);
			expect(balanceWrites(balance, 3, { l: null, r: null })).toEqual([['l', -3]]);
		});
	});
});
