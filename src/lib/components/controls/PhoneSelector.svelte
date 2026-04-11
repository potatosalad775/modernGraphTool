<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { SvelteSet } from 'svelte/reactivity';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import MetadataParser from '$lib/utils/metadata-parser.js';
	import { getConfigValue } from '$lib/utils/config.js';
	import type { PhoneMetadata } from '$lib/types/data-types.js';
	import Button from '../atoms/Button.svelte';
	import Input from '../atoms/Input.svelte';
	import CrossSiteSearchResults from './CrossSiteSearchResults.svelte';
	import { Search, X } from '@lucide/svelte';

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

	// ── Cross-site search (delegated to CrossSiteSearchResults) ─────────────────

	let crossSiteResultCount = $state(0);
	let crossSiteIsLoading = $state(false);

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

	function renderScore(score: number | string): string {
		const num = typeof score === 'number' ? score : parseFloat(score);
		if (isNaN(num)) return String(score);
		const clamped = Math.max(0, Math.min(5, num));
		const full = Math.floor(clamped);
		const half = clamped % 1 >= 0.5 ? 1 : 0;
		const empty = 5 - full - half;
		return '★'.repeat(full) + (half ? '⭐' : '') + '☆'.repeat(empty);
	}
</script>

<div class="flex h-full flex-col overflow-hidden" style="container-type: inline-size;">
	<!-- Header -->
	<div class="flex shrink-0 items-center gap-2 border-b border-base-content/15 px-1.5 py-1.5">
		<!-- Brands toggle (shown when container is narrow) -->
		{#if showPhonePane}
			<div class="ps-nav-btn">
				<Button
					title={m.phone_selector_header_brand_btn()}
					onclick={() => (showPhonePane = false)}
					variant="primary"
				>
					{m.phone_selector_header_brand_btn()}
				</Button>
			</div>
		{/if}

		<!-- Search -->
		<Input
			type="search"
			bind:value={searchQuery}
			placeholder={m.phone_selector_header_search_bar_placeholder()}
			class="flex-1"
		>
			{#snippet icon()}
				<Search class="h-4 w-4 text-base-content/60" aria-hidden="true" />
			{/snippet}
		</Input>

		<!-- Devices toggle (shown when container is narrow) -->
		{#if !showPhonePane}
			<div class="ps-nav-btn">
				<Button
					title={m.phone_selector_header_device_btn()}
					onclick={() => (showPhonePane = true)}
					variant="primary"
				>
					{m.phone_selector_header_device_btn()}
				</Button>
			</div>
		{/if}
	</div>

	<!-- Clear brands button -->
	{#if selectedBrands.size > 0}
		<div class="shrink-0 p-2">
			<Button
				title={m.phone_selector_clear_brands_btn()}
				onclick={clearBrands}
				variant="secondary"
				class="w-full gap-2"
			>
				<X class="h-4 w-4" aria-hidden="true" />
				{m.phone_selector_clear_brands_btn()}
			</Button>
		</div>
	{/if}

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
							: ' hover:bg-base-300'}"
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
				<!-- Empty state -->
				{#if displayPhones.length === 0 && crossSiteResultCount === 0 && !crossSiteIsLoading}
					<p class="px-3 py-6 text-center text-xs text-base-content/60">
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
							class="flex flex-col w-full min-h-8 items-start gap-1 px-3 py-1.5 text-left text-sm transition-colors
								{isLoaded
								? 'font-medium text-base-content'
								: ' hover:bg-base-300'}
								{isLoading ? 'opacity-50' : ''}
								cursor-pointer disabled:cursor-default"
						>
							<span class="min-w-0 flex-1 truncate leading-snug">
								{phone.identifier}
							</span>

							{#if phone.description}
								<span class="min-w-0 self-stretch text-xs text-base-content/60 leading-snug
									{isLoaded ? 'line-clamp-3' : 'line-clamp-1 truncate'}"
									title={phone.description}
								>
									{phone.description}
								</span>
							{/if}

							{#if isLoaded && (phone.reviewScore !== undefined || phone.price || phone.reviewLink || phone.shopLink)}
								<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
									{#if phone.reviewScore !== undefined}
										<span class="text-xs text-warning" title="Score: {phone.reviewScore}">
											{renderScore(phone.reviewScore)}
										</span>
									{/if}

									{#if phone.price}
										<span class="text-xs text-base-content/60">{phone.price}</span>
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
						</button>
					</div>
				{/each}

				<!-- Cross-site search results -->
				<CrossSiteSearchResults
					{searchQuery}
					bind:resultCount={crossSiteResultCount}
					bind:isLoading={crossSiteIsLoading}
				/>

				<!-- Divider between cross-site and local results -->
				{#if crossSiteResultCount > 0 && displayPhones.length > 0}
					<div class="mx-3 my-1 border-t border-base-content/15"></div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	/* Wide container: show both panes side-by-side, hide nav buttons */
	@container (min-width: 500px) {
		.ps-nav-btn {
			display: none;
		}
		.ps-brand-pane {
			display: flex !important;
			width: 40%;
			min-width: 10rem;
			max-width: 15rem;
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
