import {
	buildSiteEntries,
	fetchSiteIndex,
	findCurrentDbId,
	getSiteSelectorConfig,
	groupSiteEntries
} from './site-index-core.js';
import type { SiteIndexEntry, SiteIndexGroup } from '$lib/types/site-index-types.js';

/**
 * The site/database directory behind the site selector — one small JSON
 * document listing every known graph site, with URLs already resolved.
 *
 * Host-agnostic: unlike the old `squigsites.json` path this replaced, it is not
 * gated on a squig.link domain, so a federated deployment registered with the
 * aggregator gets the network switcher too. Pure logic lives in
 * `site-index-core.ts`.
 */
export class SiteIndexService {
	status = $state<'idle' | 'loading' | 'ready' | 'failed'>('idle');

	entries = $state<SiteIndexEntry[]>([]);
	/** Timestamp the loaded index was generated at, for staleness display. */
	generatedAt = $state<string | null>(null);
	/** Database the tool is served from, or `null` when the deployment isn't listed. */
	currentDbId = $state<string | null>(null);

	#loading: Promise<boolean> | null = null;

	get isReady(): boolean {
		return this.status === 'ready';
	}

	/** Entries grouped by rig class, in dropdown order. */
	groups: SiteIndexGroup[] = $derived(groupSiteEntries(this.entries));

	get currentEntry(): SiteIndexEntry | null {
		return this.entries.find((entry) => entry.isCurrent) ?? null;
	}

	/** Fetches and flattens the index. Resolves `true` once usable. */
	load(): Promise<boolean> {
		if (this.status === 'ready') return Promise.resolve(true);
		this.#loading ??= this.#load();
		return this.#loading;
	}

	async #load(): Promise<boolean> {
		this.status = 'loading';

		const index = await fetchSiteIndex(getSiteSelectorConfig().INDEX_URLS);
		if (!index) {
			this.status = 'failed';
			// Page-lifetime singleton — drop the cached promise so a later call retries.
			this.#loading = null;
			return false;
		}

		this.currentDbId = findCurrentDbId(index);
		this.entries = buildSiteEntries(index, this.currentDbId);
		this.generatedAt = index.generatedAt ?? null;
		this.status = 'ready';
		return true;
	}
}

export const siteIndexService = new SiteIndexService();
