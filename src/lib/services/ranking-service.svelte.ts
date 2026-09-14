import { browser } from '$app/environment';
import { csvToRows } from '$lib/utils/csv.js';
import {
	adaptInlineSource,
	adaptSquigRankingConfig,
	buildRankIndex,
	getRankingSettings,
	lookupRank,
	type RankIndex,
	type RankingSettings,
	type ResolvedRank
} from './ranking-core.js';
import type { RankScaleEntry } from '$lib/types/data-types.js';

/**
 * Device ranks read from a published CSV.
 *
 * **Entirely opt-in.** Nothing here runs unless the operator set
 * `RANKING.CONFIG_URL` or `RANKING.SOURCE`; a deploy that only sets
 * `RANKING.URL` — the common case, pointing the existing `phone_book.json`
 * score at a spreadsheet or a review site — never reaches the network through
 * this file, and neither does one that configures no ranking at all.
 *
 * The sheet is the source of truth where it has an opinion. A device it has no
 * row for falls back to its `phone_book.json` `reviewScore`, so turning this on
 * can only add ranks, never remove ones that already showed.
 *
 * Failure is silent by design: a sheet that 404s, times out or is served
 * without CORS leaves the whole device list exactly as it would have been
 * without the feature, plus one console warning for the operator.
 */
export class RankingService {
	status = $state<'idle' | 'disabled' | 'loading' | 'ready' | 'failed'>('idle');

	/**
	 * Rank steps from the resolved source.
	 *
	 * Public because it also styles ranks that came from `phone_book.json`: a
	 * fallback `reviewScore` of `A+` should be the same badge as a sheet cell of
	 * `A+`, not a bare string next to one.
	 */
	scale = $state.raw<RankScaleEntry[]>([]);

	/** Never deep-mutated, only replaced — and it holds `Map`s a proxy can't help. */
	#index = $state.raw<RankIndex | null>(null);
	#loading: Promise<boolean> | null = null;
	#loadedAt = 0;
	#warned = false;

	/** The row for a device, or `null` when the sheet has none. Cheap to call per render. */
	lookup(brand: string, model: string): ResolvedRank | null {
		return lookupRank(this.#index, brand, model);
	}

	/**
	 * Fetch the sheet if it isn't already loaded and fresh.
	 *
	 * Idempotent and safe to call from a panel that unmounts on every panel
	 * switch — which is also what revalidates it. `CACHE_TTL` is what makes the
	 * sheet a moving target rather than a page-load snapshot: reopening the
	 * device list after the window has passed picks up an edited grade without a
	 * reload, and reopening it before then costs nothing.
	 */
	load(): Promise<boolean> {
		if (!browser) return Promise.resolve(false);

		const settings = getRankingSettings();
		if (!settings.configUrl && !settings.source) {
			this.status = 'disabled';
			return Promise.resolve(false);
		}

		// A failure counts as fresh too, so flipping between panels doesn't retry
		// an unreachable sheet on every switch.
		const fresh = Date.now() - this.#loadedAt < settings.cacheTtlMs;
		if ((this.status === 'ready' || this.status === 'failed') && fresh) {
			return Promise.resolve(this.status === 'ready');
		}
		if (this.#loading) return this.#loading;

		this.#loading = this.#load(settings);
		return this.#loading;
	}

	async #load(settings: RankingSettings): Promise<boolean> {
		this.status = 'loading';
		try {
			const source = settings.configUrl
				? adaptSquigRankingConfig(await loadRankingConfig(settings.configUrl), settings.type)
				: settings.source
					? adaptInlineSource(settings.source)
					: null;
			if (!source) throw new Error('no usable ranking source in the configuration');

			const response = await fetch(source.csvUrl, { cache: 'no-store' });
			if (!response.ok) throw new Error(`sheet responded ${response.status}`);

			this.#index = buildRankIndex(csvToRows(await response.text()), source, settings.match);
			this.scale = source.scale;
			this.status = 'ready';
			return true;
		} catch (error) {
			// Once per page: the operator needs to see it, the visitor can't act on it.
			if (!this.#warned) {
				this.#warned = true;
				console.warn(
					'[modernGraphTool] Ranking sheet could not be loaded — falling back to ' +
						'phone_book.json scores. Check RANKING.CONFIG_URL / RANKING.SOURCE.CSV_URL ' +
						'is reachable and served with CORS.',
					error
				);
			}
			this.status = 'failed';
			return false;
		} finally {
			this.#loadedAt = Date.now();
			this.#loading = null;
		}
	}
}

/**
 * Load a squigRanking `ranking-config.js` and hand back `window.RANKING_CONFIG`.
 *
 * Injected as a plain `<script>`, which is how the ranking page itself loads it
 * and how `app.html` loads our own `config.js`. That also sidesteps CORS: a
 * cross-origin script tag needs no headers, where `fetch()` of the same file
 * would need them and then an `eval` to mean anything.
 */
async function loadRankingConfig(url: string): Promise<unknown> {
	const existing = (window as { RANKING_CONFIG?: unknown }).RANKING_CONFIG;
	if (existing) return existing;

	await new Promise<void>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = url;
		script.async = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error(`could not load ranking config: ${url}`));
		document.head.appendChild(script);
	});

	return (window as { RANKING_CONFIG?: unknown }).RANKING_CONFIG ?? null;
}

export const rankingService = new RankingService();
