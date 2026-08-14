import { describe, it, expect, beforeEach } from 'vitest';
import { phoneBook, moveBy } from './phone-book-store.svelte';
import {
	createDefaultPhoneBook,
	createEmptyBrand,
	createEmptyPhone,
	serializePhoneBook,
	parsePhoneBook
} from '../../../utils/phoneBookConverter';

/**
 * Companion to `config-editor/config-store.spec.ts`: the editor now mutates a
 * `$state` book in place rather than rebuilding it through a reducer, so what
 * needs pinning is that `serializePhoneBook` cannot tell the proxy from a plain
 * array, and that the structural operations that stayed in the store behave the
 * way their reducer cases did.
 */

describe('the phone book store is transparent to the serializer', () => {
	beforeEach(() => phoneBook.reset());

	it('emits identical JSON for the store and a plain default book', () => {
		expect(serializePhoneBook(phoneBook.book)).toBe(serializePhoneBook(createDefaultPhoneBook()));
	});

	it('round-trips in-place edits across every phone kind', () => {
		const brand = phoneBook.book[0];
		brand.name = 'Truthear';
		brand.phones = [
			{ ...createEmptyPhone('simple'), simple: { value: 'Zero' } },
			{ ...createEmptyPhone('detailed'), detailed: { name: 'Hexa', file: 'Hexa', suffix: 'v2' } },
			{
				...createEmptyPhone('variations'),
				variations: { name: 'Nova', rows: [{ file: 'Nova foam', suffix: '(Foam)' }] }
			},
			{
				...createEmptyPhone('prefix'),
				prefix: { name: 'Gate', prefix: 'Truthear ', files: ['Gate', 'Gate RED'] }
			},
			{
				...createEmptyPhone('sampleSet'),
				sampleSet: {
					name: 'Pentaconn',
					variants: [
						{ suffix: 'Stock', file: 'Penta', count: 3, rows: [], labels: [], display: ['avg'] }
					]
				}
			}
		];

		// Mutate through the proxy the way the field components do.
		brand.phones[1].detailed!.file = 'Hexa_Data';
		brand.phones[3].prefix!.files.push('Gate BLUE');
		brand.phones[4].sampleSet!.variants[0].display = ['avg', 'fill'];

		const back = parsePhoneBook(serializePhoneBook(phoneBook.book)).state;
		expect(back[0].name).toBe('Truthear');
		expect(back[0].phones.map((p) => p.kind)).toEqual([
			'simple',
			'detailed',
			'variations',
			'prefix',
			'sampleSet'
		]);
		expect(back[0].phones[1].detailed?.file).toBe('Hexa_Data');
		expect(back[0].phones[3].prefix?.files).toEqual(['Gate', 'Gate RED', 'Gate BLUE']);
		expect(back[0].phones[4].sampleSet?.variants[0].display).toEqual(['avg', 'fill']);
	});
});

describe('structural operations', () => {
	beforeEach(() => phoneBook.reset());

	it('moveBy swaps with the neighbour and refuses to run off either end', () => {
		const items = ['a', 'b', 'c'];
		expect(moveBy(items, 'b', 'up')).toBe(true);
		expect(items).toEqual(['b', 'a', 'c']);
		expect(moveBy(items, 'b', 'up')).toBe(false);
		expect(moveBy(items, 'c', 'down')).toBe(false);
		expect(items).toEqual(['b', 'a', 'c']);
	});

	it('sortBrandsAlpha is case-insensitive and sorts in place', () => {
		phoneBook.load(
			['moondrop', 'Truthear', 'Etymotic'].map((name) => ({ ...createEmptyBrand(), name }))
		);
		phoneBook.sortBrandsAlpha();
		expect(phoneBook.book.map((b) => b.name)).toEqual(['Etymotic', 'moondrop', 'Truthear']);
	});

	it('switchKind writes the converted phone back into its slot', () => {
		const brand = phoneBook.book[0];
		brand.phones = [{ ...createEmptyPhone('detailed'), detailed: { name: 'Aria', file: 'Aria' } }];
		const phone = brand.phones[0];

		phoneBook.switchKind(brand, phone, 'simple');

		expect(brand.phones).toHaveLength(1);
		expect(brand.phones[0].kind).toBe('simple');
		// switchPhoneKind carries the name across rather than starting blank.
		expect(brand.phones[0].simple?.value).toBe('Aria');
	});
});
