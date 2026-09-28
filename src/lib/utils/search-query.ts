/**
 * Search queries are comma-separated groups of `//`-separated alternatives:
 * `lyro // lyrö, hd 600` means "(lyro or lyrö) and hd 600". Each group names one
 * device; its alternatives are other spellings of it. Both the local device list
 * and cross-site search parse the query here so they read it the same way; what
 * "and" means differs per surface, and lives with each of them.
 *
 * `//` rather than `/` because 67 device names in the aggregate index carry a
 * single slash (`16/Cosmos`, `HD650/HD6XX`) and none carry two.
 */

/**
 * Distinct, lowercased, non-empty groups of alternatives, in the order they were
 * typed.
 */
export function splitQueryGroups(query: string): string[][] {
	const groups: string[][] = [];
	const seen = new Set<string>();
	for (const part of query.split(',')) {
		const alternatives = [
			...new Set(
				part
					.split(/\/{2,}/)
					// A lone trailing `/` is usually the first half of a `//` being typed;
					// dropping it keeps the results from blanking for that one keystroke.
					.map((alt) =>
						alt
							.trim()
							.replace(/\s*\/$/, '')
							.toLowerCase()
					)
					.filter((alt) => alt !== '')
			)
		];
		if (alternatives.length === 0) continue;
		const key = [...alternatives].sort().join('\n');
		if (seen.has(key)) continue;
		seen.add(key);
		groups.push(alternatives);
	}
	return groups;
}
