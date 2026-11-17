import { browser } from '$app/env';
import * as m from '#lib/paraglide/messages.js';
import { getConfigValue } from '#lib/utils/config.js';
import { sanitizeHttpUrl } from '#lib/utils/html-sanitizer.js';
import { matchesQueryGroup, splitQueryGroups, type QueryGroup } from '#lib/utils/search-query.js';
import { isRecord } from '#lib/utils/type-guards.js';
import type {
	AggregateDb,
	AggregateIndex,
	AggregateMeasurement,
	AggregateSite,
	CrossSiteSearchConfig,
	CrossSiteSearchResult
} from '#lib/types/aggregate-index-types.js';

/**
 * Pure half of cross-site search: config resolution, index fetching, row
 * building, matching and sorting. No reactive state — that lives in
 * `aggregate-index.svelte.ts`. The squig.link phone-book fallback in
 * `squiglink-store` reuses the link and sort helpers so both data sources emit
 * an identical `CrossSiteSearchResult`.
 */

/**
 * Official GraphAggregator index, custom domain first, GitHub Pages as backup.
 * Used when the operator leaves `CROSS_SITE_SEARCH.INDEX_URLS` empty.
 */
export const DEFAULT_INDEX_URLS = [
	'https://graphaggregator.harutohiroki.com/aggregate-index.json',
	'https://harutohiroki.github.io/GraphAggregator/aggregate-index.json'
];

/** Cap on rendered hits — the index holds ~25k devices, a 2-char query matches a lot. */
export const MAX_RESULTS = 100;

export const MIN_QUERY_LENGTH = 2;

const FETCH_TIMEOUT_MS = 10_000;

/** Databases are grouped by rig class in the result list, best measurements first. */
const DB_TYPE_ORDER = ['5128', 'IEMs', 'Headphones', 'Earbuds'];

/** `5128` is a rig's model number, so it has no message and always shows as is. */
const DB_TYPE_LABELS = new Map<string, () => string>([
	['IEMs', () => m.db_type_iems()],
	['Headphones', () => m.db_type_headphones()],
	['Earbuds', () => m.db_type_earbuds()]
]);

const SQUIGLINK_ROOT_HOST = 'squig.link';

/**
 * Pre-lowered row, built once per index load and reused for every keystroke.
 * `buildSearchRows` returns them already in result order, so a query only filters.
 */
export interface SearchRow {
	displayLower: string;
	result: CrossSiteSearchResult;
	/** Position in the index's own order, which breaks ties the comparator can't. */
	seq: number;
	/** Rows that compare equal share one id; ids rise along the sorted rows. */
	tie: number;
}

/** The default locale's collation, which `localeCompare` would rebuild on every call. */
const collator = new Intl.Collator();

export interface CrossSiteSearchHits {
	results: CrossSiteSearchResult[];
	/** Total matches before the `MAX_RESULTS` cap. */
	total: number;
}

/** Resolves `CROSS_SITE_SEARCH`, falling back to the deprecated squig.link toggle. */
export function getCrossSiteSearchConfig(): CrossSiteSearchConfig {
	const enabled = getConfigValue('CROSS_SITE_SEARCH.ENABLED') as boolean | undefined;
	const legacyEnabled = getConfigValue('SQUIGLINK.ENABLE_CROSS_SITE_SEARCH') as boolean | undefined;
	const urls = getConfigValue('CROSS_SITE_SEARCH.INDEX_URLS');

	const indexUrls = Array.isArray(urls)
		? urls.filter((url): url is string => typeof url === 'string' && url.trim() !== '')
		: [];

	return {
		ENABLED: (enabled ?? legacyEnabled ?? true) !== false,
		INDEX_URLS: indexUrls.length > 0 ? indexUrls : DEFAULT_INDEX_URLS
	};
}

/** Slug used by CrinGraph-style `?share=` links when the index omits one. */
export function deriveShareSlug(brand: string, phoneName: string): string {
	return `${brand} ${phoneName}`.replace(/ /g, '_');
}

/**
 * Over a thousand device names carry `+`, `&` or non-ASCII characters, so the
 * slug must be encoded — concatenated raw, the receiving site decodes `+` back
 * as a space and fails to find the device.
 */
export function buildShareUrl(dbUrl: string, slug: string): string {
	return `${dbUrl}?share=${encodeURIComponent(slug)}`;
}

/**
 * Position of a rig class in the canonical ordering; unknown types sort last.
 * Shared with the site selector so search results and the site dropdown group
 * databases in the same order.
 */
export function rankDbType(dbType: string): number {
	const index = DB_TYPE_ORDER.indexOf(dbType);
	return index === -1 ? DB_TYPE_ORDER.length : index;
}

/**
 * Display name of a rig class. Types come from the index, so one without a
 * message shows as published. Display only: grouping and ranking use the raw type.
 */
export function dbTypeLabel(dbType: string): string {
	return DB_TYPE_LABELS.get(dbType)?.() ?? dbType;
}

