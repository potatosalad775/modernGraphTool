/**
 * A device's own settings (eqcaps `protocol.controls`): where each is shown and as which widget.
 * Their names are in `control-labels.ts`. The same rules as uniPEQ's.
 */
import type { Control } from '@potatosalad775/eqcaps-core';

/**
 * The device's own settings among `controls`: those bound to no EQ. One with `eq` is a setting of
 * one of the device's EQs (a Qudelix's headroom per EQ, its user EQ's crossfeed) and is shown with
 * that EQ, so its place says whose it is.
 */
export function deviceControls(controls: readonly Control[]): Control[] {
	return controls.filter((c) => c.eq === undefined);
}

/**
 * The settings of EQ `eq` among `controls`: an id of the device's listed EQs, or undefined for the
 * EQ the profile describes, which has no id and which the data marks `eq: true`.
 */
export function eqControls(controls: readonly Control[], eq?: string): Control[] {
	return controls.filter((c) => c.eq !== undefined && c.eq === (eq ?? true));
}

/** The most values a range can have and still be offered as segments in a row. */
const MAX_SEGMENTS = 3;

/**
 * The values of a range with so few steps that it is a choice rather than a slider (a headroom of
 * 0, -6 or -12 dB), in the order they are offered; null for every other control. A range that
 * only cuts runs from 0 down, so the choice starts at no cut, as vendor apps list it; any other
 * runs up.
 */
export function rangeChoices(control: Control): number[] | null {
	const range = control.range;
	if (control.kind !== 'range' || !range || !('step' in range)) return null;
	const steps = Math.round((range.max - range.min) / range.step);
	if (steps < 1 || steps >= MAX_SEGMENTS) return null;
	// Off the grid's float noise (0.1 steps), as the data writes the values.
	const values = Array.from(
		{ length: steps + 1 },
		(_, i) => Math.round((range.min + i * range.step) * 1e10) / 1e10
	);
	return range.max <= 0 ? values.reverse() : values;
}

/**
 * A device that holds a gain per output channel shown as one balance, as vendor apps show it:
 * `n` > 0 cuts the left channel by `n`, `n` < 0 the right, 0 leaves both at their top. Two sliders
 * that each only cut would also let both channels drop, which is a second volume. Only a pair of
 * ranges on one grid that don't restart the device is merged; any other stays two rows.
 */
export interface Balance {
	left: Control;
	right: Control;
	min: number;
	max: number;
	step: number | 'any';
}

type Ranged = Control & { range: NonNullable<Control['range']> };
const ranged = (c: Control | undefined): c is Ranged => !!c?.range;

export function balanceOf(controls: readonly Control[]): Balance | null {
	const left = controls.find((c) => c.role === 'balance-left');
	const right = controls.find((c) => c.role === 'balance-right');
	if (!ranged(left) || !ranged(right) || left.reconnect || right.reconnect) return null;
	const l = left.range;
	const r = right.range;
	const step = 'step' in l ? l.step : 'any';
	if (step !== ('step' in r ? r.step : 'any')) return null;
	return { left, right, min: r.min - r.max, max: l.max - l.min, step };
}

const top = (c: Control): number => c.range?.max ?? 0;

/** The balance the device's two gains make; one where both are cut still reads as their difference. */
export function balanceValue(balance: Balance, values: Record<string, number | null>): number {
	const cut = (c: Control) => top(c) - (values[c.id] ?? top(c));
	return cut(balance.left) - cut(balance.right);
}

/**
 * The writes that set the balance to `n`, those that lower a gain first, so the sound is never
 * louder on the way than at either end. A gain already where it should be is left alone.
 */
export function balanceWrites(
	balance: Balance,
	n: number,
	values: Record<string, number | null>
): [id: string, value: number][] {
	const { left, right } = balance;
	const target: [Control, number][] = [
		[left, top(left) - Math.max(n, 0)],
		[right, top(right) + Math.min(n, 0)]
	];
	const delta = ([c, v]: [Control, number]) => v - (values[c.id] ?? top(c));
	return target
		.filter((t) => delta(t) !== 0)
		.sort((a, b) => delta(a) - delta(b))
		.map(([c, v]) => [c.id, v]);
}
