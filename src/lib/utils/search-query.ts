/**
 * Search queries are comma-separated groups of `//`-separated alternatives:
 * `lyro // lyrö, hd 600` means "(lyro or lyrö) and hd 600". Each group names one
 * device; its alternatives are other spellings of it. Both the local device list
 * and cross-site search parse the query here so they read it the same way; what
 * "and" means differs per surface, and lives with each of them.
 *
 * `//` rather than `/` because 67 device names in the aggregate index carry a
 * single slash (`16/Cosmos`, `HD650/HD6XX`) and none carry two.
 *
 * A word starting with `-` excludes that word from the whole group:
 * `earphones -pro -max` is the Earphones without the Pro or Max. Only a leading
 * `-` counts, so `HE-400se` and a spaced ` - ` stay literal; 9 of ~14.5k names
 * in the index have a word starting with `-` (`Nozzle -6dB Bass`), against 4
 * carrying the `!` that was the alternative, and `-` is what other searches use.
 */

export interface QueryGroup {
	/** Alternatives, any of which matches as a substring. Never empty. */
	terms: string[];
	/** Whole words that rule a name out, whichever alternative matched. */
	exclude: string[];
}

const EXCLUSION = /(^|\s)-(\S+)/g;
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Distinct, lowercased groups of alternatives, in the order they were typed. A
 * group with only exclusions is dropped: it names no device.
 */
export function splitQueryGroups(query: string): QueryGroup[] {
	const groups: QueryGroup[] = [];
	const seen = new Set<string>();
	for (const part of query.toLowerCase().split(',')) {
		const exclude = new Set<string>();
		const rest = part
			.replace(EXCLUSION, (_, space: string, word: string) => {
				exclude.add(word);
				return space;
			})
			// A lone trailing `-` is the start of an exclusion being typed.
			.replace(/(^|\s)-$/, '');
		const terms = [
			...new Set(
				rest
					.split(/\/{2,}/)
					// A lone trailing `/` is usually the first half of a `//` being typed;
					// dropping it keeps the results from blanking for that one keystroke.
					// Whitespace collapses so a removed exclusion leaves no double space.
					.map((alt) =>
						alt
							.replace(/\s+/g, ' ')
							.trim()
							.replace(/\s*\/$/, '')
					)
					.filter((alt) => alt !== '')
			)
		];
		if (terms.length === 0) continue;
		const group = { terms, exclude: [...exclude] };
		const key = [[...group.terms].sort().join('\n'), [...group.exclude].sort().join('\n')].join(
			'\0'
		);
		if (seen.has(key)) continue;
		seen.add(key);
		groups.push(group);
	}
	return groups;
}

/**
 * True when `word` occurs in `text` with no letter or digit on either side.
 * Whole words, so `-pro` drops `Pro` without dropping `Prodigy`; Unicode-aware,
 * where `\b` would treat every non-ASCII letter as a boundary.
 */
function containsWord(text: string, word: string): boolean {
	for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1)) {
		const before = text[i - 1];
		const after = text[i + word.length];
		if ((!before || !WORD_CHAR.test(before)) && (!after || !WORD_CHAR.test(after))) return true;
	}
	return false;
}

/** Whether a lowercased name meets `group`. */
export function matchesQueryGroup(textLower: string, group: QueryGroup): boolean {
	return (
		group.terms.some((term) => textLower.includes(term)) &&
		!group.exclude.some((word) => containsWord(textLower, word))
	);
}