/** True when `site` is the site this tool is currently served from. */
function isCurrentSite(site: AggregateSite): boolean {
	if (!browser) return false;

	let siteUrl: URL;
	try {
		siteUrl = new URL(site.url);
	} catch {
		return false;
	}
	if (siteUrl.hostname !== window.location.hostname) return false;

	// squig.link's root domain hosts many databases under /lab/<username>,
	// so the hostname alone doesn't identify a site there.
	if (siteUrl.hostname === SQUIGLINK_ROOT_HOST) {
		const labPath = (path: string) => path.match(/^\/lab\/[^/]+/)?.[0] ?? '/';
		return labPath(siteUrl.pathname) === labPath(window.location.pathname);
	}

	return true;
}

/** Rig class, then delta-ready databases, then site and device name. */
function compareResults(a: CrossSiteSearchResult, b: CrossSiteSearchResult): number {
	const rankDiff = rankDbType(a.dbType) - rankDbType(b.dbType);
	if (rankDiff !== 0) return rankDiff;
	if (a.dbType !== b.dbType) return collator.compare(a.dbType, b.dbType);
	if (a.deltaReady !== b.deltaReady) return a.deltaReady ? -1 : 1;
	if (a.siteName !== b.siteName) return collator.compare(a.siteName, b.siteName);
	return collator.compare(a.phoneName, b.phoneName);
}

/**
 * Orders hits by rig class, then delta-ready databases, then site and device
 * name. `buildSearchRows` applies the same order once per index load; this
 * stays for callers that hold loose results.
 */
export function sortCrossSiteResults(results: CrossSiteSearchResult[]): CrossSiteSearchResult[] {
	return results.sort(compareResults);
}

function isAggregateIndex(data: unknown): data is AggregateIndex {
	const doc = data as Partial<AggregateIndex> | null | undefined;
	return (
		Array.isArray(doc?.brands) &&
		Array.isArray(doc.sites) &&
		Array.isArray(doc.dbs) &&
		Array.isArray(doc.phones)
	);
}

/**
 * Requests every mirror at once and takes the first valid index in URL order: a
 * later mirror is read only once every earlier one has failed, so the primary
 * keeps its preference and a stalled one doesn't add its timeout to the next
 * one's. Only the mirror that is read gets its body parsed; the rest are
 * aborted as soon as a winner is known.
 */
export async function fetchAggregateIndex(urls: string[]): Promise<AggregateIndex | null> {
	const attempts = urls.map((url) => {
		const controller = new AbortController();
		const abort = () => controller.abort();
		// This budget is for the headers. The body gets its own when the mirror is read: a
		// mirror that answered must not be aborted while an earlier one runs out its time.
		const headerTimer = setTimeout(abort, FETCH_TIMEOUT_MS);
		const response = (async (): Promise<Response | null> => {
			try {
				return await fetch(url, { signal: controller.signal });
			} catch {
				return null;
			} finally {
				clearTimeout(headerTimer);
			}
		})();
		return { controller, abort, timer: headerTimer, response };
	});

	try {
		for (const attempt of attempts) {
			try {
				const res = await attempt.response;
				if (res?.ok) {
					attempt.timer = setTimeout(attempt.abort, FETCH_TIMEOUT_MS);
					const data: unknown = await res.json();
					if (isAggregateIndex(data)) return data;
				}
			} catch {
				// Another mirror may still answer.
			}
		}
		return null;
	} finally {
		// Whatever is still in flight, or holding a timer, is not needed any more.
		for (const attempt of attempts) {
			clearTimeout(attempt.timer);
			attempt.controller.abort();
		}
	}
}

/** An index `sites` row with the fields both index readers need. */
export function isSiteRow(
	value: unknown
): value is Record<string, unknown> & { id: string; name: string } {
	return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

/** An index `dbs` row with the fields both index readers need. */
export function isDbRow(
	value: unknown
): value is Record<string, unknown> & { id: string; siteId: string; type: string } {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.siteId === 'string' &&
		typeof value.type === 'string'
	);
}

/**
 * Flattens the index into search rows, dropping databases hosted on the site the
 * visitor is already looking at. Handles both `phonesFormat` variants.
 *
 * The document is someone else's, so every field read is type-checked and a bad
 * entry is skipped rather than allowed to throw. The rows come back sorted into
 * result order, once, so a query only has to filter them.
 */
