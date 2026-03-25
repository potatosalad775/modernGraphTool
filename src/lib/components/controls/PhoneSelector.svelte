<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { SvelteSet } from 'svelte/reactivity';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import MetadataParser from '$lib/utils/metadata-parser.js';
	import { getConfigValue } from '$lib/utils/config.js';
	import type { PhoneMetadata } from '$lib/types/data-types.js';

	// ── Config ──────────────────────────────────────────────────────────────────

	const allowRemovingPhone = (getConfigValue('INTERFACE.ALLOW_REMOVING_PHONE_FROM_SELECTOR') as boolean) ?? true;
	const switchPanelOnBrandClick = (getConfigValue('INTERFACE.SWITCH_PHONE_PANEL_ON_BRAND_CLICK') as boolean) ?? true;

	// ── State ───────────────────────────────────────────────────────────────────

	const selectedBrands = new SvelteSet<string>();
	let searchQuery = $state('');
	let showPhonePane = $state(true);
	const loadingIds = new SvelteSet<string>();

	// ── Derived ─────────────────────────────────────────────────────────────────

	// Full flat phone list, derived from MetadataParser (reactive once metadata loads)
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

	function toggleBrand(brand: string, checked: boolean) {
		if (checked) selectedBrands.add(brand);
		else selectedBrands.delete(brand);
		// Auto-switch to phone pane on brand click (mobile layout)
		if (switchPanelOnBrandClick && checked) showPhonePane = true;
	}

	function clearBrands() {
		selectedBrands.clear();
	}

	async function togglePhone(identifier: string, isLoaded: boolean, checked: boolean) {
		// Block removal if config disables it
		if (!checked && isLoaded && !allowRemovingPhone) return;
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
	<div
		class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 border-border"
	>
		<!-- Brands toggle (shown when container is narrow) -->
		<button
			onclick={() => (showPhonePane = false)}
			class="ps-nav-btn rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
				{!showPhonePane
				? 'bg-accent text-accent-foreground'
				: 'text-foreground-secondary hover:bg-surface-hover'}"
		>
			{m.phone_selector_header_brand_btn()}
		</button>

		<!-- Search -->
		<input
			type="search"
			bind:value={searchQuery}
			placeholder={m.phone_selector_header_search_bar_placeholder()}
			class="min-w-0 flex-1 rounded border border-input bg-surface-raised px-2 py-1 text-sm text-foreground
				placeholder-foreground-secondary focus:outline-none focus:ring-1 focus:ring-accent"
		/>

		<!-- Devices toggle (shown when container is narrow) -->
		<button
			onclick={() => (showPhonePane = true)}
			class="ps-nav-btn rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
				{showPhonePane
				? 'bg-accent text-accent-foreground'
				: 'text-foreground-secondary hover:bg-surface-hover'}"
		>
			{m.phone_selector_header_device_btn()}
		</button>
	</div>

	<!-- Panes -->
	<div class="relative min-h-0 flex-1">
		<div class="flex h-full flex-row">
			<!-- Brand list -->
			<div
				class="ps-brand-pane flex flex-col overflow-y-auto border-r border-border"
				class:ps-brand-hidden={showPhonePane}
			>
				{#each brandListData as brand (brand)}
					<label
						class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm
							hover:bg-surface-hover
							{selectedBrands.has(brand) ? 'font-semibold text-foreground' : 'text-foreground-secondary'}"
					>
						<input
							type="checkbox"
							checked={selectedBrands.has(brand)}
							onchange={(e) => toggleBrand(brand, e.currentTarget.checked)}
							class="accent-accent"
						/>
						<span class="truncate">{brand}</span>
					</label>
				{/each}
			</div>

			<!-- Phone list -->
			<div
				class="ps-phone-pane flex flex-col overflow-y-auto"
				class:ps-phone-hidden={!showPhonePane}
			>
				{#if displayPhones.length === 0}
					<p class="px-3 py-6 text-center text-xs text-muted">
						{searchQuery.trim() ? 'No results.' : 'No devices.'}
					</p>
				{/if}

				{#each displayPhones as phone (phone.identifier)}
					{@const isLoaded = loadedIds.has(phone.identifier)}
					{@const isLoading = loadingIds.has(phone.identifier)}
					<div
						class="flex flex-col border-b border-border-muted px-3 py-1.5-muted
							{isLoaded ? 'bg-surface-hover/40' : ''}"
					>
						<label class="flex cursor-pointer items-start gap-2">
							<input
								type="checkbox"
								checked={isLoaded}
								disabled={isLoading || (isLoaded && !allowRemovingPhone)}
								onchange={(e) => togglePhone(phone.identifier, isLoaded, e.currentTarget.checked)}
								class="mt-0.5 shrink-0 accent-accent"
							/>
							<div class="flex min-w-0 flex-1 flex-col">
								<span
									class="truncate text-sm leading-snug
										{isLoaded
										? 'font-medium text-foreground'
										: 'text-foreground-secondary'}
										{isLoading ? 'opacity-50' : ''}"
								>
									{phone.identifier}
								</span>

								<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
									<!-- Score stars -->
									{#if phone.reviewScore !== undefined}
										<span class="text-xs text-rating" title="Score: {phone.reviewScore}">
											{renderStars(phone.reviewScore)}
										</span>
									{/if}

									<!-- Price -->
									{#if phone.price}
										<span class="text-xs text-muted">{phone.price}</span>
									{/if}

									<!-- Review link -->
									{#if phone.reviewLink}
										<a
											href={phone.reviewLink}
											target="_blank"
											rel="noopener noreferrer"
											onclick={(e) => e.stopPropagation()}
											class="text-xs text-link hover:underline"
										>
											{m.phone_selector_item_review()}
										</a>
									{/if}

									<!-- Shop link -->
									{#if phone.shopLink}
										<a
											href={phone.shopLink}
											target="_blank"
											rel="noopener noreferrer"
											onclick={(e) => e.stopPropagation()}
											class="text-xs text-link hover:underline"
										>
											{m.phone_selector_item_shop()}
										</a>
									{/if}
								</div>
							</div>

							<!-- Loading spinner -->
							{#if isLoading}
								<span class="mt-0.5 shrink-0 animate-spin text-xs text-muted">⟳</span>
							{/if}
						</label>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- Clear brands button -->
	{#if selectedBrands.size > 0}
		<div class="shrink-0 border-t border-border p-2 border-border">
			<button
				onclick={clearBrands}
				class="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors
					hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
