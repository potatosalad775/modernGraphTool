import { describe, it, expect } from 'vitest';
import {
	smartSplit,
	parseShareParam,
	parseStateParam,
	encodeShareNames,
	hasNonDefaultState,
	normalizeSampleDisplay,
	buildQueryString,
	BASE62_PREFIX,
	type URLState
} from './url-state.js';
import Base62 from './base62.js';

const DEFAULT_Y_SCALE = 50;

/**
 * Round-trip a name list the way a browser actually does it: build the query,
 * hand it to URLSearchParams (which is what `url-provider` reads back through),
 * and decode.
 */
function roundTrip(names: string[], useBase62 = false): string[] {
	const query = buildQueryString(names, {}, DEFAULT_Y_SCALE, useBase62);
	return parseShareParam(new URLSearchParams(query).get('share'));
}

describe('smartSplit', () => {
	it('splits simple comma-separated names', () => {
		expect(smartSplit('Phone A,Phone B')).toEqual(['Phone A', 'Phone B']);
	});

	it('keeps commas inside parentheses, brackets and braces', () => {
		expect(smartSplit('Phone A (V2, black),Phone B')).toEqual(['Phone A (V2, black)', 'Phone B']);
		expect(smartSplit('Phone A [x, y],Phone B')).toEqual(['Phone A [x, y]', 'Phone B']);
		expect(smartSplit('Phone A {x, y},Phone B')).toEqual(['Phone A {x, y}', 'Phone B']);
	});

	it('handles nested parentheses', () => {
		expect(smartSplit('Phone (A (B, C)),Phone D')).toEqual(['Phone (A (B, C))', 'Phone D']);
	});

	it('trims whitespace and skips empty segments', () => {
		expect(smartSplit(' Phone A ,, Phone B ')).toEqual(['Phone A', 'Phone B']);
	});

	it('returns an empty list for an empty string', () => {
		expect(smartSplit('')).toEqual([]);
	});
});

describe('parseShareParam', () => {
	it('returns an empty list for null and empty input', () => {
		expect(parseShareParam(null)).toEqual([]);
		expect(parseShareParam('')).toEqual([]);
	});

	it('converts underscores to spaces on the legacy path', () => {
		// This is the CrinGraph-style slug other sites link in with.
		expect(parseShareParam('Brand_PhoneA,Brand_PhoneB')).toEqual(['Brand PhoneA', 'Brand PhoneB']);
	});

	it('decodes the Base62 path', () => {
		const encoded = BASE62_PREFIX + Base62.encode('Phone A,Phone B');
		expect(parseShareParam(encoded)).toEqual(['Phone A', 'Phone B']);
	});

	it('returns an empty list rather than throwing on a corrupt Base62 payload', () => {
		expect(parseShareParam(BASE62_PREFIX + '!!!not-base62!!!')).toEqual([]);
	});
});

describe('parseStateParam', () => {
	it('returns null for null, empty and malformed input', () => {
		expect(parseStateParam(null)).toBeNull();
		expect(parseStateParam('')).toBeNull();
		expect(parseStateParam('not-a-valid-payload!!')).toBeNull();
	});

	it('returns null when the payload decodes to a non-object', () => {
		expect(parseStateParam(Base62.encode('42'))).toBeNull();
		expect(parseStateParam(Base62.encode('[1,2,3]'))).toBeNull();
		expect(parseStateParam(Base62.encode('null'))).toBeNull();
	});

	it('round-trips a full state object', () => {
		const state: URLState = {
			yScale: 80,
			baseline: { key: 'Phone A', mode: 'withAdjustment' },
			yOffsets: { 'Phone A': 5, 'Phone B': -3 },
			sampleDisplay: {
				'Phone A': { keys: ['sample0_AVG', 'sample1_AVG'], fill: false, avg: true },
				'Phone B': { keys: ['sample1_L', 'sample1_AVG'], fill: true, avg: false }
			},
			eq: {
				filters: [
					{ enabled: true, type: 'PK', freq: 1000, q: 1.4, gain: -3 },
					{ enabled: true, type: 'LSQ', freq: 100, q: 0.7, gain: 5 }
				],
				preamp: -2
			}
		} as URLState;

		expect(parseStateParam(Base62.encode(JSON.stringify(state)))).toEqual(state);
	});
});