export function buildSearchRows(index: AggregateIndex): SearchRow[] {
	const sitesById = new Map<string, AggregateSite>();
	for (const site of index.sites as unknown[]) {
		if (!isSiteRow(site)) continue;
		sitesById.set(site.id, site as unknown as AggregateSite);
	}

	const dbsById = new Map<string, { db: AggregateDb; site: AggregateSite; url: string }>();
	for (const db of index.dbs as unknown[]) {
		if (!isDbRow(db)) continue;
		const site = sitesById.get(db.siteId);
		if (!site || isCurrentSite(site)) continue;
		// The index is someone else's document and its URLs land in an `href`, so
		// only an absolute http(s) URL gets through — a `javascript:` entry is
		// dropped, along with every device it carried.
		const url = sanitizeHttpUrl(db.url);
		if (!url) continue;
		dbsById.set(db.id, { db: db as unknown as AggregateDb, site, url });
	}

	const collapsed = index.phonesFormat === 'collapsed';
	const rows: SearchRow[] = [];

	for (const phone of index.phones as unknown[]) {
		if (!isRecord(phone) || typeof phone.n !== 'string') continue;
		const brand: unknown = index.brands[phone.b as number];
		if (typeof brand !== 'string') continue;

		let measurements: unknown[];
		if (collapsed && phone.m) {
			if (!Array.isArray(phone.m)) continue;
			measurements = phone.m;
		} else {
			measurements = [{ db: phone.db ?? '', s: phone.s }];
		}

		const displayLower = `${brand} ${phone.n}`.toLowerCase();

		for (const measurement of measurements) {
			if (!isRecord(measurement) || typeof measurement.db !== 'string') continue;
			const slug = (measurement as unknown as AggregateMeasurement).s;
			if (slug != null && typeof slug !== 'string') continue;
			const entry = dbsById.get(measurement.db);
			if (!entry) continue;
			const { db, site, url } = entry;

			rows.push({
				displayLower,
				seq: rows.length,
				tie: 0,
				result: {
					siteId: site.id,
					siteName: site.name,
					dbId: db.id,
					dbType: db.type,
					deltaReady: !!db.deltaReady,
					brand,
					phoneName: phone.n,
					url: buildShareUrl(url, slug ?? deriveShareSlug(brand, phone.n))
				}
			});
		}
	}

	// Array.prototype.sort is stable, so rows that compare equal stay in index order.
	rows.sort((a, b) => compareResults(a.result, b.result));
	let tie = 0;
	for (let i = 1; i < rows.length; i++) {
		if (compareResults(rows[i - 1].result, rows[i].result) !== 0) tie++;
		rows[i].tie = tie;
	}

	return rows;
}

/**
 * Groups a cross-site query is searchable with, or `[]` when it isn't yet.
 *
 * Every group has to be met for a database to match, so a term still below
 * `MIN_QUERY_LENGTH` isn't a filter — it's a half-typed one. The whole query
 * waits rather than listing databases that the finished term would rule out.
 * A short alternative waits too: it would match nearly every device. A short
 * exclusion doesn't: it only drops names with that whole word.
 */
export function parseCrossSiteGroups(query: string): QueryGroup[] {
	const groups = splitQueryGroups(query);
	if (groups.length === 0) return [];
	return groups.some((group) => group.terms.some((term) => term.length < MIN_QUERY_LENGTH))
		? []
		: groups;
}

function matchesGroup(row: SearchRow, group: QueryGroup): boolean {
	return matchesQueryGroup(row.displayLower, group);
}

/**
 * `A,B` asks which databases carry *both* devices, so a row survives only when
 * its database matched every group — and then all of that database's matching
 * rows are kept, since the answer is the set of devices, not one of them.
 */
function matchEveryGroup(rows: SearchRow[], groups: QueryGroup[]): SearchRow[] {
	// `rows` is already in result order, so the candidates are too.
	const byDb = new Map<string, { matched: Set<number>; firstSeq: number }>();
	const candidates: SearchRow[] = [];

	for (const row of rows) {
		let entry: { matched: Set<number>; firstSeq: number } | undefined;
		for (const [i, group] of groups.entries()) {
			if (!matchesGroup(row, group)) continue;
			if (!entry) {
				entry = byDb.get(row.result.dbId);
				if (!entry) {
					entry = { matched: new Set(), firstSeq: row.seq };
					byDb.set(row.result.dbId, entry);
				}
			}
			entry.matched.add(i);
		}
		if (entry) {
			if (row.seq < entry.firstSeq) entry.firstSeq = row.seq;
			candidates.push(row);
		}
	}

	const matches = candidates.filter(
		(row) => byDb.get(row.result.dbId)!.matched.size === groups.length
	);

	// Rows that compare equal sit in index order, but across databases the order
	// has always been the one whose first matching row came first. Only a run of
	// equal rows spanning databases can differ, so only those are reordered.
	let start = 0;
	while (start < matches.length) {
		let end = start + 1;
		let spansDatabases = false;
		while (end < matches.length && matches[end].tie === matches[start].tie) {
			if (matches[end].result.dbId !== matches[start].result.dbId) spansDatabases = true;
			end++;
		}
		if (spansDatabases) {
			const run = matches
				.slice(start, end)
				.sort((a, b) => byDb.get(a.result.dbId)!.firstSeq - byDb.get(b.result.dbId)!.firstSeq);
			for (const [offset, row] of run.entries()) matches[start + offset] = row;
		}
		start = end;
	}

	return matches;
}

export function searchRows(rows: SearchRow[], query: string): CrossSiteSearchHits {
	const groups = parseCrossSiteGroups(query);
	if (groups.length === 0) return { results: [], total: 0 };

	const matches =
		groups.length === 1
			? rows.filter((row) => matchesGroup(row, groups[0]))
			: matchEveryGroup(rows, groups);

	return {
		results: matches.slice(0, MAX_RESULTS).map((row) => row.result),
		total: matches.length
	};
}
