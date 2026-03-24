import { describe, it, expect, beforeEach } from 'vitest';
import { frStore } from './fr-store.svelte.js';
import type { FRDataObject } from '$lib/types/data-types.js';

function makeFRDataObject(uuid: string, identifier = `Test ${uuid}`): FRDataObject {
	return {
		uuid,
		type: 'phone',
		identifier,
		channels: {
			AVG: { data: [[1000, 80]], metadata: { minFreq: 20, maxFreq: 20000 } }
		},
		dispChannel: ['AVG'],
		colors: { AVG: '#00ff00' },
		dash: ''
	};
}

describe('FRDataStore', () => {
	beforeEach(() => {
		frStore.clear();
	});

	describe('set / get', () => {
		it('stores and retrieves an FRDataObject', () => {
			const obj = makeFRDataObject('a');
			frStore.set('a', obj);
			expect(frStore.get('a')).toBe(obj);
		});

		it('returns null for missing keys', () => {
			expect(frStore.get('nonexistent')).toBeNull();
		});
	});

	describe('has', () => {
		it('returns true for existing keys', () => {
			frStore.set('a', makeFRDataObject('a'));
			expect(frStore.has('a')).toBe(true);
		});

		it('returns false for missing keys', () => {
			expect(frStore.has('missing')).toBe(false);
		});
	});

	describe('delete', () => {
		it('removes an entry', () => {
			frStore.set('a', makeFRDataObject('a'));
			frStore.delete('a');
			expect(frStore.has('a')).toBe(false);
			expect(frStore.get('a')).toBeNull();
		});

		it('does not throw for non-existent key', () => {
			expect(() => frStore.delete('nonexistent')).not.toThrow();
		});
	});

	describe('clear', () => {
		it('removes all entries', () => {
			frStore.set('a', makeFRDataObject('a'));
			frStore.set('b', makeFRDataObject('b'));
			frStore.clear();
			expect(frStore.size).toBe(0);
		});
	});

	describe('size', () => {
		it('returns 0 when empty', () => {
			expect(frStore.size).toBe(0);
		});

		it('reflects the number of entries', () => {
			frStore.set('a', makeFRDataObject('a'));
			frStore.set('b', makeFRDataObject('b'));
			expect(frStore.size).toBe(2);
		});

		it('decrements after delete', () => {
			frStore.set('a', makeFRDataObject('a'));
			frStore.set('b', makeFRDataObject('b'));
			frStore.delete('a');
			expect(frStore.size).toBe(1);
		});
	});

	describe('entries', () => {
		it('returns iterable map of all entries', () => {
			frStore.set('a', makeFRDataObject('a'));
			frStore.set('b', makeFRDataObject('b'));
			const entries = frStore.entries;
			expect(entries.size).toBe(2);
			expect(entries.get('a')?.identifier).toBe('Test a');
		});
	});

	describe('toJSON', () => {
		it('returns array of all values', () => {
			frStore.set('a', makeFRDataObject('a'));
			frStore.set('b', makeFRDataObject('b'));
			const json = frStore.toJSON();
			expect(json).toHaveLength(2);
			expect(json.map((o) => o.uuid).sort()).toEqual(['a', 'b']);
		});
	});

	describe('overwrite behavior', () => {
		it('overwrites existing entry with same key', () => {
			frStore.set('a', makeFRDataObject('a', 'First'));
			frStore.set('a', makeFRDataObject('a', 'Second'));
			expect(frStore.get('a')!.identifier).toBe('Second');
			expect(frStore.size).toBe(1);
		});
	});
});
