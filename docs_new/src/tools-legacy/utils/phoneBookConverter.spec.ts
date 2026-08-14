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
	return JSON.parse(
		JSON.stringify(value, (key, v) => (key === 'id' ? undefined : v))
	) as T;
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
								description: 'Five units, leather pads'
							}
						]
					}
				}
			])
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

describe('CrinGraph compatibility warnings', () => {
	// AGENTS.md: a modernGraphTool-only key must compose with the CrinGraph
	// dialect rather than override it. The editor cannot represent a phone that
	// carries both `variants[]` and a phone-level `file`, so it must say so
	// loudly rather than drop the compatibility silently.
	it('warns when variants[] shadows phone-level keys', () => {
		const source = JSON.stringify([
			{
				name: 'Moondrop',
				phones: [
					{
						name: ['Chu 2'],
						file: 'Chu 2',
						suffix: 'Stock',
						variants: [{ suffix: 'Leather', file: 'Chu 2 leather', samples: 3 }]
					}
				]
			}
		]);
		const { warnings } = parsePhoneBook(source);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('"file"');
		expect(warnings[0]).toContain('"suffix"');
		expect(warnings[0]).toContain('CrinGraph');
	});

	it('stays silent when variants[] carries no shadowed keys', () => {
		const source = JSON.stringify([
			{
				name: 'Moondrop',
				phones: [
					{ name: ['Chu 2'], variants: [{ suffix: 'Leather', file: 'Chu 2 leather', samples: 3 }] }
				]
			}
		]);
		expect(parsePhoneBook(source).warnings).toEqual([]);
	});
});

describe('the shipped defaults/data/phone_book.json', () => {
	const shipped = readFileSync(
		fileURLToPath(new URL('../../../../defaults/data/phone_book.json', import.meta.url)),
		'utf8'
	);

	it('parses', () => {
		const { state } = parsePhoneBook(shipped);
		expect(state.length).toBeGreaterThan(0);
	});

	it('is re-exportable once imported', () => {
		// Idempotent from the second pass on — the only loss happens on first import,
		// pinned by the "Dual Hosted" test below.
		const { state } = parsePhoneBook(shipped);
		expectRoundTrip(state);
	});

	/**
	 * KNOWN GAP, pinned deliberately.
	 *
	 * The shipped sample's "Dual Hosted" entry is the project's own demonstration of
	 * the rule in AGENTS.md — a modernGraphTool-only key must compose with the
	 * CrinGraph dialect rather than override it. It carries phone-level `file` (which
	 * is all CrinGraph reads) *and* `variants[]` (which modernGraphTool composes on
	 * top). The editor has no phone kind holding both, so importing it drops `file`
	 * and `suffix`, and re-exporting publishes an entry CrinGraph cannot read at all.
	 *
	 * The parser warns rather than failing silently, which is the right call. These
	 * assertions exist so that a rewrite cannot quietly widen the loss — and so that
	 * implementing a combined phone kind trips this test and forces it updated.
	 */
	describe('"Dual Hosted" — the entry the editor cannot represent', () => {
		it('warns exactly once, naming the shadowed keys and the consequence', () => {
			const { warnings } = parsePhoneBook(shipped);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain('Dual Hosted');
			expect(warnings[0]).toContain('"file"');
			expect(warnings[0]).toContain('"suffix"');
			expect(warnings[0]).toContain('CrinGraph');
		});

		it('drops phone-level file/suffix on re-export, losing CrinGraph readability', () => {
			const { state } = parsePhoneBook(shipped);
			const emitted = JSON.parse(serializePhoneBook(state)) as any[];
			const entry = emitted
				.flatMap((b) => b.phones ?? [])
				.find((p: any) => Array.isArray(p?.name) && p.name[0] === 'Dual Hosted');

			expect(entry).toBeDefined();
			expect(entry.variants).toHaveLength(2);
			// The loss: CrinGraph reads `file` and nothing else.
			expect(entry.file).toBeUndefined();
			expect(entry.suffix).toBeUndefined();
			// Everything the editor *can* model still survives.
			expect(entry.price).toBe('$100');
			expect(entry.description).toContain('CrinGraph');
		});
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
