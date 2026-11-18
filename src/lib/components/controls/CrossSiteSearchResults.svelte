<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { aggregateIndexService } from '#lib/services/aggregate-index.svelte.js';
	import { dbTypeLabel, type CrossSiteSearchHits } from '#lib/services/aggregate-index-core.js';
	import type { CrossSiteSearchResult } from '#lib/types/aggregate-index-types.js';
	import { ArrowUpRight } from '@lucide/svelte';

	interface Props {
		/** Cross-site search is on and the query is long enough to search on. */
		active: boolean;
		hits: CrossSiteSearchHits;
		loading: boolean;
	}

	let { active, hits, loading }: Props = $props();

	let loadStarted = false;

	// The index is fetched once, on the first query that can be searched.
	$effect(() => {
		if (!active || loadStarted) return;
		loadStarted = true;
		aggregateIndexService.load().catch((e: unknown) => {
			console.error('Failed to load cross-site data:', e);
		});
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
</script>

{#if active}
	{#if loading && hits.results.length === 0}
		<p class="px-3 py-3 text-center text-xs text-base-content/80">
			{m.crosssite_search_loading()}
		</p>
	{/if}

	{#if hits.results.length > 0}
		{#each [...groupedCrossSite] as [dbId, results] (dbId)}
			<div class="flex items-center gap-1 border-b border-base-content/10 bg-base-300 px-3 py-1.5">
				<span class="mr-1.5 text-xs font-medium text-base-content">
					{results[0].siteName}
				</span>
				<span
					class="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-2xs font-medium text-primary-content"
				>
					{dbTypeLabel(results[0].dbType)}
				</span>
				{#if results[0].deltaReady}
					<span
						class="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-2xs font-medium text-secondary-content"
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
			<p class="px-3 py-2 text-center text-xs text-base-content/80">
				{m.crosssite_search_truncated({ count: hits.results.length, total: hits.total })}
			</p>
		{/if}
	{/if}
{/if}
