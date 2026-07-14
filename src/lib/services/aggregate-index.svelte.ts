import {
	buildSearchRows,
	fetchAggregateIndex,
	getCrossSiteSearchConfig,
	searchRows,
	type CrossSiteSearchHits,
	type SearchRow
} from './aggregate-index-core.js';

/**
 * Cross-site search over the GraphAggregator index — one JSON document listing
 * every known site, database and device. Host-agnostic: unlike `squiglink-store`,
 * this is not gated on a squig.link domain.
 *
 * The index is fetched lazily on the first query, then flattened into a
 * prebuilt row set that every subsequent keystroke matches against. Pure logic
 * lives in `aggregate-index-core.ts`.
 */
export class AggregateIndexService {
	status = $state<'idle' | 'loading' | 'ready' | 'failed'>('idle');
	/** Timestamp the loaded index was generated at, for staleness display. */
	generatedAt = $state<string | null>(null);

	#rows: SearchRow[] = [];
	#loading: Promise<boolean> | null = null;

	get isReady(): boolean {
		return this.status === 'ready';
	}

	/** Fetches and indexes the aggregate document. Resolves `true` once usable. */
	load(): Promise<boolean> {
		if (this.status === 'ready') return Promise.resolve(true);
		this.#loading ??= this.#load();
		return this.#loading;
	}

	async #load(): Promise<boolean> {
		this.status = 'loading';

		const index = await fetchAggregateIndex(getCrossSiteSearchConfig().INDEX_URLS);
		if (!index) {
			this.status = 'failed';
			return false;
		}

		this.#rows = buildSearchRows(index);
		this.generatedAt = index.generatedAt ?? null;
		this.status = 'ready';
		return true;
	}

	search(query: string): CrossSiteSearchHits {
		// Read through `status` so callers re-run this once the index lands.
		if (this.status !== 'ready') return { results: [], total: 0 };
		return searchRows(this.#rows, query);
	}
}

export const aggregateIndexService = new AggregateIndexService();
