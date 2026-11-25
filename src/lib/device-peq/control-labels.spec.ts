import { describe, it, expect } from 'vitest';
import type { Control } from '@potatosalad775/eqcaps-core';
import { balanceLabel, controlLabel, controlValueLabel } from './control-labels.js';
import { balanceOf } from './controls.js';

describe('controlLabel', () => {
	it('names a known role the same whatever the vendor calls it', () => {
		const named = (name: string): Control => ({
			id: 'x',
			name,
			kind: 'range',
			role: 'headroom'
		});
		expect(controlLabel(named('QX-HEADROOM'))).toBe('Headroom');
		expect(controlLabel(named('Gain margin'))).toBe('Headroom');
	});

	it('falls back to the data’s name for a role it has no words for', () => {
		const control = { id: 'x', name: 'Mystery', kind: 'toggle', role: 'telepathy' };
		expect(controlLabel(control as unknown as Control)).toBe('Mystery');
	});

	it('falls back to the data’s name for a control with no role', () => {
		expect(controlLabel({ id: 'x', name: 'QX-FEED', kind: 'toggle' })).toBe('QX-FEED');
	});

	it('translates the roles a vendor names in capitals', () => {
		const label = (role: Control['role']) =>
			controlLabel({ id: 'x', name: 'N', kind: 'toggle', role });
		expect(label('output-gain')).toBe('Output gain');
		expect(label('dac-filter')).toBe('DAC filter');
		expect(label('balance-left')).toBe('Left channel');
		expect(label('balance-right')).toBe('Right channel');
	});
});

describe('controlValueLabel', () => {
	it('says On and Off for a toggle', () => {
		const toggle: Control = { id: 't', name: 'T', kind: 'toggle' };
		expect(controlValueLabel(toggle, 1)).toBe('On');
		expect(controlValueLabel(toggle, 0)).toBe('Off');
	});

	it('keeps the device’s own name for a choice value', () => {
		const choice: Control = {
			id: 'c',
			name: 'Filter',
			kind: 'choice',
			values: [
				{ value: 0, name: 'Linear phase fast roll-off' },
				{ value: 1, name: 'Minimum phase slow roll-off' }
			]
		};
		expect(controlValueLabel(choice, 1)).toBe('Minimum phase slow roll-off');
		expect(controlValueLabel(choice, 0)).toBe('Linear phase fast roll-off');
	});

	it('writes a dB range’s value with its unit', () => {
		const gain: Control = {
			id: 'g',
			name: 'G',
			kind: 'range',
			range: { min: -12, max: 0, step: 6 },
			unit: 'dB'
		};
		expect(controlValueLabel(gain, -6)).toBe('-6 dB');
		expect(controlValueLabel(gain, 0)).toBe('0 dB');
	});

	it('writes a unitless range’s value as a bare number', () => {
		const level: Control = { id: 'l', name: 'L', kind: 'range', range: { min: 0, max: 50 } };
		expect(controlValueLabel(level, 25)).toBe('25');
	});
});

describe('balanceLabel', () => {
	const side = (role: 'balance-left' | 'balance-right', unit?: 'dB'): Control => ({
		id: role,
		name: role,
		kind: 'range',
		role,
		range: { min: -12, max: 0, step: 1 },
		...(unit ? { unit } : {})
	});
	const db = balanceOf([side('balance-left', 'dB'), side('balance-right', 'dB')])!;
	const steps = balanceOf([side('balance-left'), side('balance-right')])!;

	it('says Center for no balance', () => {
		expect(balanceLabel(db, 0)).toBe('Center');
	});

	it('names the channel that is cut, and by how much', () => {
		expect(balanceLabel(db, 6)).toBe('Left -6 dB');
		expect(balanceLabel(db, -3)).toBe('Right -3 dB');
	});

	it('leaves the unit off for a range in the device’s own steps', () => {
		expect(balanceLabel(steps, 4)).toBe('Left -4');
		expect(balanceLabel(steps, -2)).toBe('Right -2');
	});
});
