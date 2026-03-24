<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { SvelteSet } from 'svelte/reactivity';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import MetadataParser from '$lib/utils/metadata-parser.js';
	import type { PhoneMetadata } from '$lib/types/data-types.js';

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
	}

	function clearBrands() {
		selectedBrands.clear();
	}

	async function togglePhone(identifier: string, checked: boolean) {
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

<div class="flex h-full flex-col overflow-hidden">
	<!-- Header -->
	<div
		class="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-2 py-1.5 dark:border-zinc-700"
	>
		<!-- Mobile: Brands toggle -->
		<button
			onclick={() => (showPhonePane = false)}
			class="rounded px-2 py-1 text-xs font-medium transition-colors
				{!showPhonePane
				? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
				: 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}
				md:hidden"
		>
			{m.phone_selector_header_brand_btn()}
		</button>

		<!-- Search -->
		<input
			type="search"
			bind:value={searchQuery}
			placeholder={m.phone_selector_header_search_bar_placeholder()}
			class="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900
				placeholder-zinc-400 focus:border-zinc-500 focus:outline-none
				dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
		/>

		<!-- Mobile: Devices toggle -->
		<button
			onclick={() => (showPhonePane = true)}
			class="rounded px-2 py-1 text-xs font-medium transition-colors
				{showPhonePane
				? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
				: 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}
				md:hidden"
		>
			{m.phone_selector_header_device_btn()}
		</button>
	</div>

	<!-- Panes -->
	<div class="relative min-h-0 flex-1">
		<div class="flex h-full flex-row">
			<!-- Brand list -->
			<div
				class="flex flex-col overflow-y-auto border-r border-zinc-200 dark:border-zinc-700
					{showPhonePane ? 'hidden' : 'flex'} w-full
					md:flex md:w-40 md:shrink-0"
			>
				{#each brandListData as brand (brand)}
					<label
						class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm
							hover:bg-zinc-100 dark:hover:bg-zinc-800
							{selectedBrands.has(brand) ? 'font-semibold text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300'}"
					>
						<input
							type="checkbox"
							checked={selectedBrands.has(brand)}
							onchange={(e) => toggleBrand(brand, e.currentTarget.checked)}
							class="accent-zinc-700 dark:accent-zinc-300"
						/>
						<span class="truncate">{brand}</span>
					</label>
				{/each}
			</div>

			<!-- Phone list -->
			<div
				class="flex flex-col overflow-y-auto
					{showPhonePane ? 'flex' : 'hidden'} w-full
					md:flex md:flex-1"
			>
				{#if displayPhones.length === 0}
					<p class="px-3 py-4 text-xs text-zinc-400 dark:text-zinc-600">
						{searchQuery.trim() ? 'No results.' : 'No devices.'}
					</p>
				{/if}

				{#each displayPhones as phone (phone.identifier)}
					{@const isLoaded = loadedIds.has(phone.identifier)}
					{@const isLoading = loadingIds.has(phone.identifier)}
					<div
						class="flex flex-col border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800
							{isLoaded ? 'bg-zinc-50 dark:bg-zinc-800/40' : ''}"
					>
						<label class="flex cursor-pointer items-start gap-2">
							<input
								type="checkbox"
								checked={isLoaded}
								disabled={isLoading}
								onchange={(e) => togglePhone(phone.identifier, e.currentTarget.checked)}
								class="mt-0.5 shrink-0 accent-zinc-700 dark:accent-zinc-300"
							/>
							<div class="flex min-w-0 flex-1 flex-col">
								<span
									class="truncate text-sm leading-snug
										{isLoaded
										? 'font-medium text-zinc-900 dark:text-zinc-100'
										: 'text-zinc-700 dark:text-zinc-300'}
										{isLoading ? 'opacity-50' : ''}"
								>
									{phone.identifier}
								</span>

								<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
									<!-- Score stars -->
									{#if phone.reviewScore !== undefined}
										<span class="text-xs text-amber-500" title="Score: {phone.reviewScore}">
											{renderStars(phone.reviewScore)}
										</span>
									{/if}

									<!-- Price -->
									{#if phone.price}
										<span class="text-xs text-zinc-500 dark:text-zinc-400">{phone.price}</span>
									{/if}

									<!-- Review link -->
									{#if phone.reviewLink}
										<a
											href={phone.reviewLink}
											target="_blank"
											rel="noopener noreferrer"
											onclick={(e) => e.stopPropagation()}
											class="text-xs text-blue-600 hover:underline dark:text-blue-400"
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
											class="text-xs text-blue-600 hover:underline dark:text-blue-400"
										>
											{m.phone_selector_item_shop()}
										</a>
									{/if}
								</div>
							</div>

							<!-- Loading spinner -->
							{#if isLoading}
								<span class="mt-0.5 shrink-0 animate-spin text-xs text-zinc-400">⟳</span>
							{/if}
						</label>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- Clear brands button -->
	{#if selectedBrands.size > 0}
		<div class="shrink-0 border-t border-zinc-200 p-2 dark:border-zinc-700">
			<button
				onclick={clearBrands}
				class="w-full rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white
					hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-300"
			>
				{m.phone_selector_clear_brands_btn()}
			</button>
		</div>
	{/if}
</div>
