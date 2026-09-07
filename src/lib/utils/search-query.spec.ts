import { describe, it, expect } from 'vitest';
import { splitQueryTerms } from './search-query.js';

describe('splitQueryTerms', () => {
	it('returns a single lowercased term for a plain query', () => {
		expect(splitQueryTerms('  HD 600 ')).toEqual(['hd 600']);
	});

	it('splits on commas and trims each term', () => {
		expect(splitQueryTerms('HD 600, U12t ,Andromeda')).toEqual(['hd 600', 'u12t', 'andromeda']);
	});

	// Typing a comma shouldn't blank the results before the next term is started.
	it('drops empty terms from trailing or repeated commas', () => {
		expect(splitQueryTerms('hd 600,')).toEqual(['hd 600']);
		expect(splitQueryTerms(',,hd 600, ,u12t')).toEqual(['hd 600', 'u12t']);
	});

	it('deduplicates terms that differ only in case or padding', () => {
		expect(splitQueryTerms('HD 600, hd 600 ')).toEqual(['hd 600']);
	});

	it('returns nothing for an empty or whitespace-only query', () => {
		expect(splitQueryTerms('')).toEqual([]);
		expect(splitQueryTerms('   ,  ')).toEqual([]);
	});
});
