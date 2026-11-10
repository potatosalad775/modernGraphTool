import { describe, it, expect } from 'vitest';
import { curveBaseName } from './curve-name.js';
import type { FRDataObject } from '#lib/types/data-types.js';

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

	it('takes anything holding just an identifier and a suffix', () => {
		expect(curveBaseName({ identifier: 'Phone A', dispSuffix: 'Stock' })).toBe('Phone A Stock');
	});
});
