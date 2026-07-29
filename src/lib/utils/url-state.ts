/**
 * Pure share-URL encoding/decoding.
 *
 * Split out of `url-provider.ts` so it can be tested without a DOM, a router or
 * the stores. `URLProvider` keeps everything that touches `window`, `document`,
 * `replaceState` and the FR/graph/EQ stores; everything below is a function of
 * its arguments only.
 */
import Base62 from './base62.js';
import type { BaselineMode } from '$lib/stores/graph-store.svelte.js';
import type { EQFilter } from '$lib/stores/eq-store.svelte.js';
import type { SampleChannelKey, HpTFDisplayKey } from '$lib/types/data-types.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EQStateSnapshot {
	filters: EQFilter[];
	preamp: number;
}

export interface URLState {
	yScale?: number;
	baseline?: { key: string; mode: BaselineMode };
	yOffsets?: Record<string, number>;
	eq?: EQStateSnapshot;
	sampleDisplay?: Record<string, SampleChannelKey[]>;
	hptfDisplay?: Record<string, { keys: HpTFDisplayKey[]; fill: boolean }>;
}

/** Prefix marking a Base62-compressed `share=` value. */
export const BASE62_PREFIX = 'b62_';

// ── Decoding ─────────────────────────────────────────────────────────────────

/**
 * Split a comma-separated string while respecting parentheses/brackets, so
 * "Phone A (V2, black), Phone B" stays two names rather than three.
 */
export function smartSplit(input: string): string[] {
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

/**
 * Turn a `share=` value into a list of device names.
 *
 * `value` is the already-percent-decoded output of `URLSearchParams.get('share')`.
 * The legacy (non-Base62) form additionally uses `_` for spaces, which is what
 * CrinGraph-style links from other sites emit — see `deriveShareSlug` in
 * `services/aggregate-index-core.ts`.
 */
export function parseShareParam(value: string | null): string[] {
	if (!value) return [];

	if (value.startsWith(BASE62_PREFIX)) {
		try {
			return smartSplit(Base62.decode(value.slice(BASE62_PREFIX.length)));
		} catch {
			return [];
		}
	}

	return smartSplit(value.replace(/_/g, ' '));
}

/** Decode a `state=` value. Returns null for anything malformed. */
export function parseStateParam(value: string | null): URLState | null {
	if (!value) return null;
	try {
		const parsed = JSON.parse(Base62.decode(value));
		// Base62.decode of junk can yield a bare number or string, which JSON.parse
		// happily accepts — only an object is a usable state.
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
		return parsed as URLState;
	} catch {
		return null;
	}
}

// ── Encoding ─────────────────────────────────────────────────────────────────

/**
 * True when `state` carries anything worth putting in the URL. yScale is always
 * present, so it only counts when it differs from the operator's configured
 * default.
 */
export function hasNonDefaultState(state: URLState, defaultYScale: number): boolean {
	if (state.yScale != null && state.yScale !== defaultYScale) return true;
	if (state.baseline) return true;
	if (state.yOffsets && Object.keys(state.yOffsets).length > 0) return true;
	if (state.sampleDisplay && Object.keys(state.sampleDisplay).length > 0) return true;
	if (state.hptfDisplay && Object.keys(state.hptfDisplay).length > 0) return true;
	if (state.eq && state.eq.filters.length > 0) return true;
	return false;
}

/**
 * Encode a name list into a `share=` value.
 *
 * `encodeURIComponent`, not `encodeURI`: over a thousand device names contain
 * `+`, `&` or `#`, and `encodeURI` leaves all three untouched. `&` would end the
 * parameter, `#` would start the fragment, and `+` decodes back as a space —
 * the same class of breakage `buildShareUrl` guards against for outbound
 * cross-site links. Reading is unaffected: `URLSearchParams` decodes both forms
 * identically, so links minted by older builds still resolve.
 */
export function encodeShareNames(names: string[], useBase62: boolean): string {
	const joined = names.join(',');
	return useBase62 ? BASE62_PREFIX + Base62.encode(joined) : encodeURIComponent(joined);
}

/**
 * Build the query string for a share URL — `''` when there is nothing to
 * encode, otherwise some combination of `share=` and `state=`.
 */
export function buildQueryString(
	names: string[],
	state: URLState,
	defaultYScale: number,
	useBase62: boolean
): string {
	const parts: string[] = [];

	if (names.length > 0) parts.push(`share=${encodeShareNames(names, useBase62)}`);
	if (hasNonDefaultState(state, defaultYScale)) {
		parts.push(`state=${Base62.encode(JSON.stringify(state))}`);
	}

	return parts.length > 0 ? `?${parts.join('&')}` : '';
}
