import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	parsePhoneBook,
	serializePhoneBook,
	switchPhoneKind,
	extractName,
	createEmptyPhone,
	type PhoneBookState,
	type PhoneState,
	type BrandState
} from './phoneBookConverter';

/**
 * phone_book.json is hand-authored by operators and read by both modernGraphTool
 * and CrinGraph, so the property under test is that the editor never loses or
 * mangles what it was given. Ids are regenerated on every parse, so they are
 * stripped before comparing.
 */

function stripIds<T>(value: T): T {
	return JSON.parse(JSON.stringify(value, (key, v) => (key === 'id' ? undefined : v))) as T;
}

/** state → phone_book.json → state, the full path the editor's export/import takes */
function roundTrip(state: PhoneBookState): PhoneBookState {
	return parsePhoneBook(serializePhoneBook(state)).state;
}

function expectRoundTrip(state: PhoneBookState) {
	expect(stripIds(roundTrip(state))).toEqual(stripIds(state));
}

function brandWith(phones: PhoneState[], name = 'Moondrop'): BrandState {
	return { id: 'brand_1', name, phones };
}

describe('round trip per phone kind', () => {
	it('simple', () => {
		expectRoundTrip([brandWith([{ id: 'p1', kind: 'simple', simple: { value: 'Aria 2' } }])]);
	});

	it('detailed', () => {
		expectRoundTrip([
			brandWith([
				{
					id: 'p1',
					kind: 'detailed',
					detailed: { name: 'Blessing 3', file: 'Blessing 3', suffix: '(stock)' }
				}
			])
		]);
	});

	it('detailed without a suffix', () => {
		expectRoundTrip([
			brandWith([{ id: 'p1', kind: 'detailed', detailed: { name: 'Aria 2', file: 'Aria 2' } }])
		]);
	});

	it('variations', () => {
		expectRoundTrip([
			brandWith([
				{
					id: 'p1',
					kind: 'variations',
					variations: {
						name: 'Variations',
						rows: [
							{ file: 'Variations stock', suffix: 'Stock' },
							{ file: 'Variations mod', suffix: 'Modded' }
						]
					}
				}
			])
		]);
	});

	it('prefix', () => {
		expectRoundTrip([
			brandWith([
				{
					id: 'p1',
					kind: 'prefix',
					prefix: { name: 'Zero', prefix: 'Truthear ', files: ['Zero', 'Zero RED'] }
				}
			])
		]);
	});

	it('sampleSet with the numbered shorthand', () => {
		expectRoundTrip([
			brandWith([
				{
					id: 'p1',
					kind: 'sampleSet',
					sampleSet: {
						name: 'Chu 2',
						variants: [
							{ suffix: 'Stock', file: 'Chu 2', count: 5, rows: [], labels: [], display: ['avg'] }
						]
					}
				}
			])
		]);
	});

	it('sampleSet with explicit rows, labels and display modes', () => {
		expectRoundTrip([
			brandWith([
				{
					id: 'p1',
					kind: 'sampleSet',
					sampleSet: {
						name: 'Chu 2',
						variants: [
							{
								suffix: 'Leather Pad',
								file: 'Chu 2 leather',
								count: 0,
								rows: [
									{ file: 'Chu 2 leather 1', label: 'Unit A' },
									{ file: 'Chu 2 leather 2', label: 'Unit B' }
								],
								labels: [],
								display: ['avg', 'curves', 'fill'],
								sampleDescription: '(Unit Variance)',
								description: 'Five units, leather pads'
							}
						]
					}
				}
			])
		]);
	});

	it('keeps a variant description apart from the set caption', () => {
		const json = JSON.stringify([
			{
				name: 'Sennheiser',
				phones: [
					{
						name: 'HD 600',
						variants: [
							{ suffix: 'Taped', file: 'HD600 Taped', description: 'Port sealed' },
							{
								suffix: 'Leather',
								file: 'HD600 Leather',
								description: 'Dekoni pads',
								samples: { count: 3, description: '(Positional Variance)' }
							}
						]
					}
				]
			}
		]);
		const [taped, leather] = parsePhoneBook(json).state[0].phones[0].sampleSet!.variants;
		expect(taped).toMatchObject({ description: 'Port sealed', sampleDescription: undefined });
		expect(leather).toMatchObject({
			description: 'Dekoni pads',
			sampleDescription: '(Positional Variance)'
		});

		const emitted = JSON.parse(serializePhoneBook(parsePhoneBook(json).state));
		expect(emitted[0].phones[0].variants).toEqual([
			{ suffix: 'Taped', file: 'HD600 Taped', description: 'Port sealed' },
			{
				suffix: 'Leather',
				file: 'HD600 Leather',
				description: 'Dekoni pads',
				samples: { count: 3, description: '(Positional Variance)' }
			}
		]);
	});

	it('sampleSet with multiple variants', () => {
		expectRoundTrip([
			brandWith([
				{
					id: 'p1',
					kind: 'sampleSet',
					sampleSet: {
						name: 'HD 600',
						variants: [
							{ suffix: 'Stock', file: 'HD 600', count: 3, rows: [], labels: [], display: ['avg'] },
							{
								suffix: 'Modded',
								file: 'HD 600 mod',
								count: 4,
								rows: [],
								labels: ['a', 'b', 'c', 'd'],
								display: ['avg', 'curves']
							}
						]
					}
				}
			])
		]);
	});
});

