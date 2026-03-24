<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import * as m from '$lib/paraglide/messages';
	import { getConfigValue } from '$lib/utils/config';
	import { squiglinkStore } from '$lib/stores/squiglink-store.svelte';

	const enabled = $derived(
		squiglinkStore.isEnabled &&
			(getConfigValue('SQUIGLINK.ENABLE_CROSS_SITE_SEARCH') as boolean) !== false
	);

	let expanded = $state(false);
	let sitesLoadStarted = false;

	async function loadSiteData() {
		if (sitesLoadStarted) return;
		sitesLoadStarted = true;

		await squiglinkStore.fetchSiteRegistry();

		// Load phone books in batches of 5
		const sites = squiglinkStore.sites;
		for (let i = 0; i < sites.length; i += 5) {
			const batch = sites.slice(i, i + 5);
			await Promise.all(batch.map((site) => squiglinkStore.fetchPhoneBook(site)));
		}
	}

	function toggleExpanded() {
		expanded = !expanded;
		if (expanded) {
			loadSiteData();
		}
	}

	function openResult(siteUrl: string, phoneName: string) {
		const encoded = phoneName.replace(/ /g, '_');
		window.open(`${siteUrl}?share=${encodeURIComponent(encoded)}`, '_blank');
	}

	const groupedResults = $derived.by(() => {
		const results = squiglinkStore.searchResults;
		const groups = new SvelteMap<string, typeof results>();
		for (const r of results) {
			const existing = groups.get(r.siteUsername) ?? [];
			existing.push(r);
			groups.set(r.siteUsername, existing);
		}
		return groups;
	});
</script>

{#if enabled}
	<div class="border-t border-zinc-200 dark:border-zinc-700">
		<!-- Header -->
		<button
			type="button"
			onclick={toggleExpanded}
			class="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider
				text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
		>
			<span>{m.crosssite_search_title()}</span>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				class="h-4 w-4 transition-transform {expanded ? 'rotate-180' : ''}"
			>
				<path
					fill-rule="evenodd"
					d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
					clip-rule="evenodd"
				/>
			</svg>
		</button>

		{#if expanded}
			<!-- Search input -->
			<div class="px-3 pb-2">
				<input
					type="search"
					bind:value={squiglinkStore.searchQuery}
					placeholder={m.crosssite_search_placeholder()}
					class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900
						placeholder-zinc-400 focus:border-zinc-500 focus:outline-none
						dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
				/>
			</div>

			<!-- Results -->
			<div class="max-h-64 overflow-y-auto">
				{#if squiglinkStore.isLoading}
					<p class="px-3 py-3 text-xs text-zinc-400 dark:text-zinc-500">
						{m.crosssite_search_loading()}
					</p>
				{:else if squiglinkStore.searchQuery.trim().length >= 2 && groupedResults.size === 0}
					<p class="px-3 py-3 text-xs text-zinc-400 dark:text-zinc-500">
						{m.crosssite_search_no_results()}
					</p>
				{:else}
					{#each [...groupedResults] as [siteUsername, results] (siteUsername)}
						<div class="border-t border-zinc-100 dark:border-zinc-800">
							<div class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
								{results[0].siteName}
							</div>
							{#each results.slice(0, 20) as result (result.phoneName + result.siteUsername)}
								<button
									type="button"
									onclick={() => openResult(result.siteUrl, result.phoneName)}
									class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm
										text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
								>
									<span class="min-w-0 flex-1 truncate">{result.phoneName}</span>
									{#if result.dbType}
										<span
											class="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium
												text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
										>
											{result.dbType}
										</span>
									{/if}
								</button>
							{/each}
						</div>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
{/if}
