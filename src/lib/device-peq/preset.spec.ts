import { describe, it, expect } from 'vitest';
import { readRequest, writeRequest } from './preset.js';

const NAMES = { canRead: true, canWrite: true, readsSlot: true, writesSlot: true };
const CURRENT_ONLY = { canRead: true, canWrite: true, readsSlot: false, writesSlot: false };

describe('readRequest / writeRequest', () => {
	it('names the preset where the protocol can', () => {
		expect(readRequest(NAMES, 1, 0)).toEqual({ slot: 1 });
		expect(writeRequest(NAMES, 1, 0)).toEqual({ slot: 1 });
	});

	it('reaches the current preset only while the device is on it', () => {
		expect(readRequest(CURRENT_ONLY, 1, 1)).toEqual({});
		expect(writeRequest(CURRENT_ONLY, 1, 1)).toEqual({});
		// Sitting on another preset (a built-in one, or the bypass): the target is out of reach.
		expect(readRequest(CURRENT_ONLY, 1, 240)).toBeNull();
		expect(writeRequest(CURRENT_ONLY, 1, null)).toBeNull();
	});

	it('reaches the only memory of a device without presets', () => {
		expect(writeRequest(CURRENT_ONLY, null, null)).toEqual({});
	});

	it('reaches nothing the device can’t do at all', () => {
		expect(readRequest({ ...NAMES, canRead: false }, 1, 1)).toBeNull();
		expect(writeRequest({ ...NAMES, canWrite: false }, 1, 1)).toBeNull();
	});
});