describe('shared metadata', () => {
	it('survives a round trip on a detailed phone', () => {
		expectRoundTrip([
			brandWith([
				{
					id: 'p1',
					kind: 'detailed',
					detailed: { name: 'Aria 2', file: 'Aria 2' },
					reviewScore: '4.5',
					reviewLink: 'https://example.com/review',
					shopLink: 'https://example.com/shop',
					price: '$99',
					description: 'A budget set',
					links: [{ label: 'Measurements', url: 'https://example.com/m' }]
				}
			])
		]);
	});

	it('drops link rows that are blank on either side', () => {
		const state: PhoneBookState = [
			brandWith([
				{
					id: 'p1',
					kind: 'detailed',
					detailed: { name: 'Aria 2', file: 'Aria 2' },
					links: [
						{ label: 'Good', url: 'https://example.com' },
						{ label: '', url: 'https://example.com/orphan' },
						{ label: 'No URL', url: '   ' }
					]
				}
			])
		];
		const back = roundTrip(state);
		expect(back[0].phones[0].links).toEqual([{ label: 'Good', url: 'https://example.com' }]);
	});
});

describe('unknown keys', () => {
	it('preserves keys the editor does not model', () => {
		const source = JSON.stringify([
			{
				name: 'Moondrop',
				phones: [
					{
						name: 'Aria 2',
						file: 'Aria 2',
						someFutureKey: { nested: true },
						anotherOne: 'kept'
					}
				]
			}
		]);
		const { state } = parsePhoneBook(source);
		expect(state[0].phones[0].passthrough).toEqual({
			someFutureKey: { nested: true },
			anotherOne: 'kept'
		});

		const reparsed = JSON.parse(serializePhoneBook(state));
		expect(reparsed[0].phones[0].someFutureKey).toEqual({ nested: true });
		expect(reparsed[0].phones[0].anotherOne).toBe('kept');
	});
});

describe('brand suffix', () => {
	it('round-trips when present and is omitted when empty', () => {
		expectRoundTrip([
			{
				id: 'b1',
				name: 'Truthear',
				suffix: ' (2024)',
				phones: [{ id: 'p1', kind: 'detailed', detailed: { name: 'Zero', file: 'Zero' } }]
			}
		]);

		const emitted = JSON.parse(
			serializePhoneBook([
				brandWith([{ id: 'p1', kind: 'detailed', detailed: { name: 'Zero', file: 'Zero' } }])
			])
		);
		expect('suffix' in emitted[0]).toBe(false);
	});
});

