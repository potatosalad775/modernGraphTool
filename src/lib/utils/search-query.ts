/**
 * Search queries are comma-separated: `A,B` means "A and B". Both the local
 * device list and cross-site search split the query here so they read it the
 * same way; what "and" means differs per surface, and lives with each of them.
 */

/** Distinct, lowercased, non-empty terms, in the order they were typed. */
export function splitQueryTerms(query: string): string[] {
	const terms = query
		.split(',')
		.map((term) => term.trim().toLowerCase())
		.filter((term) => term !== '');
	return [...new Set(terms)];
}
