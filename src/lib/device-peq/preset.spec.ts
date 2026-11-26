import { describe, it, expect } from 'vitest';
import { currentSlotOf, readRequest, tellsUnsaved, writeRequest } from './preset.js';

const NAMES = { canRead: true, canWrite: true, readsSlot: true, writesSlot: true };
const CURRENT_ONLY = { canRead: true, canWrite: true, readsSlot: false, writesSlot: false };
/** A Qudelix: asked where it is, with an EQ switch of its own, and a read that names no preset. */
const QUDELIX = {
	canRead: true,
	canWrite: true,
	readsSlot: false,
	writesSlot: true,
	readsCurrentSlot: true,
	readsEnabled: true
};

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

	it('reaches the EQ a device on no preset plays, and none of its presets it can’t name', () => {
		expect(readRequest(QUDELIX, null, 'unsaved')).toEqual({});
		expect(writeRequest(QUDELIX, null, 'unsaved')).toEqual({});
		expect(readRequest(QUDELIX, 22, 'unsaved')).toBeNull();
		expect(writeRequest(QUDELIX, 22, 'unsaved')).toEqual({ slot: 22 });
	});

	it('reaches nothing the device can’t do at all', () => {
		expect(readRequest({ ...NAMES, canRead: false }, 1, 1)).toBeNull();
		expect(writeRequest({ ...NAMES, canWrite: false }, 1, 1)).toBeNull();
	});
});

describe('tellsUnsaved', () => {
	it('holds where a null current preset can only mean none', () => {
		expect(tellsUnsaved(QUDELIX)).toBe(true);
		// A read that names its preset (Topping, Fosi) answers null for one it couldn't name.
		expect(tellsUnsaved({ ...QUDELIX, readsSlot: true })).toBe(false);
		// Without a switch of its own, null can be a bypass preset's "off".
		expect(tellsUnsaved({ ...QUDELIX, readsEnabled: false })).toBe(false);
		expect(tellsUnsaved({ ...QUDELIX, readsCurrentSlot: false })).toBe(false);
	});
});

describe('currentSlotOf', () => {
	it('reads a null answer as no preset only on a device that can say so', () => {
		expect(currentSlotOf(QUDELIX, 22)).toBe(22);
		expect(currentSlotOf(QUDELIX, null)).toBe('unsaved');
		expect(currentSlotOf({ ...QUDELIX, readsSlot: true }, null)).toBeNull();
	});
});
