<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { SvelteSet } from 'svelte/reactivity';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import MetadataParser from '$lib/utils/metadata-parser.js';
	import { getConfigValue } from '$lib/utils/config.js';
	import { buildRankingUrl } from '$lib/utils/url-template.js';
	import { sanitizeHtml, stripHtml } from '$lib/utils/html-sanitizer.js';
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
	const rankingUrlTemplate = (getConfigValue('RANKING_URL') as string) ?? '';

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

	// ── Pinned devices ──────────────────────────────────────────────────────────
	// The panel unmounts on every panel switch, so the list is rebuilt scrolled to
	// the top and an already-selected device can sit hundreds of rows down. Float
	// whatever was loaded when the panel opened to the head of the list instead.
	//
	// The snapshot is taken once and then frozen: re-sorting under the cursor as
	// rows are selected costs more than the scrolling it saves. It is deliberately
	// not seeded from an empty `loadedIds` — on a `?share=` boot the devices arrive
	// a tick after mount, and freezing before then would pin nothing.
	let pinnedIds = $state.raw<ReadonlySet<string>>(new Set());
	let pinsFrozen = false;

	$effect(() => {
		if (pinsFrozen) return;
		const ids = loadedIds;
		if (ids.size === 0) return;
		pinnedIds = ids;
		pinsFrozen = true;
	});

	const displayPhones = $derived.by((): (PhoneMetadata & { brand: string })[] => {
		let list =
			selectedBrands.size > 0
				? fullPhoneList.filter((p) => selectedBrands.has(p.brand))
				: fullPhoneList;
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			list = list.filter((p) => p.identifier.toLowerCase().includes(q));
		}
		if (pinnedIds.size === 0) return list;
		// Sort is stable, so both groups keep their phone_book.json order.
		return [...list].sort(
			(a, b) => Number(pinnedIds.has(b.identifier)) - Number(pinnedIds.has(a.identifier))
		);
	});

	/** Pinned rows are sorted to the front, so this doubles as the divider index. */
	const pinnedCount = $derived(
		pinnedIds.size === 0 ? 0 : displayPhones.filter((p) => pinnedIds.has(p.identifier)).length
	);

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

	/**
	 * Row clicks toggle the device — except on a link. The review / shop /
	 * operator links and any anchor inside an HTML description all live inside
	 * the row button, so guarding here covers every one of them at once (and
	 * covers Enter on a focused link, which dispatches a click too).
	 */
	function onRowClick(event: MouseEvent, identifier: string, isLoaded: boolean): void {
		if ((event.target as Element | null)?.closest('a')) return;
		togglePhone(identifier, isLoaded);
	}

	async function togglePhone(identifier: string, isLoaded: boolean): Promise<void> {
		// Whatever the list looks like now is what the user is aiming at — hold it.
		pinsFrozen = true;
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
	<div
		class="flex shrink-0 items-center gap-2 border-b border-base-content/15 bg-base-200 px-1.5 py-1.5"
	>
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
			class="flex-1 bg-base-100"
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
		<div class="shrink-0 p-1.5">
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
						class="flex w-full cursor-pointer items-center border-b border-base-content/8 px-3 py-1.5 text-left text-sm transition-colors
							{selectedBrands.has(brand)
							? 'border-l-2 border-l-accent bg-accent/8 font-medium text-accent'
							: 'hover:bg-base-300'}"
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
				{#each displayPhones as phone, i (phone.identifier)}
					{@const isLoaded = loadedIds.has(phone.identifier)}
					{@const isLoading = loadingIds.has(phone.identifier)}
					<!-- Last row of the pinned block carries the divider — but not when the
					     whole visible list is pinned, since there is nothing to divide from. -->
					{@const isPinBoundary = i === pinnedCount - 1 && pinnedCount < displayPhones.length}
					<div
						class="{isPinBoundary
							? 'border-b-2 border-b-base-content/30'
							: 'border-b border-base-content/8'}
							{isLoaded ? 'border-l-2 border-l-accent bg-accent/8' : ''}"
					>
						<button
							onclick={(e) => onRowClick(e, phone.identifier, isLoaded)}
							disabled={isLoading || (isLoaded && !allowRemovingPhone)}
							class="flex min-h-8 w-full flex-col items-start gap-1 px-3 py-1.5 text-left text-sm transition-colors
								{isLoaded ? 'font-medium text-base-content' : ' hover:bg-base-300'}
								{isLoading ? 'opacity-50' : ''}
								cursor-pointer disabled:cursor-default"
						>
							<span class="min-w-0 flex-1 truncate leading-snug">
								{phone.identifier}
							</span>

							{#if phone.description}
								<!-- Operator-authored, so a small inline HTML subset is honored. The
								     sanitizer drops everything else; `title` gets the flattened text
								     because a tooltip would otherwise show raw markup. -->
								<span
									class="ps-description min-w-0 self-stretch text-xs leading-snug text-base-content/60
									{isLoaded ? 'line-clamp-3' : 'line-clamp-1 truncate'}"
									title={stripHtml(phone.description)}
								>
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html sanitizeHtml(phone.description)}
								</span>
							{/if}

							{#if isLoaded && (phone.reviewScore !== undefined || phone.price || phone.reviewLink || phone.shopLink || phone.links?.length)}
								<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
									{#if phone.reviewScore !== undefined}
										{@const rankingHref = buildRankingUrl(rankingUrlTemplate, {
											type: 'earphone',
											brand: phone.brand,
											model: phone.name
										})}
										{#if rankingHref}
											<a
												href={rankingHref}
												target="_blank"
												rel="external noopener noreferrer"
												class="text-xs text-warning hover:underline"
												title="Score: {phone.reviewScore}"
											>
												{renderScore(phone.reviewScore)}
											</a>
										{:else}
											<span class="text-xs text-warning" title="Score: {phone.reviewScore}">
												{renderScore(phone.reviewScore)}
											</span>
										{/if}
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

									<!-- Operator-defined extras — several shops, a manufacturer page,
									     a measurement note. Labels come from phone_book.json as-is. -->
									{#each phone.links ?? [] as link, i (link.url + ' ' + link.label + i)}
										<a
											href={link.url}
											target="_blank"
											rel="external noopener noreferrer"
											class="text-xs text-info hover:underline"
										>
											{link.label}
										</a>
									{/each}
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
	/* Links inside an HTML description are injected via {@html}, so they carry no
	   Tailwind classes — style them here to match the review / shop links. */
	.ps-description :global(a) {
		color: var(--color-info);
	}
	.ps-description :global(a:hover) {
		text-decoration: underline;
	}

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
