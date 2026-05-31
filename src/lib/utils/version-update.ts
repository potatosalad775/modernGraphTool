const LS_KEY = 'gt-settings-app-version';

/**
 * Compare two semver-like version strings. Returns:
 *   <0  if a < b
 *    0  if a == b
 *   >0  if a > b
 * Pre-release suffixes (e.g. `-beta.1`) are stripped before comparison.
 */
export function compareVersions(a: string, b: string): number {
	const parse = (v: string) =>
		v
			.replace(/^v/i, '')
			.split('-')[0]
			.split('.')
			.map((n) => Number.parseInt(n, 10) || 0);
	const pa = parse(a);
	const pb = parse(b);
	const len = Math.max(pa.length, pb.length);
	for (let i = 0; i < len; i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

export type VersionUpdate = {
	previous: string;
	current: string;
};

/**
 * Reads the previously-seen app version from localStorage and compares it
 * to {@link current}. Returns a {@link VersionUpdate} only when the user has
 * upgraded (stored < current). First-time visits and same-or-downgraded
 * versions return `null`. Always persists `current` so the next check is
 * relative to today's version.
 */
export function checkVersionUpdate(current: string): VersionUpdate | null {
	if (typeof window === 'undefined') return null;
	let previous: string | null = null;
	try {
		previous = localStorage.getItem(LS_KEY);
		localStorage.setItem(LS_KEY, current);
	} catch {
		return null;
	}
	if (!previous) return null;
	if (compareVersions(previous, current) >= 0) return null;
	return { previous, current };
}
