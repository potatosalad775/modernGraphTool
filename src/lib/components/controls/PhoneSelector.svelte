<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { frStore } from '#lib/stores/fr-store.svelte.js';
	import { dataProvider } from '#lib/services/data-provider.svelte.js';
	import MetadataParser from '#lib/utils/metadata-parser.js';
	import { getConfigValue } from '#lib/utils/config.js';
	import { buildRankingUrl } from '#lib/utils/url-template.js';
	import { sanitizeHtml, stripHtml } from '#lib/utils/html-sanitizer.js';
	import { matchesQueryGroup, splitQueryGroups } from '#lib/utils/search-query.js';
	import { rankingService } from '#lib/services/ranking-service.svelte.js';
	import {
		getRankingSettings,
		resolveRankDisplay,
		type RankDisplay
	} from '#lib/services/ranking-core.js';
	import type { PhoneMetadata } from '#lib/types/data-types.js';
	import Button from '../atoms/Button.svelte';
	import Input from '../atoms/Input.svelte';
	import PopoverPanel from '../atoms/PopoverPanel.svelte';
	import CrossSiteSearchResults from './CrossSiteSearchResults.svelte';
	import { getCrossSiteSearchConfig } from '#lib/services/aggregate-index-core.js';
	import { Info, Search, X } from '@lucide/svelte';

	// ── Config ──────────────────────────────────────────────────────────────────

	const allowRemovingPhone =
		(getConfigValue('INTERFACE.ALLOW_REMOVING_PHONE_FROM_SELECTOR') as boolean) ?? true;
	const switchPanelOnBrandClick =
		(getConfigValue('INTERFACE.SWITCH_PHONE_PANEL_ON_BRAND_CLICK') as boolean) ?? true;
	const ranking = getRankingSettings();
	// The comma hint promises a cross-site behaviour, so only offer it where
	// cross-site results can actually appear.
	const crossSiteEnabled = getCrossSiteSearchConfig().ENABLED;

	// ── State ───────────────────────────────────────────────────────────────────

	// Prefixes the ids that tie a row's button to its description.
	const uid = $props.id();

	const selectedBrands = new SvelteSet<string>();
	let searchQuery = $state('');
	let showPhonePane = $state(true);
	const loadingIds = new SvelteSet<string>();

	// ── Cross-site search (delegated to CrossSiteSearchResults) ─────────────────

	let crossSiteResultCount = $state(0);
	let crossSiteIsLoading = $state(false);

	// ── Derived ─────────────────────────────────────────────────────────────────

	/**
	 * A device as the list uses it: the book entry plus what is derived from it once
	 * rather than on every keystroke or row render. Kept off `PhoneMetadata`, which is
	 * what `phone_book.json` parses into.
	 */
	type PhoneRow = PhoneMetadata & {
		brand: string;
		/** `identifier`, lowercased: what a query is matched against. */
		searchKey: string;
		/** The sanitised description markup and its flattened text (the tooltip). */
		descHtml: string;
		descText: string;
	};

	const phoneIndex = $derived.by((): { brand: string; rows: PhoneRow[] }[] => {
		if (!MetadataParser.phoneMetadata) return [];
		return MetadataParser.phoneMetadata.map((b) => ({
			brand: b.brand,
			rows: b.phones.map((p) => ({
				...p,
				brand: b.brand,
				searchKey: p.identifier.toLowerCase(),
				descHtml: p.description ? sanitizeHtml(p.description) : '',
				descText: p.description ? stripHtml(p.description) : ''
			}))
		}));
	});

	const fullPhoneList = $derived(phoneIndex.flatMap((b) => b.rows));

	// The list follows the field a moment behind, so a keystroke repaints the input
	// first and the filter plus up to ~1500 rows only once typing pauses. Everything
	// the query decides (rows, brands, the empty state, the announced count) reads
	// `listQuery`; only the field itself is bound to `searchQuery`.
	const LIST_DEBOUNCE_MS = 80;
	let listQuery = $state('');

	$effect(() => {
		const query = searchQuery;
		const timer = setTimeout(() => (listQuery = query), LIST_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	});

	// `A,B` is an *and* across databases, but a single device can only ever be
	// one of them — so locally the terms union instead, putting both sides of
	// the comparison the query describes in front of the user at once. `//`
	// alternatives are an *or* already, so every term simply joins the union.
	// A group's `-word` exclusions apply to that group's terms only.
	const queryGroups = $derived(splitQueryGroups(listQuery));

	function matchesQuery(searchKey: string): boolean {
		return queryGroups.some((group) => matchesQueryGroup(searchKey, group));
	}

	/**
	 * Brands with at least one device the search matches. A selected brand stays
	 * listed even with no match, or its filter would keep applying with no way to
	 * see or clear it short of "Clear brands".
	 */
	const brandListData = $derived.by((): string[] => {
		if (queryGroups.length === 0) return phoneIndex.map((b) => b.brand);
		return phoneIndex
			.filter((b) => selectedBrands.has(b.brand) || b.rows.some((p) => matchesQuery(p.searchKey)))
			.map((b) => b.brand);
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

	const displayPhones = $derived.by((): PhoneRow[] => {
		let list =
			selectedBrands.size > 0
				? fullPhoneList.filter((p) => selectedBrands.has(p.brand))
				: fullPhoneList;
		if (queryGroups.length > 0) list = list.filter((p) => matchesQuery(p.searchKey));
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

	// ── Result count announcement ───────────────────────────────────────────────
	// One polite live region for the whole list (nothing per row). Filtering changes the
	// list silently for a screen reader, so the count is spoken once typing settles: the
	// text is only swapped after a pause, so mid-word keystrokes never reach the region.
	// Nothing is announced while no filter is active (initial mount, cleared search).

	const ANNOUNCE_DELAY_MS = 600;
	let resultAnnouncement = $state('');

	$effect(() => {
		const filtering = listQuery.trim() !== '' || selectedBrands.size > 0;
		const count = displayPhones.length;
		const hasQuery = listQuery.trim() !== '';
		if (!filtering) {
			resultAnnouncement = '';
			return;
		}
		const timer = setTimeout(() => {
			resultAnnouncement =
				count === 0
					? hasQuery
						? m.phone_selector_no_results()
						: m.phone_selector_no_devices()
					: m.phone_selector_result_count({ count });
		}, ANNOUNCE_DELAY_MS);
		return () => clearTimeout(timer);
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

	/**
	 * The rank shown on an expanded row, and where it links.
	 *
	 * The ranking sheet wins where it has a row; everything else falls back to
	 * the `reviewScore` in `phone_book.json`, so a deploy with no sheet — or one
	 * whose sheet failed to load — shows exactly what it always showed.
	 *
	 * The link is built from the **sheet's** brand and model when a row matched.
	 * Matching exists precisely because the two files spell devices differently,
	 * so an anchor built from the phone book's spelling would point at a card
	 * that doesn't exist on the ranking page.
	 */
	function rankOf(phone: PhoneRow): { display: RankDisplay; href: string | null } | null {
		const row = rankingService.lookup(phone.brand, phone.name);
		const display = resolveRankDisplay(
			row?.value ?? phone.reviewScore,
			rankingService.scale,
			ranking.display
		);
		if (!display) return null;
		return {
			display,
			href: buildRankingUrl(ranking.url, {
				type: ranking.type,
				brand: row?.brand ?? phone.brand,
				model: row?.model ?? phone.name,
				slug: row?.slug
			})
		};
	}

	// Opt-in and self-guarding: returns immediately unless the operator configured
	// a ranking sheet. Here rather than in a store because this is also what
	// revalidates a stale sheet — the panel remounts on every panel switch.
	onMount(() => {
		rankingService.load();
	});
</script>

{#snippet rankIndicator(display: RankDisplay)}
	{#if display.kind === 'badge'}
		<!-- Operator-supplied scale colors, so they can't come from the token
		     palette; a scale step with no color falls back to one that can. -->
		<span
			class="rounded px-1.5 py-0.5 text-xs leading-none font-semibold
			{display.color ? '' : 'bg-base-300 text-base-content'}"
			style={display.color
				? `background-color:${display.color};color:${display.textColor ?? '#ffffff'}`
				: undefined}
		>
			{display.text}
		</span>
	{:else}
		<span class="text-xs text-base-content">{display.text}</span>
	{/if}
{/snippet}

<div class="flex h-full flex-col overflow-hidden" style="container-type: inline-size;">
	<!-- Header -->
	<div
		class="flex shrink-0 items-center gap-1.5 border-b border-base-content/15 bg-base-200 px-1.5 py-1.5"
	>
		<!-- Brands toggle (shown when container is narrow) -->
		{#if showPhonePane}
			<div class="ps-nav-btn">
				<Button
					label={m.phone_selector_header_brand_btn()}
					onclick={() => (showPhonePane = false)}
					variant="primary"
				/>
			</div>
		{/if}

		<!-- Search -->
		<Input
			type="search"
			bind:value={searchQuery}
			placeholder={m.phone_selector_header_search_bar_placeholder()}
			aria-label={m.phone_selector_search_label()}
			autocomplete="off"
			autocorrect="off"
			autocapitalize="none"
			spellcheck={false}
			enterkeyhint="search"
			class="flex-1 bg-base-100"
		>
			{#snippet icon()}
				<Search class="h-4 w-4 text-base-content/60" aria-hidden="true" />
			{/snippet}
		</Input>

		<!-- Search tips -->
		<PopoverPanel side="left" align="center" contentClass="max-w-72 p-3">
			{#snippet trigger({ props })}
				<Button
					{...props}
					title={m.phone_selector_search_help_btn()}
					variant="ghost"
					size="icon-sm"
					activeOnOpen
					class="shrink-0 opacity-80 hover:opacity-100"
				>
					<Info class="size-4" />
				</Button>
			{/snippet}
			<p class="mb-2 text-xs font-semibold text-base-content">
				{m.phone_selector_search_help_title()}
			</p>
			<ul class="flex flex-col gap-2">
				<li class="flex flex-col gap-1">
					<!--
						Examples stay literal in every locale: device names aren't translatable. That makes
						them the popover's fingerprint in PhoneSelector.svelte.spec.ts, which asserts on
						`hd 600, u12t`, `lyro // lyrö` and `earphones -pro -max` verbatim — rephrasing a
						sample here breaks those tests, so update the spec in the same change.
					-->
					<code class="ps-help-code">hd 6</code>
					<span class="text-xs leading-snug text-base-content/80">
						{m.phone_selector_search_help_substring()}
					</span>
					<span class="text-xs leading-snug text-base-content/80">
						{m.phone_selector_search_help_brands()}
					</span>
					{#if crossSiteEnabled}
						<span class="text-xs leading-snug text-base-content/80">
							{m.phone_selector_search_help_brands_cross_site()}
						</span>
					{/if}
				</li>
				<li class="flex flex-col gap-1">
					<code class="ps-help-code">hd 600, u12t</code>
					<span class="text-xs leading-snug text-base-content/80">
						{m.phone_selector_search_help_commas()}
					</span>
					{#if crossSiteEnabled}
						<span class="text-xs leading-snug text-base-content/80">
							{m.phone_selector_search_help_cross_site()}
						</span>
					{/if}
				</li>
				<li class="flex flex-col gap-1">
					<code class="ps-help-code">lyro // lyrö</code>
					<span class="text-xs leading-snug text-base-content/80">
						{m.phone_selector_search_help_alternatives()}
					</span>
				</li>
				<li class="flex flex-col gap-1">
					<code class="ps-help-code">earphones -pro -max</code>
					<span class="text-xs leading-snug text-base-content/80">
						{m.phone_selector_search_help_exclude()}
					</span>
				</li>
			</ul>
		</PopoverPanel>

		<!-- Devices toggle (shown when container is narrow) -->
		{#if !showPhonePane}
			<div class="ps-nav-btn">
				<Button
					label={m.phone_selector_header_device_btn()}
					onclick={() => (showPhonePane = true)}
					variant="primary"
				/>
			</div>
		{/if}
	</div>

	<!-- Clear brands button -->
	{#if selectedBrands.size > 0}
		<div class="shrink-0 p-1.5">
			<Button
				label={m.phone_selector_clear_brands_btn()}
				onclick={clearBrands}
				variant="secondary"
				class="w-full gap-2"
			>
				{#snippet icon()}<X class="h-4 w-4" aria-hidden="true" />{/snippet}
			</Button>
		</div>
	{/if}

	<!-- Debounced result count for screen readers; see "Result count announcement". -->
	<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
		{resultAnnouncement}
	</p>

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
						aria-pressed={selectedBrands.has(brand)}
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
					<p class="px-3 py-6 text-center text-xs text-base-content/80">
						{listQuery.trim() ? m.phone_selector_no_results() : m.phone_selector_no_devices()}
					</p>
				{/if}

				<!-- Local phone results -->
				{#each displayPhones as phone, i (phone.identifier)}
					{@const isLoaded = loadedIds.has(phone.identifier)}
					{@const isLoading = loadingIds.has(phone.identifier)}
					{@const rank = isLoaded ? rankOf(phone) : null}
					<!-- Last row of the pinned block carries the divider — but not when the
					     whole visible list is pinned, since there is nothing to divide from. -->
					{@const isPinBoundary = i === pinnedCount - 1 && pinnedCount < displayPhones.length}
					{@const hasMeta =
						isLoaded &&
						!!(rank || phone.price || phone.reviewLink || phone.shopLink || phone.links?.length)}
					{@const descId = `${uid}-desc-${i}`}
					<!-- The row is a container, not a button: the toggle button, the description and
					     the link row are siblings, because links nested in a button are invalid and
					     hidden from assistive tech (and a disabled button disables them). The
					     button's `::after` stretches over the whole row to keep the full-row click
					     area; the description and the link row sit above it (`z-10`) and let clicks
					     on their blank space and plain text fall through (`pointer-events-none`,
					     re-enabled on the anchors). -->
					<div
						class="relative transition-colors {isPinBoundary
							? 'border-b-2 border-b-base-content/30'
							: 'border-b border-base-content/8'}
							{isLoaded ? 'border-l-2 border-l-accent bg-accent/8' : 'hover:bg-base-300'}"
					>
						<!-- `title` carries the flattened description as the row's tooltip: the
						     description itself is click-through, so it can't show one. -->
						<button
							onclick={() => togglePhone(phone.identifier, isLoaded)}
							disabled={isLoading || (isLoaded && !allowRemovingPhone)}
							aria-pressed={isLoaded}
							aria-describedby={phone.description ? descId : undefined}
							title={phone.descText || undefined}
							class="flex w-full flex-col items-start px-3 pt-1.5 text-left text-sm after:absolute
								after:inset-0 focus-visible:outline-hidden focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent
								{hasMeta || phone.description ? 'pb-0' : 'min-h-8 pb-1.5'}
								{isLoaded ? 'font-medium text-base-content' : ''}
								{isLoading ? 'opacity-50' : ''}
								cursor-pointer disabled:cursor-default"
						>
							<span class="min-w-0 flex-1 truncate leading-snug">
								{phone.identifier}
							</span>
						</button>

						{#if phone.description}
							<!-- Operator-authored, so a small inline HTML subset is honored; the sanitizer
							     drops everything else (done once per device, in `phoneIndex`). -->
							<div
								id={descId}
								class="pointer-events-none relative z-10 px-3 pt-1 {hasMeta ? 'pb-0' : 'pb-1.5'}
									{isLoaded ? 'font-medium' : ''}
									{isLoading ? 'opacity-50' : ''}"
							>
								<div
									class="ps-description min-w-0 text-xs leading-snug text-base-content/80
									{isLoaded ? 'line-clamp-3' : 'line-clamp-1 truncate'}"
								>
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html phone.descHtml}
								</div>
							</div>
						{/if}

						{#if hasMeta}
							<div
								class="pointer-events-none relative z-10 flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-1 pb-1.5
									{isLoading ? 'opacity-50' : ''}"
							>
								{#if rank}
									{@const rankTitle = m.phone_selector_item_rank({ rank: rank.display.title })}
									{#if rank.href}
										<a
											href={rank.href}
											target="_blank"
											rel="external noopener noreferrer"
											class="pointer-events-auto text-xs {rank.display.kind === 'badge'
												? 'hover:opacity-80'
												: 'hover:underline'}"
											title={rankTitle}
										>
											{@render rankIndicator(rank.display)}
										</a>
									{:else}
										<span class="pointer-events-auto text-xs" title={rankTitle}>
											{@render rankIndicator(rank.display)}
										</span>
									{/if}
								{/if}

								{#if phone.price}
									<span class="text-xs text-base-content/80">{phone.price}</span>
								{/if}

								{#if phone.reviewLink}
									<a
										href={phone.reviewLink}
										target="_blank"
										rel="external noopener noreferrer"
										class="pointer-events-auto text-xs text-info hover:underline"
									>
										{m.phone_selector_item_review()}
									</a>
								{/if}

								{#if phone.shopLink}
									<a
										href={phone.shopLink}
										target="_blank"
										rel="external noopener noreferrer"
										class="pointer-events-auto text-xs text-info hover:underline"
									>
										{m.phone_selector_item_shop()}
									</a>
								{/if}

								<!-- Operator-defined extras — several shops, a manufacturer page,
									     a measurement note. Labels come from phone_book.json as-is. -->
								{#each phone.links ?? [] as link, i (link.url + '\0' + link.label + i)}
									<a
										href={link.url}
										target="_blank"
										rel="external noopener noreferrer"
										class="pointer-events-auto text-xs text-info hover:underline"
									>
										{link.label}
									</a>
								{/each}
							</div>
						{/if}
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
		pointer-events: auto;
		color: var(--color-info);
	}
	.ps-description :global(a:hover) {
		text-decoration: underline;
	}

	/* Example chips in the search-tips popover. */
	.ps-help-code {
		align-self: flex-start;
		border-radius: 0.25rem;
		background-color: var(--color-base-300);
		padding: 0.125rem 0.375rem;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11px;
		color: var(--color-base-content);
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
