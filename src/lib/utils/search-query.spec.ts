import { describe, it, expect } from 'vitest';
import { matchesQueryGroup, splitQueryGroups } from './search-query.js';

const g = (terms: string[], exclude: string[] = []) => ({ terms, exclude });

describe('splitQueryGroups', () => {
	it('returns a single lowercased term for a plain query', () => {
		expect(splitQueryGroups('  HD 600 ')).toEqual([g(['hd 600'])]);
	});

	it('splits on commas and trims each term', () => {
		expect(splitQueryGroups('HD 600, U12t ,Andromeda')).toEqual([
			g(['hd 600']),
			g(['u12t']),
			g(['andromeda'])
		]);
	});

	// Typing a comma shouldn't blank the results before the next term is started.
	it('drops empty terms from trailing or repeated commas', () => {
		expect(splitQueryGroups('hd 600,')).toEqual([g(['hd 600'])]);
		expect(splitQueryGroups(',,hd 600, ,u12t')).toEqual([g(['hd 600']), g(['u12t'])]);
	});

	it('deduplicates terms that differ only in case or padding', () => {
		expect(splitQueryGroups('HD 600, hd 600 ')).toEqual([g(['hd 600'])]);
	});

	it('returns nothing for an empty or whitespace-only query', () => {
		expect(splitQueryGroups('')).toEqual([]);
		expect(splitQueryGroups('   ,  ')).toEqual([]);
	});

	describe('alternatives', () => {
		it('splits a group on `//`, with or without spaces', () => {
			expect(splitQueryGroups('Lyro // Lyrö')).toEqual([g(['lyro', 'lyrö'])]);
			expect(splitQueryGroups('lyro//lyrö')).toEqual([g(['lyro', 'lyrö'])]);
		});

		it('binds tighter than the comma', () => {
			expect(splitQueryGroups('lyro // lyrö, hd 600')).toEqual([
				g(['lyro', 'lyrö']),
				g(['hd 600'])
			]);
		});

		// Dozens of real device names carry one slash; none carry two.
		it('leaves a single slash as part of the term', () => {
			expect(splitQueryGroups('16/Cosmos')).toEqual([g(['16/cosmos'])]);
		});

		it('treats a run of three or more slashes as one separator', () => {
			expect(splitQueryGroups('lyro///lyrö')).toEqual([g(['lyro', 'lyrö'])]);
		});

		it('drops an empty alternative from a trailing `//`', () => {
			expect(splitQueryGroups('lyro //')).toEqual([g(['lyro'])]);
		});

		// Mid-way through typing `//`, the query ends in one slash.
		it('drops a lone trailing slash', () => {
			expect(splitQueryGroups('lyro /')).toEqual([g(['lyro'])]);
			expect(splitQueryGroups('lyro // lyrö/')).toEqual([g(['lyro', 'lyrö'])]);
		});

		it('deduplicates alternatives, and groups listing the same alternatives', () => {
			expect(splitQueryGroups('lyro // LYRO')).toEqual([g(['lyro'])]);
			expect(splitQueryGroups('lyro // lyrö, lyrö // lyro')).toEqual([g(['lyro', 'lyrö'])]);
		});
	});

	describe('exclusions', () => {
		it('takes a word starting with `-` out of the term', () => {
			expect(splitQueryGroups('Earphones -Pro -Plus -Max')).toEqual([
				g(['earphones'], ['pro', 'plus', 'max'])
			]);
		});

		it('leaves the rest of the term as one phrase', () => {
			expect(splitQueryGroups('blessing -dusk 2')).toEqual([g(['blessing 2'], ['dusk'])]);
		});

		// `HE-400se`, `IE-900`: a hyphen inside a word is part of the name.
		it('leaves a hyphen inside a word literal', () => {
			expect(splitQueryGroups('HE-400se')).toEqual([g(['he-400se'])]);
		});

		it('leaves a spaced or trailing lone `-` out of the term', () => {
			expect(splitQueryGroups('blessing 2 - dusk')).toEqual([g(['blessing 2 - dusk'])]);
			expect(splitQueryGroups('earphones -')).toEqual([g(['earphones'])]);
		});

		it('applies to every alternative of its group, and only that group', () => {
			expect(splitQueryGroups('lyro // lyrö -mk2, hd 600')).toEqual([
				g(['lyro', 'lyrö'], ['mk2']),
				g(['hd 600'])
			]);
		});

		it('drops a group that names only exclusions', () => {
			expect(splitQueryGroups('-pro')).toEqual([]);
			expect(splitQueryGroups('hd 600, -pro')).toEqual([g(['hd 600'])]);
		});

		it('keeps groups apart that differ only in their exclusions', () => {
			expect(splitQueryGroups('earphones, earphones -pro')).toEqual([
				g(['earphones']),
				g(['earphones'], ['pro'])
			]);
			expect(splitQueryGroups('earphones -pro, earphones -PRO')).toEqual([
				g(['earphones'], ['pro'])
			]);
		});
	});
});

describe('matchesQueryGroup', () => {
	const query = (q: string) => splitQueryGroups(q)[0];

	it('drops a name carrying an excluded word', () => {
		const group = query('earphones -pro -plus -max');
		expect(matchesQueryGroup('acme earphones', group)).toBe(true);
		expect(matchesQueryGroup('acme earphones pro', group)).toBe(false);
		expect(matchesQueryGroup('acme earphones pro plus max', group)).toBe(false);
	});

	it('excludes whole words only', () => {
		const group = query('earphones -pro');
		expect(matchesQueryGroup('acme earphones prodigy', group)).toBe(true);
		expect(matchesQueryGroup('acme earphones (pro)', group)).toBe(false);
		expect(matchesQueryGroup('acme earphones pro-2', group)).toBe(false);
	});

	// `` would read every non-ASCII letter as a boundary.
	it('treats non-ASCII letters as part of a word', () => {
		expect(matchesQueryGroup('acme lyrö', query('acme -lyr'))).toBe(true);
		expect(matchesQueryGroup('acme lyrö', query('acme -lyrö'))).toBe(false);
	});

	it('finds the word past an earlier partial match', () => {
		expect(matchesQueryGroup('acme pros pro', query('acme -pro'))).toBe(false);
	});
});
