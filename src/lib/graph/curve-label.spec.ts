import { describe, it, expect } from 'vitest';
import { curveBaseName, curveDisplayName } from './curve-label.js';
import type { FRDataObject } from '$lib/types/data-types.js';

/**
 * The naming rules the on-graph labels and the inspection readout share. These
 * are pure string cases; that the two call sites actually use them is covered
 * by GraphInspection.svelte.spec.ts.
 */

function obj(extra: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid: 'a',
		type: 'phone',
		identifier: 'Phone A',
		channels: {},
		dispChannel: ['AVG'],
		colors: {},
		dash: '',
		...extra
	} as FRDataObject;
}

describe('curveBaseName', () => {
	it('appends the variant suffix', () => {
		expect(curveBaseName(obj({ dispSuffix: 'Stock' }))).toBe('Phone A Stock');
	});

	it.each([
		['empty', ''],
		['null', null],
		['absent', undefined]
	])('returns the bare identifier when the suffix is %s', (_label, dispSuffix) => {
		// Interpolating unconditionally used to leave "Phone A " / "Phone A null".
		expect(curveBaseName(obj({ dispSuffix }))).toBe('Phone A');
	});
});

describe('curveDisplayName', () => {
	it('tags non-targets with the channel', () => {
		expect(curveDisplayName(obj({ dispSuffix: 'Stock' }), 'L')).toBe('Phone A Stock (L)');
	});

	it('gives targets no channel tag', () => {
		expect(curveDisplayName(obj({ type: 'target', identifier: 'Harman' }), 'AVG')).toBe('Harman');
	});

	it('appends the adjustment summary on targets', () => {
		const target = obj({
			type: 'target',
			identifier: 'Harman',
			adjustmentLabel: '(Tilt: -0.8dB/oct, Bass: +6.0dB)'
		});
		expect(curveDisplayName(target, 'AVG')).toBe('Harman (Tilt: -0.8dB/oct, Bass: +6.0dB)');
	});

	it('combines suffix and adjustment summary on a target', () => {
		const target = obj({
			type: 'target',
			identifier: 'Harman',
			dispSuffix: '2019',
			adjustmentLabel: '(Bass: +6.0dB)'
		});
		expect(curveDisplayName(target, 'AVG')).toBe('Harman 2019 (Bass: +6.0dB)');
	});

	it('ignores the adjustment summary on non-targets', () => {
		expect(curveDisplayName(obj({ adjustmentLabel: '(Bass: +6.0dB)' }), 'AVG')).toBe(
			'Phone A (AVG)'
		);
	});
});
