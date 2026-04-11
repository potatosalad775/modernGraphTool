<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { squiglinkStore } from '$lib/stores/squiglink-store.svelte.js';
	import { getConfigValue } from '$lib/utils/config.js';
	import type { CrossSiteSearchResult } from '$lib/types/squiglink-types.js';
	import { ArrowUpRight } from '@lucide/svelte';

	// ── Props ───────────────────────────────────────────────────────────────────

	interface Props {
		searchQuery: string;
		resultCount: number;
		isLoading: boolean;
	}

	let {
		searchQuery,
		resultCount = $bindable(0),
		isLoading = $bindable(false)
	}: Props = $props();

	// ── Cross-site search logic ─────────────────────────────────────────────────

	const crossSiteEnabled = $derived(
		squiglinkStore.isEnabled &&
			(getConfigValue('SQUIGLINK.ENABLE_CROSS_SITE_SEARCH') as boolean) !== false
	);

	let crossSiteLoadStarted = false;
	let crossSiteLoading = $state(false);

	async function loadCrossSiteData(): Promise<void> {
		crossSiteLoading = true;
		try {
			await squiglinkStore.fetchSiteRegistry();
			const sites = squiglinkStore.sites;
			// Fetch phone books in batches of 5
			for (let i = 0; i < sites.length; i += 5) {
				const batch = sites.slice(i, i + 5);
				await Promise.all(batch.map((site) => squiglinkStore.fetchPhoneBook(site)));
			}
		} catch (e) {
			console.error('Failed to load cross-site data:', e);
		} finally {
			crossSiteLoading = false;
		}
	}

	// Sync searchQuery to squiglinkStore when cross-site is enabled
	$effect(() => {
		if (crossSiteEnabled) {
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

	const crossSiteResults = $derived<CrossSiteSearchResult[]>(
		crossSiteEnabled && searchQuery.trim().length >= 2 ? squiglinkStore.searchResults : []
	);

	const groupedCrossSite = $derived.by(() => {
		const map = new SvelteMap<string, CrossSiteSearchResult[]>();
		const seen = new SvelteSet<string>();
		for (const result of crossSiteResults) {
			const dedupKey = result.siteUsername + '\0' + result.dbType + '\0' + result.brand + '\0' + result.phoneName;
			if (seen.has(dedupKey)) continue;
			seen.add(dedupKey);
			const groupKey = result.siteUsername + '\0' + result.dbType;
			const existing = map.get(groupKey);
			if (existing) {
				existing.push(result);
			} else {
				map.set(groupKey, [result]);
			}
		}
		return map;
	});

	const showCrossSiteSection = $derived(crossSiteEnabled && searchQuery.trim().length >= 2);

	// Sync bindable props with internal state
	$effect(() => {
		resultCount = crossSiteResults.length;
	});

	$effect(() => {
		isLoading = crossSiteLoading;
	});

	function getCrossSiteUrl(
		siteUrl: string, 
		brandName: string, 
		phoneName: string
	): string {
		return `${siteUrl}?share=${encodeURIComponent(
			`${brandName} ${phoneName}`.replace(/ /g, '_'))}`;
	}
</script>

{#if showCrossSiteSection}
	{#if crossSiteLoading && crossSiteResults.length === 0}
		<p class="px-3 py-3 text-center text-[12px] text-base-content/60">
			{m.crosssite_search_loading()}
		</p>
	{/if}

	{#if crossSiteResults.length > 0}
		{#each [...groupedCrossSite] as [siteUsername, results] (siteUsername + results[0].dbType)}
			<div class="flex gap-1 items-center px-3 py-1.5 bg-base-300 border-b border-base-content/10">
				<span class="text-[12px] mr-1.5 font-medium text-base-content">
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

			{#each results as result (result.siteUsername + result.dbType + result.brand + result.phoneName)}
				<a
					href={getCrossSiteUrl(result.siteUrl, result.brand, result.phoneName)}
					target="_blank"
					rel="external noopener noreferrer"
					class="flex w-full items-center gap-2 px-3 py-1 text-left text-sm transition-colors hover:bg-base-300
						border-b border-base-content/10 cursor-pointer no-underline"
				>
					<ArrowUpRight class="h-4 w-4 text-base-content/80" aria-hidden="true" />
					<span class="min-w-0 flex-1 truncate">{result.brand} {result.phoneName}</span>
				</a>
			{/each}
		{/each}
	{/if}
{/if}