describe('the phone-level file beside variants[]', () => {
	// CrinGraph and squig.link's search read `file` and nothing else, so every
	// sample-set phone is exported with one. modernGraphTool upgrades a mirrored
	// variant in place, so the mirror must not reorder or duplicate anything.
	const emit = (variants: Record<string, unknown>[], extra: Record<string, unknown> = {}) => {
		const source = JSON.stringify([
			{ name: 'Moondrop', phones: [{ name: ['Chu 2'], ...extra, variants }] }
		]);
		const { state, warnings } = parsePhoneBook(source);
		return { phone: JSON.parse(serializePhoneBook(state))[0].phones[0], state, warnings };
	};

	it('writes a single variant as a string', () => {
		const { phone } = emit([{ suffix: 'Leather', file: 'Chu 2 leather', samples: 3 }]);
		expect(phone.file).toBe('Chu 2 leather');
		expect(phone.suffix).toBe('Leather');
		expect(phone.variants).toEqual([{ suffix: 'Leather', file: 'Chu 2 leather', samples: 3 }]);
	});

	it('writes several variants as aligned arrays', () => {
		const { phone } = emit([
			{ suffix: 'Stock', file: 'Chu 2' },
			{ suffix: 'Leather', file: 'Chu 2 leather', samples: 3 }
		]);
		expect(phone.file).toEqual(['Chu 2', 'Chu 2 leather']);
		expect(phone.suffix).toEqual(['Stock', 'Leather']);
	});

	it('names the first run of a set that is only a list of runs', () => {
		const { phone } = emit([{ suffix: 'Pads', samples: { files: ['Pad A', 'Pad B'] } }]);
		expect(phone.file).toBe('Pad A');
		expect(phone.variants[0].file).toBeUndefined();
	});

	it('mirrors a run-only set wherever it sits', () => {
		const runs = { suffix: 'Pads', samples: { files: ['Pad A', 'Pad B'] } };
		const plain = { suffix: 'Stock', file: 'Chu 2' };
		expect(emit([plain, runs]).phone.file).toEqual(['Chu 2', 'Pad A']);
		expect(emit([runs, plain]).phone.file).toEqual(['Pad A', 'Chu 2']);
	});

	it('reads its own export back unchanged', () => {
		const { state } = emit([
			{ suffix: 'Pads', samples: { files: ['Pad A', 'Pad B'] } },
			{ suffix: 'Stock', file: 'Chu 2' },
			{ suffix: 'More Pads', samples: { files: ['Pad A', 'Pad C'] } }
		]);
		expect(state[0].phones[0].sampleSet!.variants.map((v) => v.suffix)).toEqual([
			'Pads',
			'Stock',
			'More Pads'
		]);
		expectRoundTrip(state);
	});

	it('composes phone-level keys with variants[] instead of dropping them', () => {
		const { phone, warnings } = emit(
			[
				{ suffix: 'Repeat Runs', file: 'Chu 2', samples: 3 },
				{ suffix: 'Leather', file: 'Chu 2 L' }
			],
			{ file: ['Chu 2 foam', 'Chu 2'], suffix: ['Foam', 'Stock'] }
		);
		expect(warnings).toEqual([]);
		expect(phone.file).toEqual(['Chu 2 foam', 'Chu 2', 'Chu 2 L']);
		expect(phone.suffix).toEqual(['Foam', 'Repeat Runs', 'Leather']);
		expect(phone.variants).toHaveLength(3);
	});

	it('follows variants[] once it names every file, and exports file in that order', () => {
		const { phone, warnings } = emit(
			[
				{ suffix: 'Pads', samples: { files: ['Pad A', 'Pad B'] } },
				{ suffix: 'Stock', file: 'Chu 2' }
			],
			{ file: 'Chu 2', suffix: 'Stock' }
		);
		expect(warnings).toEqual([]);
		expect(phone.file).toEqual(['Pad A', 'Chu 2']);
		expect(phone.suffix).toEqual(['Pads', 'Stock']);
		expect(phone.variants.map((v: { suffix: string }) => v.suffix)).toEqual(['Pads', 'Stock']);
	});

	it('names prefix variants by what is left of the filename', () => {
		const { phone } = emit([{ suffix: 'Depth', samples: { files: ['Chu 2 7k', 'Chu 2 9k'] } }], {
			file: ['Chu 2 Stock', 'Chu 2 SpinFit'],
			prefix: 'Chu 2'
		});
		expect(phone.file).toEqual(['Chu 2 Stock', 'Chu 2 SpinFit', 'Chu 2 7k']);
		expect(phone.suffix).toEqual(['Stock', 'SpinFit', 'Depth']);
		expect(phone.prefix).toBeUndefined();
	});
});

