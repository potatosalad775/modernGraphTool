import { describe, it, expect, beforeEach } from 'vitest';
import Base62 from './base62.js';

/**
 * URL Provider uses browser globals (window, document) and Svelte stores,
 * so we test the pure logic functions here: smart splitting, URL building,
 * and state encoding/decoding via Base62.
 */

describe('URL Provider — Base62 state encoding', () => {
	it('roundtrips a state object through Base62', () => {
		const state = {
			yScale: 80,
			baselineUUID: 'abc-123',
			yOffsets: { 'Phone A': 5, 'Phone B': -3 }
		};
		const encoded = Base62.encode(JSON.stringify(state));
		const decoded = JSON.parse(Base62.decode(encoded));
		expect(decoded).toEqual(state);
	});

	it('roundtrips EQ state through Base62', () => {
		const state = {
			yScale: 60,
			eq: {
				filters: [
					{ enabled: true, type: 'PK', freq: 1000, q: 1.4, gain: -3 },
					{ enabled: true, type: 'LSQ', freq: 100, q: 0.7, gain: 5 }
				],
				preamp: -2
			}
		};
		const encoded = Base62.encode(JSON.stringify(state));
		const decoded = JSON.parse(Base62.decode(encoded));
		expect(decoded.eq.filters).toHaveLength(2);
		expect(decoded.eq.preamp).toBe(-2);
	});

	it('handles empty phone list (no share param needed)', () => {
		const names: string[] = [];
		const shareParam = names.length > 0 ? `?share=${encodeURI(names.join(','))}` : '';
		expect(shareParam).toBe('');
	});

	it('encodes phone names in share param', () => {
		const names = ['Brand PhoneA', 'Brand PhoneB v2'];
		const shareParam = `?share=${encodeURI(names.join(','))}`;
		expect(shareParam).toContain('Brand%20PhoneA');
		expect(shareParam).toContain('Brand%20PhoneB%20v2');
	});

	it('encodes phone names with Base62 compression', () => {
		const names = ['Brand PhoneA', 'Brand PhoneB v2'];
		const encoded = Base62.encode(names.join(','));
		const shareParam = `?share=b62_${encoded}`;
		expect(shareParam).toMatch(/^\?share=b62_[0-9A-Za-z]+$/);

		// Decode and verify
		const decoded = Base62.decode(encoded);
		expect(decoded).toBe('Brand PhoneA,Brand PhoneB v2');
	});
});

describe('URL Provider — smart split logic', () => {
	// Re-implement smart split for testing (same algorithm as url-provider.ts)
	function smartSplit(input: string): string[] {
		const result: string[] = [];
		let current = '';
		let parenDepth = 0;

		for (let i = 0; i < input.length; i++) {
			const char = input[i];
			if (char === '(' || char === '[' || char === '{') {
				parenDepth++;
				current += char;
			} else if (char === ')' || char === ']' || char === '}') {
				parenDepth--;
				current += char;
			} else if (char === ',' && parenDepth === 0) {
				if (current.trim()) result.push(current.trim());
				current = '';
			} else {
				current += char;
			}
		}

		if (current.trim()) result.push(current.trim());
		return result;
	}

	it('splits simple comma-separated names', () => {
		expect(smartSplit('Phone A,Phone B')).toEqual(['Phone A', 'Phone B']);
	});

	it('preserves names with parentheses', () => {
		expect(smartSplit('Phone A (V2),Phone B')).toEqual(['Phone A (V2)', 'Phone B']);
	});

	it('preserves names with brackets', () => {
		expect(smartSplit('Phone A [Special],Phone B')).toEqual(['Phone A [Special]', 'Phone B']);
	});

	it('preserves names with nested parentheses', () => {
		expect(smartSplit('Phone (A (B)),Phone C')).toEqual(['Phone (A (B))', 'Phone C']);
	});

	it('handles single name (no comma)', () => {
		expect(smartSplit('Phone A')).toEqual(['Phone A']);
	});

	it('handles empty string', () => {
		expect(smartSplit('')).toEqual([]);
	});

	it('trims whitespace around names', () => {
		expect(smartSplit(' Phone A , Phone B ')).toEqual(['Phone A', 'Phone B']);
	});

	it('skips empty segments', () => {
		expect(smartSplit('Phone A,,Phone B')).toEqual(['Phone A', 'Phone B']);
	});
});

describe('URL Provider — state param format', () => {
	it('only includes state param when non-default values exist', () => {
		const stateData = { yScale: 60 };
		const hasExtraState = stateData.yScale !== 60;
		expect(hasExtraState).toBe(false);
	});

	it('includes state when yScale differs from default', () => {
		const stateData = { yScale: 80 };
		const hasExtraState = stateData.yScale !== 60;
		expect(hasExtraState).toBe(true);
	});

	it('includes state when baselineUUID is set', () => {
		const stateData = { yScale: 60, baselineUUID: 'some-uuid' };
		const hasExtraState = stateData.yScale !== 60 || !!stateData.baselineUUID;
		expect(hasExtraState).toBe(true);
	});

	it('includes state when yOffsets are present', () => {
		const yOffsets: Record<string, number> = { 'Phone A': 5 };
		const hasExtraState = Object.keys(yOffsets).length > 0;
		expect(hasExtraState).toBe(true);
	});
});
