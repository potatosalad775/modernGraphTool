/**
 * Pure share-URL encoding/decoding.
 *
 * Split out of `url-provider.ts` so it can be tested without a DOM, a router or
 * the stores. `URLProvider` keeps everything that touches `window`, `document`,
 * `goto` and the FR/graph/EQ stores; everything below is a function of
 * its arguments only.
 */
import Base62 from './base62.js';
import type { EQFilter } from './equalizer.js';
import type {
	BaselineMode,
	Channel,
	FRDataObject,
	SampleDisplayKey
} from '#lib/types/data-types.js';
import { MAX_BANDS } from '#lib/workers/autoeq-request.js';
import { curveBaseName } from './curve-name.js';
import { sanitizeChannel } from './eq-channel.js';
import { isFiniteNumber, parseFilter } from './eq-filter-parse.js';
import { isRecord } from './type-guards.js';
import { parseSampleKey, sampleKey } from './sample-key.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EQStateSnapshot {
	filters: EQFilter[];
	preamp: number;
}

/** Per-item sample display, as written into `state=` today. */
export interface SampleDisplayState {
	keys: SampleDisplayKey[];
	fill: boolean;
	avg: boolean;
}

export interface URLState {
	yScale?: number;
	baseline?: { key: string; mode: BaselineMode };
	yOffsets?: Record<string, number>;
	eq?: EQStateSnapshot;
	sampleDisplay?: Record<string, SampleDisplayState | SampleDisplayKey[] | string[]>;
	/** @deprecated Written by builds that kept HpTF separate. Read, never written. */
	hptfDisplay?: Record<string, { keys: SampleDisplayKey[]; fill: boolean }>;
}

