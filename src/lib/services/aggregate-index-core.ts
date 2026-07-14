import { browser } from '$app/environment';
import { getConfigValue } from '$lib/utils/config.js';
import type {
	AggregateDb,
	AggregateIndex,
	AggregateMeasurement,
	AggregateSite,
	CrossSiteSearchConfig,
	CrossSiteSearchResult
} from '$lib/types/aggregate-index-types.js';

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

const SQUIGLINK_ROOT_HOST = 'squig.link';

/** Pre-lowered row, built once per index load and reused for every keystroke. */
export interface SearchRow {
	displayLower: string;
	result: CrossSiteSearchResult;
}

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
	const fallback = getConfigValue('CROSS_SITE_SEARCH.SQUIGLINK_FALLBACK') as boolean | undefined;

	const indexUrls = Array.isArray(urls)
		? urls.filter((url): url is string => typeof url === 'string' && url.trim() !== '')
		: [];

	return {
		ENABLED: (enabled ?? legacyEnabled ?? true) !== false,
		INDEX_URLS: indexUrls.length > 0 ? indexUrls : DEFAULT_INDEX_URLS,
		SQUIGLINK_FALLBACK: fallback !== false
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

function rankDbType(dbType: string): number {
	const index = DB_TYPE_ORDER.indexOf(dbType);
	return index === -1 ? DB_TYPE_ORDER.length : index;
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

/**
 * Orders hits by rig class, then delta-ready databases, then site and device
 * name. Shared with the squig.link phone-book fallback so both sources present
 * results identically.
 */
export function sortCrossSiteResults(results: CrossSiteSearchResult[]): CrossSiteSearchResult[] {
	return results.sort((a, b) => {
		const rankDiff = rankDbType(a.dbType) - rankDbType(b.dbType);
		if (rankDiff !== 0) return rankDiff;
		if (a.dbType !== b.dbType) return a.dbType.localeCompare(b.dbType);
		if (a.deltaReady !== b.deltaReady) return a.deltaReady ? -1 : 1;
		if (a.siteName !== b.siteName) return a.siteName.localeCompare(b.siteName);
		return a.phoneName.localeCompare(b.phoneName);
	});
}

/** Tries each URL in order; the first one that yields a valid index wins. */
export async function fetchAggregateIndex(urls: string[]): Promise<AggregateIndex | null> {
	for (const url of urls) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
			if (!res.ok) continue;
			const data = (await res.json()) as AggregateIndex;
			if (
				Array.isArray(data?.brands) &&
				Array.isArray(data?.sites) &&
				Array.isArray(data?.dbs) &&
				Array.isArray(data?.phones)
			) {
				return data;
			}
		} catch {
			// Try the next mirror.
		}
	}
	return null;
}

/**
 * Flattens the index into search rows, dropping databases hosted on the site the
 * visitor is already looking at. Handles both `phonesFormat` variants.
 */
export function buildSearchRows(index: AggregateIndex): SearchRow[] {
	const sitesById = new Map(index.sites.map((site) => [site.id, site]));
	const dbsById = new Map<string, { db: AggregateDb; site: AggregateSite }>();

	for (const db of index.dbs) {
		const site = sitesById.get(db.siteId);
		if (!site || isCurrentSite(site)) continue;
		dbsById.set(db.id, { db, site });
	}

	const collapsed = index.phonesFormat === 'collapsed';
	const rows: SearchRow[] = [];

	for (const phone of index.phones) {
		const brand = index.brands[phone.b];
		if (brand === undefined) continue;

		const displayLower = `${brand} ${phone.n}`.toLowerCase();
		const measurements: AggregateMeasurement[] =
			collapsed && phone.m ? phone.m : [{ db: phone.db ?? '', s: phone.s }];

		for (const measurement of measurements) {
			const entry = dbsById.get(measurement.db);
			if (!entry) continue;
			const { db, site } = entry;

			rows.push({
				displayLower,
				result: {
					siteId: site.id,
					siteName: site.name,
					dbId: db.id,
					dbType: db.type,
					deltaReady: !!db.deltaReady,
					brand,
					phoneName: phone.n,
					url: buildShareUrl(db.url, measurement.s ?? deriveShareSlug(brand, phone.n))
				}
			});
		}
	}

	return rows;
}

export function searchRows(rows: SearchRow[], query: string): CrossSiteSearchHits {
	const q = query.trim().toLowerCase();
	if (q.length < MIN_QUERY_LENGTH) return { results: [], total: 0 };

	const matches = rows.filter((row) => row.displayLower.includes(q)).map((row) => row.result);

	return { results: sortCrossSiteResults(matches).slice(0, MAX_RESULTS), total: matches.length };
}