describe('legacy suffixes', () => {
	// modernGraphTool gives a single `suffix` string to every file, then renames
	// repeats (`_uniqueSuffixes`). The editor must export the names the site shows.
	const importPhone = (phone: Record<string, unknown>) => {
		const { state, warnings } = parsePhoneBook(
			JSON.stringify([{ name: 'Moondrop', phones: [phone] }])
		);
		return { phone: state[0].phones[0], warnings };
	};

	it('applies a suffix string to every file and numbers the repeats', () => {
		const { phone, warnings } = importPhone({ name: ['Chu 2'], file: ['A', 'B'], suffix: 'Tip' });
		expect(phone.variations!.rows).toEqual([
			{ file: 'A', suffix: 'Tip' },
			{ file: 'B', suffix: 'Tip 2' }
		]);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('"Tip 2"');
	});

	it('does the same beside a phone-level sample count', () => {
		const { phone } = importPhone({ name: ['Chu 2'], file: ['A', 'B'], suffix: 'Tip', samples: 3 });
		expect(phone.sampleSet!.variants.map((v) => v.suffix)).toEqual(['Tip', 'Tip 2']);
	});

	it('numbers repeated empty suffixes from 2', () => {
		const { phone } = importPhone({ name: ['Chu 2'], file: ['A', 'B', 'C'] });
		expect(phone.variations!.rows.map((r) => r.suffix)).toEqual(['', '2', '3']);
	});

	it('leaves distinct suffixes in an array alone', () => {
		const { phone, warnings } = importPhone({
			name: ['Chu 2'],
			file: ['A', 'B'],
			suffix: ['Foam', 'Silicone']
		});
		expect(phone.variations!.rows.map((r) => r.suffix)).toEqual(['Foam', 'Silicone']);
		expect(warnings).toEqual([]);
	});
});

describe('the shipped defaults/data/phone_book.json', () => {
	const shipped = readFileSync(
		fileURLToPath(new URL('../../../defaults/data/phone_book.json', import.meta.url)),
		'utf8'
	);

	it('parses', () => {
		const { state } = parsePhoneBook(shipped);
		expect(state.length).toBeGreaterThan(0);
	});

	it('is re-exportable once imported', () => {
		const { state } = parsePhoneBook(shipped);
		expectRoundTrip(state);
	});

	it('imports without warnings', () => {
		expect(parsePhoneBook(shipped).warnings).toEqual([]);
	});

	it('exports every object phone with a phone-level file', () => {
		const emitted = JSON.parse(serializePhoneBook(parsePhoneBook(shipped).state)) as any[];
		const objects = emitted.flatMap((b) => b.phones ?? []).filter((p) => typeof p === 'object');
		expect(objects.filter((p) => !p.file || p.file.length === 0)).toEqual([]);
	});

	// The sample's own demonstration of both schemas on one entry. Its run-only set
	// is appended as a fourth variant, and the export names that one in `file` too.
	it('keeps the order of "Dual Hosted" on re-export', () => {
		const find = (book: any[]) =>
			book
				.flatMap((b) => b.phones ?? [])
				.find((p: any) => Array.isArray(p?.name) && p.name[0] === 'Dual Hosted');
		const before = find(JSON.parse(shipped));
		const after = find(JSON.parse(serializePhoneBook(parsePhoneBook(shipped).state)));

		expect(after.file).toEqual([...before.file, 'HpTF Demo Center']);
		expect(after.suffix).toEqual([...before.suffix, 'Pad Positions']);
		expect(after.variants).toHaveLength(4);
		expect(after.price).toBe('$100');
	});
});

describe('switchPhoneKind', () => {
	const original: PhoneState = {
		id: 'p1',
		kind: 'detailed',
		detailed: { name: 'Aria 2', file: 'Aria 2' },
		price: '$99',
		reviewScore: '4.5',
		links: [{ label: 'Review', url: 'https://example.com' }]
	};

	it('keeps the id and shared metadata', () => {
		const switched = switchPhoneKind(original, 'sampleSet');
		expect(switched.id).toBe('p1');
		expect(switched.price).toBe('$99');
		expect(switched.reviewScore).toBe('4.5');
		expect(switched.links).toEqual(original.links);
	});

	it('carries the name across every kind', () => {
		for (const kind of ['simple', 'detailed', 'variations', 'prefix', 'sampleSet'] as const) {
			expect(extractName(switchPhoneKind(original, kind))).toBe('Aria 2');
		}
	});

	it('clears the previous kind payload', () => {
		expect(switchPhoneKind(original, 'prefix').detailed).toBeUndefined();
	});
});

describe('extractName', () => {
	it('returns an empty string for a freshly created phone of each kind', () => {
		for (const kind of ['simple', 'detailed', 'variations', 'prefix', 'sampleSet'] as const) {
			expect(extractName(createEmptyPhone(kind))).toBe('');
		}
	});
});

describe('malformed input', () => {
	it('throws on invalid JSON', () => {
		expect(() => parsePhoneBook('{ not json')).toThrow();
	});

	it('throws when the root is not an array', () => {
		expect(() => parsePhoneBook('{"name":"Moondrop"}')).toThrow();
	});
});
