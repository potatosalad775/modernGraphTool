<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import { squiglinkStore } from '$lib/stores/squiglink-store.svelte.js';
	import MetadataParser from '$lib/utils/metadata-parser.js';
	import { getConfigValue } from '$lib/utils/config.js';
	import type { PhoneMetadata } from '$lib/types/data-types.js';
	import type { CrossSiteSearchResult } from '$lib/types/squiglink-types.js';

	// ── Config ──────────────────────────────────────────────────────────────────

	const allowRemovingPhone =
		(getConfigValue('INTERFACE.ALLOW_REMOVING_PHONE_FROM_SELECTOR') as boolean) ?? true;
	const switchPanelOnBrandClick =
		(getConfigValue('INTERFACE.SWITCH_PHONE_PANEL_ON_BRAND_CLICK') as boolean) ?? true;

	// ── State ───────────────────────────────────────────────────────────────────

	const selectedBrands = new SvelteSet<string>();
	let searchQuery = $state('');
	let showPhonePane = $state(true);
	const loadingIds = new SvelteSet<string>();

	// ── Cross-site search state ─────────────────────────────────────────────────

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
		for (const result of crossSiteResults) {
			const existing = map.get(result.siteUsername);
			if (existing) {
				existing.push(result);
			} else {
				map.set(result.siteUsername, [result]);
			}
		}
		return map;
	});

	const showCrossSiteSection = $derived(
		crossSiteEnabled && searchQuery.trim().length >= 2
	);

	function openCrossSiteResult(siteUrl: string, phoneName: string): void {
		window.open(
			`${siteUrl}?share=${encodeURIComponent(phoneName.replace(/ /g, '_'))}`,
			'_blank'
		);
	}

	// ── Derived ─────────────────────────────────────────────────────────────────

	const fullPhoneList = $derived.by((): (PhoneMetadata & { brand: string })[] => {
		if (!MetadataParser.phoneMetadata) return [];
		return MetadataParser.phoneMetadata.flatMap((b) =>
			b.phones.map((p) => ({ ...p, brand: b.brand }))
		);
	});

	const brandListData = $derived.by((): string[] => {
		if (!MetadataParser.phoneMetadata) return [];
		return MetadataParser.phoneMetadata.map((b) => b.brand);
	});

	const loadedIds = $derived(new Set([...frStore.entries.values()].map((e) => e.identifier)));

	const displayPhones = $derived.by((): (PhoneMetadata & { brand: string })[] => {
		let list =
			selectedBrands.size > 0
				? fullPhoneList.filter((p) => selectedBrands.has(p.brand))
				: fullPhoneList;
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			list = list.filter((p) => p.identifier.toLowerCase().includes(q));
		}
		return list;
	});

	// ── Helpers ─────────────────────────────────────────────────────────────────

	function toggleBrand(brand: string): void {
		if (selectedBrands.has(brand)) {
			selectedBrands.delete(brand);
		} else {
			selectedBrands.add(brand);
			if (switchPanelOnBrandClick) showPhonePane = true;
		}
	}

	function clearBrands(): void {
		selectedBrands.clear();
	}

	async function togglePhone(identifier: string, isLoaded: boolean): Promise<void> {
		const checked = !isLoaded;
		if (!checked && !allowRemovingPhone) return;
		if (loadingIds.has(identifier)) return;
		loadingIds.add(identifier);
		try {
			await dataProvider.toggleFRData('phone', identifier, checked);
		} catch (e) {
			console.error(e);
		} finally {
			loadingIds.delete(identifier);
		}
	}

	function renderStars(score: number): string {
		const full = Math.floor(score);
		const half = score % 1 >= 0.5 ? 1 : 0;
		const empty = 5 - full - half;
		return '★'.repeat(full) + (half ? '⭐' : '') + '☆'.repeat(empty);
	}
</script>

