import { browser } from '$app/environment';
import { getConfigValue } from '$lib/utils/config.js';
import { rankDbType } from './aggregate-index-core.js';
import type {
	SiteIndex,
	SiteIndexEntry,
	SiteIndexGroup,
	SiteSelectorConfig
} from '$lib/types/site-index-types.js';

/**
 * Pure half of the site selector: config resolution, index fetching, flattening
 * and grouping. No reactive state — that lives in `site-index.svelte.ts`.
 *
 * The document is the GAA site index: every known graph site and database, with
 * URLs already resolved. It deliberately excludes the device corpus that makes
 * the GraphAggregator index large, so it costs a few KB rather than a few
 * hundred and can be fetched on load.
 */

/** Official GAA index. Used when the operator leaves `SITE_SELECTOR.INDEX_URLS` empty. */
export const DEFAULT_SITE_INDEX_URLS = ['https://potatosalad775.github.io/GAA/db-site-index.json'];

const FETCH_TIMEOUT_MS = 10_000;

/** Resolves `SITE_SELECTOR`, applying the defaults for a config that omits the section. */
export function getSiteSelectorConfig(): SiteSelectorConfig {
	const enabled = getConfigValue('SITE_SELECTOR.ENABLED') as 'auto' | boolean | undefined;
	const urls = getConfigValue('SITE_SELECTOR.INDEX_URLS');

	const indexUrls = Array.isArray(urls)
		? urls.filter((url): url is string => typeof url === 'string' && url.trim() !== '')
		: [];

	return {
		// `auto` is the shipped default: the selector appears for deployments the
		// index knows about, and stays out of the way for everyone else.
		ENABLED: enabled === true || enabled === false ? enabled : 'auto',
		INDEX_URLS: indexUrls.length > 0 ? indexUrls : DEFAULT_SITE_INDEX_URLS
	};
}

/**
 * Splits a database URL into the two parts current-site matching needs. Paths
 * are normalized to a single trailing slash so `/headphones` and `/headphones/`
 * compare equal.
 */
function splitUrl(url: string): { host: string; path: string } | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	const port = parsed.port ? ':' + parsed.port : '';
	return {
		host: parsed.hostname.toLowerCase() + port,
		path: parsed.pathname.replace(/\/+$/, '') + '/'
	};
}

/**
 * Finds the database the tool is currently served from, or `null` when the
 * deployment isn't in the index.
 *
 * Longest path match wins: squig.link hosts several databases per site under
 * folders (`/`, `/headphones/`), and the root database would otherwise match
 * every one of them.
 *
 * `href` defaults to the current location; tests pass it explicitly, since
 * browser-mode specs can't navigate the page they run on.
 */
export function findCurrentDbId(index: SiteIndex, href?: string): string | null {
	const location = href ?? (browser ? window.location.href : null);
	if (location === null) return null;

	const here = splitUrl(location);
	if (!here) return null;

	let currentId: string | null = null;
	let matchedLength = -1;

	for (const db of index.dbs) {
		const target = splitUrl(db.url);
		if (!target || target.host !== here.host) continue;
		if (here.path !== target.path && !here.path.startsWith(target.path)) continue;

		if (target.path.length > matchedLength) {
			matchedLength = target.path.length;
			currentId = db.id;
		}
	}

	return currentId;
}

/** Requests each mirror in turn, taking the first that answers with a usable document. */
export async function fetchSiteIndex(urls: string[]): Promise<SiteIndex | null> {
	for (const url of urls) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
			if (!res.ok) continue;
			const data = (await res.json()) as SiteIndex;
			if (Array.isArray(data?.sites) && Array.isArray(data?.dbs)) return data;
		} catch {
			// Another mirror may still answer.
		}
	}
	return null;
}

/** Flattens the index into one entry per database, joined to its owning site. */
export function buildSiteEntries(index: SiteIndex, currentDbId: string | null): SiteIndexEntry[] {
	// A throwaway lookup, rebuilt whenever the index reloads and never read
	// outside this function — nothing to make reactive.
	const sitesById = new Map(index.sites.map((site) => [site.id, site]));
	const entries: SiteIndexEntry[] = [];

	for (const db of index.dbs) {
		const site = sitesById.get(db.siteId);
		if (!site || typeof db.id !== 'string' || typeof db.type !== 'string') continue;
		if (typeof db.url !== 'string' || !db.url) continue;

		entries.push({
			dbId: db.id,
			siteId: site.id,
			siteName: site.name,
			type: db.type,
			url: db.url,
			deltaReady: db.deltaReady === true,
			// Absent means verified — only GAA-style documents carry the flag, and a
			// plain aggregator-shaped one has already been verified by definition.
			verified: db.verified !== false,
			isCurrent: currentDbId !== null && db.id === currentDbId
		});
	}

	return entries;
}

/**
 * Groups entries by rig class for the dropdown, best measurements first, sites
 * alphabetical within each group.
 */
export function groupSiteEntries(entries: SiteIndexEntry[]): SiteIndexGroup[] {
	const byType = new Map<string, SiteIndexEntry[]>();

	for (const entry of entries) {
		const group = byType.get(entry.type);
		if (group) group.push(entry);
		else byType.set(entry.type, [entry]);
	}

	for (const group of byType.values()) {
		group.sort((a, b) => a.siteName.localeCompare(b.siteName) || a.url.localeCompare(b.url));
	}

	return [...byType.keys()]
		.sort((a, b) => rankDbType(a) - rankDbType(b) || a.localeCompare(b))
		.map((type) => ({ type, entries: byType.get(type)! }));
}