/** How `state=` names a curve item: its identifier and variant, e.g. `Phone V2`. */
export function shareKey(item: Pick<FRDataObject, 'identifier' | 'dispSuffix'>): string {
	return curveBaseName(item).trim();
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

	for (const char of input) {
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

/**
 * Decode a `state=` value. Returns null for anything malformed; a state whose
 * object is fine but some part is not comes back with that part dropped
 * (see `sanitizeState`).
 */
export function parseStateParam(value: string | null): URLState | null {
	if (!value) return null;
	try {
		const parsed: unknown = JSON.parse(Base62.decode(value));
		// Base62.decode of junk can yield a bare number or string, which JSON.parse
		// happily accepts — only an object is a usable state.
		if (!isRecord(parsed)) return null;
		return sanitizeState(parsed);
	} catch {
		return null;
	}
}

/**
 * Keys that must never become a property of a state object we build: assigning
 * `__proto__` swaps the prototype instead of creating a key.
 */
function isSafeKey(key: string): boolean {
	return key !== '__proto__';
}

/** The own entries of a record, minus keys that cannot be assigned safely. */
function safeEntries(record: Record<string, unknown>): [string, unknown][] {
	return Object.entries(record).filter(([key]) => isSafeKey(key));
}

/**
 * Narrow a decoded `state=` object to the shape `URLState` promises.
 *
 * The value is hand-editable and arrives from anyone who can send a link, so
 * each part is checked on its own and an invalid one is skipped rather than
 * rejecting the whole state: the rest of the page still restores. Numbers must
 * be finite, the EQ list is read band by band with `parseFilter` and capped at
 * `MAX_BANDS`, and a record keyed by device name is rebuilt without
 * `__proto__`. What the current encoder writes passes through unchanged.
 */
export function sanitizeState(raw: Record<string, unknown>): URLState {
	const state: URLState = {};

	if (isFiniteNumber(raw.yScale)) state.yScale = raw.yScale;

	const { baseline } = raw;
	if (isRecord(baseline) && typeof baseline.key === 'string' && typeof baseline.mode === 'string') {
		// `mode` stays a plain string: the baseline module validates it.
		state.baseline = { key: baseline.key, mode: baseline.mode as BaselineMode };
	}

	if (isRecord(raw.yOffsets)) {
		const yOffsets = keepEntries(raw.yOffsets, isFiniteNumber);
		if (Object.keys(yOffsets).length > 0) state.yOffsets = yOffsets;
	}

	const eq = sanitizeEq(raw.eq);
	if (eq) state.eq = eq;

	if (isRecord(raw.sampleDisplay)) {
		state.sampleDisplay = keepEntries(
			raw.sampleDisplay,
			(entry): entry is SampleDisplayState | string[] => Array.isArray(entry) || isRecord(entry)
		);
	}

	if (isRecord(raw.hptfDisplay)) {
		// eslint-disable-next-line @typescript-eslint/no-deprecated -- old share links still carry it
		state.hptfDisplay = keepEntries(
			raw.hptfDisplay,
			(entry): entry is { keys: SampleDisplayKey[]; fill: boolean } => isRecord(entry)
		);
	}

	return state;
}

/** A record keyed by device name, rebuilt from the entries that pass `keep`. */
function keepEntries<T>(
	record: Record<string, unknown>,
	keep: (entry: unknown) => entry is T
): Record<string, T> {
	const kept: Record<string, T> = {};
	for (const [key, entry] of safeEntries(record)) {
		if (keep(entry)) kept[key] = entry;
	}
	return kept;
}

function sanitizeEq(eq: unknown): URLState['eq'] | null {
	if (!isRecord(eq) || !Array.isArray(eq.filters)) return null;
	const filters: EQFilter[] = [];
	for (const item of eq.filters as unknown[]) {
		if (filters.length >= MAX_BANDS) break;
		// An unknown `channel` reads as a shared band rather than losing the band
		// (it would otherwise belong to no ear and vanish from every scoped view).
		const filter = isRecord(item)
			? parseFilter({ ...item, channel: sanitizeChannel(item.channel) })
			: null;
		if (filter) filters.push(filter);
	}
	return { filters, preamp: isFiniteNumber(eq.preamp) ? eq.preamp : 0 };
}

/** The well-formed `sample{n}_{ch}` keys of a hand-editable value; anything else is dropped. */
function sampleKeysOf(value: unknown): SampleDisplayKey[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(k): k is SampleDisplayKey => typeof k === 'string' && parseSampleKey(k) !== null
	);
}

/**
 * Fold every historical shape of the sample-display state into the current one.
 *
 * Three forms exist in links already out in the wild, and none of them fail
 * loudly when dropped — the page just loads with the wrong curves showing:
 *
 *  1. `sampleDisplay` as a flat array of `L{n}`/`R{n}`, 1-based, from the
 *     multi-sample era. Mapped to `sample{n-1}_{ch}`.
 *  2. `hptfDisplay` as `{ keys, fill }`. Its keys are already `sample{n}_{ch}`,
 *     so only the wrapper changes.
 *  3. The current `{ keys, fill, avg }` object.
 *
 * An item was never both multi-sample and HpTF, so the two sources can't
 * collide on a key; `hptfDisplay` is applied second regardless.
 */
export function normalizeSampleDisplay(state: URLState): Record<string, SampleDisplayState> {
	const out: Record<string, SampleDisplayState> = {};

	for (const [key, value] of Object.entries(state.sampleDisplay ?? {})) {
		if (!isSafeKey(key)) continue;
		if (Array.isArray(value)) {
			const keys = value
				.map((k: unknown) => {
					if (typeof k !== 'string') return null;
					const match = /^([LR])(\d+)$/.exec(k);
					if (match) return sampleKey(parseInt(match[2]) - 1, match[1] as Channel);
					return parseSampleKey(k) ? (k as SampleDisplayKey) : null;
				})
				.filter((k): k is SampleDisplayKey => k !== null);
			out[key] = { keys, fill: false, avg: true };
		} else if (isRecord(value)) {
			out[key] = {
				keys: sampleKeysOf(value.keys),
				fill: typeof value.fill === 'boolean' ? value.fill : false,
				avg: typeof value.avg === 'boolean' ? value.avg : true
			};
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-deprecated -- old share links still carry it
	for (const [key, value] of Object.entries(state.hptfDisplay ?? {})) {
		if (!isSafeKey(key) || !isRecord(value)) continue;
		out[key] = {
			keys: sampleKeysOf(value.keys),
			fill: typeof value.fill === 'boolean' ? value.fill : false,
			avg: true
		};
	}

	return out;
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
	// A sample set that is drawn exactly as the phone book declares carries no
	// information — only a state the user changed is worth a longer URL.
	if (state.sampleDisplay && Object.keys(state.sampleDisplay).length > 0) return true;
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