<div class="flex h-full flex-col overflow-hidden" style="container-type: inline-size;">
	<!-- Header -->
	<div class="flex shrink-0 items-center gap-2 border-b border-base-content/15 px-3 py-1.5">
		<!-- Brands toggle (shown when container is narrow) -->
		<button
			onclick={() => (showPhonePane = false)}
			class="ps-nav-btn rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
				{!showPhonePane
				? 'bg-accent text-accent-content'
				: 'text-base-content/60 hover:bg-base-300'}"
		>
			{m.phone_selector_header_brand_btn()}
		</button>

		<!-- Search -->
		<input
			type="search"
			bind:value={searchQuery}
			placeholder={m.phone_selector_header_search_bar_placeholder()}
			class="min-w-0 flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-sm text-base-content
				placeholder-foreground-secondary focus:outline-none focus:ring-1 focus:ring-accent"
		/>

		<!-- Devices toggle (shown when container is narrow) -->
		<button
			onclick={() => (showPhonePane = true)}
			class="ps-nav-btn rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
				{showPhonePane
				? 'bg-accent text-accent-content'
				: 'text-base-content/60 hover:bg-base-300'}"
		>
			{m.phone_selector_header_device_btn()}
		</button>
	</div>

	<!-- Panes -->
	<div class="relative min-h-0 flex-1">
		<div class="flex h-full flex-row">
			<!-- Brand list -->
			<div
				class="ps-brand-pane flex flex-col overflow-y-auto border-r border-base-content/15"
				class:ps-brand-hidden={showPhonePane}
			>
				{#each brandListData as brand (brand)}
					<button
						onclick={() => toggleBrand(brand)}
						class="flex w-full cursor-pointer items-center px-3 py-1.5 text-left text-sm transition-colors
							{selectedBrands.has(brand)
							? 'bg-accent/12 font-medium text-accent'
							: 'text-base-content/60 hover:bg-base-300'}"
					>
						<span class="truncate">{brand}</span>
					</button>
				{/each}
			</div>

			<!-- Phone list -->
			<div
				class="ps-phone-pane flex flex-col overflow-y-auto"
				class:ps-phone-hidden={!showPhonePane}
			>
				<!-- Cross-site search results -->
				{#if showCrossSiteSection}
					{#if crossSiteLoading && crossSiteResults.length === 0}
						<p class="px-3 py-3 text-center text-xs text-base-content/45">
							{m.crosssite_search_loading()}
						</p>
					{/if}

					{#if crossSiteResults.length > 0}
						<div class="px-3 pb-1 pt-2">
							<span class="text-[10px] font-semibold uppercase tracking-wider text-base-content/45">
								{m.crosssite_search_title()}
							</span>
						</div>

						{#each [...groupedCrossSite] as [siteUsername, results] (siteUsername)}
							<div class="px-3 pb-0.5 pt-1.5">
								<span class="text-[10px] font-medium text-base-content/45">
									{results[0].siteName}
								</span>
							</div>

							{#each results.slice(0, 10) as result (result.siteUsername + result.phoneName)}
								<button
									onclick={() => openCrossSiteResult(result.siteUrl, result.phoneName)}
									class="flex w-full items-center gap-2 px-3 py-1 text-left text-sm text-base-content/60 transition-colors hover:bg-base-300"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 20 20"
										fill="currentColor"
										class="h-3.5 w-3.5 shrink-0 text-base-content/45"
									>
										<path
											fill-rule="evenodd"
											d="M5.22 14.78a.75.75 0 0 0 1.06 0l7.22-7.22v5.69a.75.75 0 0 0 1.5 0v-7.5a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0 0 1.5h5.69l-7.22 7.22a.75.75 0 0 0 0 1.06Z"
											clip-rule="evenodd"
										/>
									</svg>
									<span class="min-w-0 flex-1 truncate">{result.phoneName}</span>
									<span
										class="shrink-0 rounded-full bg-base-300 px-1.5 py-0.5 text-[10px] font-medium text-base-content/45"
									>
										{result.dbType}
									</span>
								</button>
							{/each}
						{/each}

						<!-- Divider between cross-site and local results -->
						{#if displayPhones.length > 0}
							<div class="mx-3 my-1 border-t border-base-content/15"></div>
						{/if}
					{/if}
				{/if}

				<!-- Empty state -->
				{#if displayPhones.length === 0 && crossSiteResults.length === 0 && !crossSiteLoading}
					<p class="px-3 py-6 text-center text-xs text-base-content/45">
						{searchQuery.trim() ? 'No results.' : 'No devices.'}
					</p>
				{/if}

				<!-- Local phone results -->
				{#each displayPhones as phone (phone.identifier)}
					{@const isLoaded = loadedIds.has(phone.identifier)}
					{@const isLoading = loadingIds.has(phone.identifier)}
					<div
						class="border-b border-base-content/8
							{isLoaded ? 'border-l-2 border-l-accent bg-accent/8' : ''}"
					>
						<button
							onclick={() => togglePhone(phone.identifier, isLoaded)}
							disabled={isLoading || (isLoaded && !allowRemovingPhone)}
							class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors
								{isLoaded
								? 'font-medium text-base-content'
								: 'text-base-content/60 hover:bg-base-300'}
								{isLoading ? 'opacity-50' : ''}
								disabled:cursor-default"
						>
							<span class="min-w-0 flex-1 truncate leading-snug">
								{phone.identifier}
							</span>

							{#if isLoading}
								<span class="shrink-0 animate-spin text-xs text-base-content/45">&#10227;</span>
							{/if}
						</button>

						{#if isLoaded}
							<div class="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-1.5">
								{#if phone.reviewScore !== undefined}
									<span class="text-xs text-warning" title="Score: {phone.reviewScore}">
										{renderStars(phone.reviewScore)}
									</span>
								{/if}

								{#if phone.price}
									<span class="text-xs text-base-content/45">{phone.price}</span>
								{/if}

								{#if phone.reviewLink}
									<a
										href={phone.reviewLink}
										target="_blank"
										rel="external noopener noreferrer"
										class="text-xs text-info hover:underline"
									>
										{m.phone_selector_item_review()}
									</a>
								{/if}

								{#if phone.shopLink}
									<a
										href={phone.shopLink}
										target="_blank"
										rel="external noopener noreferrer"
										class="text-xs text-info hover:underline"
									>
										{m.phone_selector_item_shop()}
									</a>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- Clear brands button -->
	{#if selectedBrands.size > 0}
		<div class="shrink-0 border-t border-base-content/15 p-2">
			<button
				onclick={clearBrands}
				class="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-content transition-colors
					hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
			>
				{m.phone_selector_clear_brands_btn()}
			</button>
		</div>
	{/if}
</div>

<style>
	/* Wide container: show both panes side-by-side, hide nav buttons */
	@container (min-width: 500px) {
		.ps-nav-btn {
			display: none;
		}
		.ps-brand-pane {
			display: flex !important;
			width: 10rem;
			flex-shrink: 0;
		}
		.ps-phone-pane {
			display: flex !important;
			flex: 1;
		}
	}

	/* Narrow container: toggle between panes with nav buttons */
	@container (max-width: 499px) {
		.ps-nav-btn {
			display: inline-flex;
		}
		.ps-brand-pane {
			width: 100%;
		}
		.ps-brand-hidden {
			display: none;
		}
		.ps-phone-pane {
			width: 100%;
		}
		.ps-phone-hidden {
			display: none;
		}
	}
</style>