describe('encodeShareNames', () => {
	it('percent-encodes characters that would otherwise break the query string', () => {
		// `encodeURI` leaves all three of these alone, which is why it could not be
		// used here: `&` ends the parameter, `#` starts the fragment, and `+`
		// decodes back as a space.
		const encoded = encodeShareNames(['A & B'], false);
		expect(encoded).not.toContain('&');
		expect(encodeShareNames(['A + B'], false)).not.toContain('+');
		expect(encodeShareNames(['A # B'], false)).not.toContain('#');
	});

	it('prefixes the Base62 form', () => {
		expect(encodeShareNames(['Phone A'], true).startsWith(BASE62_PREFIX)).toBe(true);
	});
});

describe('share round-trip through URLSearchParams', () => {
	// Names drawn from the shapes that actually appear in measurement databases.
	const NAMES: Array<[string, string[]]> = [
		['plain', ['Sennheiser HD600']],
		['ampersand', ['Brand A & B Model']],
		['plus', ['Model X+']],
		['hash', ['Model #2']],
		['percent', ['100% Silver Cable']],
		['question mark', ['Model? v2']],
		['equals', ['Model = A']],
		['parenthesised variant', ['Phone A (V2, black)']],
		['bracketed variant', ['Phone A [Special]']],
		['korean', ['젠하이저 HD600']],
		['japanese', ['final A8000']],
		['multiple mixed', ['Brand A & B', 'Model X+', '젠하이저 HD600']]
	];

	for (const [label, names] of NAMES) {
		it(`round-trips ${label} on the plain path`, () => {
			expect(roundTrip(names, false)).toEqual(names);
		});

		it(`round-trips ${label} on the Base62 path`, () => {
			expect(roundTrip(names, true)).toEqual(names);
		});
	}

	it('produces no share param for an empty name list', () => {
		expect(buildQueryString([], {}, DEFAULT_Y_SCALE, false)).toBe('');
	});
});

// ── Legacy share-link compatibility ──────────────────────────────────────────
//
// Nothing fails loudly when one of these read paths is dropped — the page just
// loads with the wrong curves showing — so each historical shape gets its own
// case here.

describe('normalizeSampleDisplay', () => {
	it('returns an empty record when nothing is set', () => {
		expect(normalizeSampleDisplay({})).toEqual({});
	});

	it('passes the current object form through, filling in defaults', () => {
		const out = normalizeSampleDisplay({
			sampleDisplay: { 'Phone A': { keys: ['sample0_L'], fill: true, avg: false } }
		});
		expect(out['Phone A']).toEqual({ keys: ['sample0_L'], fill: true, avg: false });
	});

	it('defaults a missing avg to true and a missing fill to false', () => {
		const out = normalizeSampleDisplay({
			sampleDisplay: { 'Phone A': { keys: ['sample0_AVG'] } as never }
		});
		expect(out['Phone A']).toEqual({ keys: ['sample0_AVG'], fill: false, avg: true });
	});

	it('maps the legacy flat L{n}/R{n} array onto zero-based sample keys', () => {
		// Links minted before the two sample concepts were unified. `L1` was the
		// FIRST run, so it becomes `sample0_L`.
		const out = normalizeSampleDisplay({
			sampleDisplay: { 'Phone A': ['L1', 'R1', 'L3'] }
		});
		expect(out['Phone A']).toEqual({
			keys: ['sample0_L', 'sample0_R', 'sample2_L'],
			fill: false,
			avg: true
		});
	});

	it('accepts an array that already holds current-shape keys', () => {
		const out = normalizeSampleDisplay({ sampleDisplay: { 'Phone A': ['sample1_AVG'] } });
		expect(out['Phone A'].keys).toEqual(['sample1_AVG']);
	});

	it('drops array entries it cannot parse rather than passing junk downstream', () => {
		const out = normalizeSampleDisplay({
			sampleDisplay: { 'Phone A': ['L1', 'garbage', ''] as never }
		});
		expect(out['Phone A'].keys).toEqual(['sample0_L']);
	});

	it('folds legacy hptfDisplay in — its keys already use the current shape', () => {
		const out = normalizeSampleDisplay({
			hptfDisplay: { 'Phone B': { keys: ['sample0_AVG', 'sample1_L'], fill: true } }
		});
		expect(out['Phone B']).toEqual({
			keys: ['sample0_AVG', 'sample1_L'],
			fill: true,
			avg: true
		});
	});

	it('reads both legacy sources in one state object', () => {
		const out = normalizeSampleDisplay({
			sampleDisplay: { 'Phone A': ['L1'] },
			hptfDisplay: { 'Phone B': { keys: ['sample0_AVG'], fill: true } }
		});
		expect(Object.keys(out).sort()).toEqual(['Phone A', 'Phone B']);
	});
});

