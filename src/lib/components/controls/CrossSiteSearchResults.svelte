<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { squiglinkStore } from '$lib/stores/squiglink-store.svelte.js';
	import { aggregateIndexService } from '$lib/services/aggregate-index.svelte.js';
	import { getCrossSiteSearchConfig, MAX_RESULTS } from '$lib/services/aggregate-index-core.js';
	import type { CrossSiteSearchResult } from '$lib/types/aggregate-index-types.js';
	import { ArrowUpRight } from '@lucide/svelte';

	// ── Props ───────────────────────────────────────────────────────────────────

	interface Props {
		searchQuery: string;
		resultCount: number;
		isLoading: boolean;
	}

	let { searchQuery, resultCount = $bindable(0), isLoading = $bindable(false) }: Props = $props();

	// ── Cross-site search logic ─────────────────────────────────────────────────

	const config = $derived(getCrossSiteSearchConfig());
	const crossSiteEnabled = $derived(config.ENABLED);

	let crossSiteLoadStarted = false;
	let crossSiteLoading = $state(false);
	/** Set when no aggregate index was reachable and we crawled squig.link instead. */
	let usingSquiglinkFallback = $state(false);

	/**
	 * Loads the aggregate index. If every index URL fails, falls back to crawling
	 * each squig.link site's phone_book.json — but only on squig.link deployments,
	 * since that path depends on the squig.link site registry.
	 */
	async function loadCrossSiteData(): Promise<void> {
		crossSiteLoading = true;
		try {
			if (await aggregateIndexService.load()) return;

			if (!config.SQUIGLINK_FALLBACK || !squiglinkStore.isEnabled) return;
			usingSquiglinkFallback = true;
			await squiglinkStore.fetchSiteRegistry();
			await Promise.all(squiglinkStore.sites.map((site) => squiglinkStore.fetchPhoneBook(site)));
		} catch (e) {
			console.error('Failed to load cross-site data:', e);
		} finally {
			crossSiteLoading = false;
		}
	}

	// Keep the fallback store's query in sync — its results are a $derived of it
	$effect(() => {
		if (usingSquiglinkFallback) {
			squiglinkStore.searchQuery = searchQuery;
		}
	});

	// Trigger cross-site data load once when enabled and query is long enough
	$effect(() => {
		if (crossSiteEnabled && searchQuery.trim().length >= 2 && !crossSiteLoadStarted) {
			crossSiteLoadStarted = true;
			loadCrossSiteData();
		}
	});

	const hits = $derived.by(() => {
		if (!crossSiteEnabled || searchQuery.trim().length < 2) return { results: [], total: 0 };
		if (aggregateIndexService.isReady) return aggregateIndexService.search(searchQuery);

		const results = squiglinkStore.searchResults;
		return { results: results.slice(0, MAX_RESULTS), total: results.length };
	});

	const groupedCrossSite = $derived.by(() => {
		const map = new SvelteMap<string, CrossSiteSearchResult[]>();
		const seen = new SvelteSet<string>();
		for (const result of hits.results) {
			if (seen.has(result.url)) continue;
			seen.add(result.url);

			const existing = map.get(result.dbId);
			if (existing) {
				existing.push(result);
			} else {
				map.set(result.dbId, [result]);
			}
		}
		return map;
	});

	const showCrossSiteSection = $derived(crossSiteEnabled && searchQuery.trim().length >= 2);

	// Sync bindable props with internal state
	$effect(() => {
		resultCount = hits.results.length;
	});

	$effect(() => {
		isLoading = crossSiteLoading;
	});
</script>

{#if showCrossSiteSection}
	{#if crossSiteLoading && hits.results.length === 0}
		<p class="px-3 py-3 text-center text-[12px] text-base-content/60">
			{m.crosssite_search_loading()}
		</p>
	{/if}

	{#if hits.results.length > 0}
		{#each [...groupedCrossSite] as [dbId, results] (dbId)}
			<div class="flex items-center gap-1 border-b border-base-content/10 bg-base-300 px-3 py-1.5">
				<span class="mr-1.5 text-[12px] font-medium text-base-content">
					{results[0].siteName}
				</span>
				<span
					class="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-content"
				>
					{results[0].dbType}
				</span>
				{#if results[0].deltaReady}
					<span
						class="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-content"
					>
						Delta Ready
					</span>
				{/if}
			</div>

			{#each results as result (result.url)}
				<a
					href={result.url}
					target="_blank"
					rel="external noopener noreferrer"
					class="flex w-full cursor-pointer items-center gap-2 border-b border-base-content/10 px-3 py-1 text-left
						text-sm no-underline transition-colors hover:bg-base-300"
				>
					<ArrowUpRight class="h-4 w-4 text-base-content/80" aria-hidden="true" />
					<span class="min-w-0 flex-1 truncate">{result.brand} {result.phoneName}</span>
				</a>
			{/each}
		{/each}

		{#if hits.total > hits.results.length}
			<p class="px-3 py-2 text-center text-[11px] text-base-content/60">
				{m.crosssite_search_truncated({ count: hits.results.length, total: hits.total })}
			</p>
		{/if}
	{/if}
{/if}
