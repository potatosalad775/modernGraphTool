import { describe, it, expect } from 'vitest';
import { splitQueryGroups } from './search-query.js';

describe('splitQueryGroups', () => {
	it('returns a single lowercased term for a plain query', () => {
		expect(splitQueryGroups('  HD 600 ')).toEqual([['hd 600']]);
	});

	it('splits on commas and trims each term', () => {
		expect(splitQueryGroups('HD 600, U12t ,Andromeda')).toEqual([
			['hd 600'],
			['u12t'],
			['andromeda']
		]);
	});

	// Typing a comma shouldn't blank the results before the next term is started.
	it('drops empty terms from trailing or repeated commas', () => {
		expect(splitQueryGroups('hd 600,')).toEqual([['hd 600']]);
		expect(splitQueryGroups(',,hd 600, ,u12t')).toEqual([['hd 600'], ['u12t']]);
	});

	it('deduplicates terms that differ only in case or padding', () => {
		expect(splitQueryGroups('HD 600, hd 600 ')).toEqual([['hd 600']]);
	});

	it('returns nothing for an empty or whitespace-only query', () => {
		expect(splitQueryGroups('')).toEqual([]);
		expect(splitQueryGroups('   ,  ')).toEqual([]);
	});

	describe('alternatives', () => {
		it('splits a group on `//`, with or without spaces', () => {
			expect(splitQueryGroups('Lyro // Lyrö')).toEqual([['lyro', 'lyrö']]);
			expect(splitQueryGroups('lyro//lyrö')).toEqual([['lyro', 'lyrö']]);
		});

		it('binds tighter than the comma', () => {
			expect(splitQueryGroups('lyro // lyrö, hd 600')).toEqual([['lyro', 'lyrö'], ['hd 600']]);
		});

		// Dozens of real device names carry one slash; none carry two.
		it('leaves a single slash as part of the term', () => {
			expect(splitQueryGroups('16/Cosmos')).toEqual([['16/cosmos']]);
		});

		it('treats a run of three or more slashes as one separator', () => {
			expect(splitQueryGroups('lyro///lyrö')).toEqual([['lyro', 'lyrö']]);
		});

		it('drops an empty alternative from a trailing `//`', () => {
			expect(splitQueryGroups('lyro //')).toEqual([['lyro']]);
		});

		// Mid-way through typing `//`, the query ends in one slash.
		it('drops a lone trailing slash', () => {
			expect(splitQueryGroups('lyro /')).toEqual([['lyro']]);
			expect(splitQueryGroups('lyro // lyrö/')).toEqual([['lyro', 'lyrö']]);
		});

		it('deduplicates alternatives, and groups listing the same alternatives', () => {
			expect(splitQueryGroups('lyro // LYRO')).toEqual([['lyro']]);
			expect(splitQueryGroups('lyro // lyrö, lyrö // lyro')).toEqual([['lyro', 'lyrö']]);
		});
	});
});