describe('hasNonDefaultState', () => {
	it('is false when only yScale is present and it matches the default', () => {
		expect(hasNonDefaultState({ yScale: DEFAULT_Y_SCALE }, DEFAULT_Y_SCALE)).toBe(false);
	});

	it('is true when yScale differs from the default', () => {
		expect(hasNonDefaultState({ yScale: 80 }, DEFAULT_Y_SCALE)).toBe(true);
	});

	it('is false for empty collections', () => {
		const state: URLState = {
			yScale: DEFAULT_Y_SCALE,
			yOffsets: {},
			sampleDisplay: {}
		};
		expect(hasNonDefaultState(state, DEFAULT_Y_SCALE)).toBe(false);
	});

	it('is false for an EQ snapshot with no filters', () => {
		const state: URLState = { yScale: DEFAULT_Y_SCALE, eq: { filters: [], preamp: -3 } };
		expect(hasNonDefaultState(state, DEFAULT_Y_SCALE)).toBe(false);
	});

	it.each([
		['baseline', { baseline: { key: 'Phone A', mode: 'withoutAdjustment' } }],
		['yOffsets', { yOffsets: { 'Phone A': 5 } }],
		['sampleDisplay', { sampleDisplay: { 'Phone A': { keys: [], fill: false, avg: false } } }],
		[
			'eq',
			{ eq: { filters: [{ enabled: true, type: 'PK', freq: 1000, q: 1, gain: 3 }], preamp: 0 } }
		]
	])('is true when %s is set', (_label, partial) => {
		const state = { yScale: DEFAULT_Y_SCALE, ...partial } as URLState;
		expect(hasNonDefaultState(state, DEFAULT_Y_SCALE)).toBe(true);
	});
});

describe('buildQueryString', () => {
	const NAMES = ['Phone A'];
	const EXTRA: URLState = { yScale: 80 };

	it('omits state entirely when everything is at default', () => {
		expect(buildQueryString(NAMES, { yScale: DEFAULT_Y_SCALE }, DEFAULT_Y_SCALE, false)).toBe(
			`?share=${encodeShareNames(NAMES, false)}`
		);
	});

	it('joins share and state with & when both are present', () => {
		const query = buildQueryString(NAMES, EXTRA, DEFAULT_Y_SCALE, false);
		expect(query.startsWith('?share=')).toBe(true);
		expect(query).toContain('&state=');
	});

	it('leads with ?state= when there are no names', () => {
		const query = buildQueryString([], EXTRA, DEFAULT_Y_SCALE, false);
		expect(query.startsWith('?state=')).toBe(true);
		expect(query).not.toContain('share=');
	});

	it('round-trips state through URLSearchParams', () => {
		const query = buildQueryString(NAMES, EXTRA, DEFAULT_Y_SCALE, false);
		expect(parseStateParam(new URLSearchParams(query).get('state'))).toEqual(EXTRA);
	});
});
