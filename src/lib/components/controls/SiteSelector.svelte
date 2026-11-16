<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { appStore } from '#lib/stores/app-store.svelte.js';
	import { squiglinkStore } from '#lib/stores/squiglink-store.svelte.js';
	import { siteIndexService } from '#lib/services/site-index.svelte.js';
	import { dbTypeLabel } from '#lib/services/aggregate-index-core.js';
	import { getSiteSelectorConfig } from '#lib/services/site-index-core.js';
	import Button from '#lib/components/atoms/Button.svelte';
	import PopoverPanel from '#lib/components/atoms/PopoverPanel.svelte';
	import Input from '#lib/components/atoms/Input.svelte';
	import { ChevronDown } from '@lucide/svelte';
	import { untrack } from 'svelte';

	const config = getSiteSelectorConfig();

	// The index isn't needed for the first graph, so it waits for the initial curves
	// and an idle moment rather than competing with them from mount. Still loaded
	// eagerly, not on open: in `auto` mode the entries decide whether this shows at all.
	$effect(() => {
		if (config.ENABLED === false || !appStore.isReady) return;
		if (typeof requestIdleCallback === 'function') {
			const id = requestIdleCallback(() => siteIndexService.load(), { timeout: 2000 });
			return () => cancelIdleCallback(id);
		}
		const id = setTimeout(() => siteIndexService.load(), 0);
		return () => clearTimeout(id);
	});

	/**
	 * `auto` shows the switcher only where it means something: a deployment the
	 * index knows about, or a squig.link host (which is where this control has
	 * always appeared). An unregistered standalone site would otherwise get a
	 * dropdown listing a hundred other people's databases and none of its own.
	 */
	const isVisible = $derived.by(() => {
		if (config.ENABLED === false) return false;
		if (siteIndexService.entries.length === 0) return false;
		if (config.ENABLED === true) return true;
		return siteIndexService.currentDbId !== null || squiglinkStore.isSquiglinkHost;
	});

	const groups = $derived(siteIndexService.groups);

	const triggerLabel = $derived(siteIndexService.currentEntry?.siteName ?? m.site_selector_label());
	// The visible text is the site name, so the accessible name has to contain it (WCAG 2.5.3).
	const triggerAriaLabel = $derived(
		siteIndexService.currentEntry
			? `${m.site_selector_label()}: ${siteIndexService.currentEntry.siteName}`
			: m.site_selector_label()
	);

	const uid = $props.id();
	let open = $state(false);
	let query = $state('');
	let rootEl = $state<HTMLElement>();
	let listEl = $state<HTMLElement>();

	/** Fewer entries than this and a filter field is clutter; the arrow keys work either way. */
	const FILTER_MIN_ENTRIES = 8;
	const showFilter = $derived(siteIndexService.entries.length > FILTER_MIN_ENTRIES);

	// Every open starts from the full list.
	$effect(() => {
		if (!open) query = '';
	});

	/** Case- and accent-insensitive, so "ecole" finds "École". */
	function fold(text: string): string {
		return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
	}

	const needle = $derived(showFilter ? fold(query.trim()) : '');

	const visibleGroups = $derived(
		needle === ''
			? groups
			: groups
					.map((group) => ({
						...group,
						entries: group.entries.filter((entry) => fold(entry.siteName).includes(needle))
					}))
					.filter((group) => group.entries.length > 0)
	);

	const visibleCount = $derived(
		visibleGroups.reduce((sum, group) => sum + group.entries.length, 0)
	);

	// ── Result count announcement ───────────────────────────────────────────────
	// Same pattern as PhoneSelector: one polite live region, swapped only once typing
	// pauses so mid-word keystrokes never reach it, and silent while no filter is active.
	const ANNOUNCE_DELAY_MS = 600;
	let resultAnnouncement = $state('');

	$effect(() => {
		const count = visibleCount;
		if (needle === '') {
			resultAnnouncement = '';
			return;
		}
		const timer = setTimeout(() => {
			resultAnnouncement =
				count === 0 ? m.site_selector_no_results() : m.site_selector_result_count({ count });
		}, ANNOUNCE_DELAY_MS);
		return () => clearTimeout(timer);
	});

	// ── Focus and keyboard ──────────────────────────────────────────────────────

	/** Focuses the filter as the panel opens. Not for a short list, which has no field. */
	function focusOnMount(node: HTMLElement) {
		node.focus();
	}

	/** Brings the current site into view on open, unless a filter is already narrowing the list. */
	function revealCurrent(node: HTMLElement) {
		if (untrack(() => needle) !== '') return;
		node.scrollIntoView({ block: 'center' });
	}

	function filterInput(): HTMLInputElement | null {
		return rootEl?.querySelector('input') ?? null;
	}

	function links(): HTMLAnchorElement[] {
		return listEl ? Array.from(listEl.querySelectorAll<HTMLAnchorElement>('a[href]')) : [];
	}

	/**
	 * Arrow keys rove focus over the links; they stay plain anchors in the tab order. Only
	 * the arrows, Home and End are intercepted: Enter and clicks are never touched, so the
	 * native activation (and middle-click, open-in-new-tab) keeps working.
	 */
	function onkeydown(event: KeyboardEvent) {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const target = event.target as HTMLElement;
		const all = links();

		if (target instanceof HTMLInputElement) {
			if (event.key === 'ArrowDown' && all.length > 0) {
				event.preventDefault();
				all[0].focus();
			}
			return;
		}

		const index = target instanceof HTMLAnchorElement ? all.indexOf(target) : -1;
		if (index === -1) return;

		let next: HTMLElement | undefined;
		switch (event.key) {
			case 'ArrowDown':
				next = all[Math.min(index + 1, all.length - 1)];
				break;
			case 'ArrowUp':
				next = index === 0 ? (filterInput() ?? all[0]) : all[index - 1];
				break;
			case 'Home':
				next = all[0];
				break;
			case 'End':
				next = all[all.length - 1];
				break;
			default:
				// A printable key hands focus to the field, where the character then lands.
				if (showFilter && event.key.length === 1 && event.key !== ' ') {
					filterInput()?.focus();
				}
				return;
		}
		event.preventDefault();
		next?.focus();
	}
</script>

{#if isVisible}
	<!--
		A popover of plain links, not a Select: the entries navigate, so they must be real
		anchors (Enter, announced as links, middle-click / open-in-new-tab). A Select's
		items are `role="option"` and its keyboard activation only toggles the value, so
		it never followed the link. The list is capped to the viewport and scrolls inside.
	-->
	<PopoverPanel
		bind:open
		side="bottom"
		sideOffset={4}
		label={m.site_selector_label()}
		contentClass="flex flex-col overflow-hidden p-0 {showFilter
			? 'w-64'
			: 'min-w-48'} max-h-[min(20rem,var(--bits-popover-content-available-height))]"
	>
		{#snippet trigger({ props })}
			<Button
				{...props}
				label={triggerLabel}
				aria-label={triggerAriaLabel}
				variant="ghost"
				size="sm"
				class="min-w-36 justify-between gap-1 rounded border border-base-content/20 bg-base-200 px-2
					py-1 text-sm font-normal hover:bg-base-300"
			>
				<ChevronDown class="h-3 w-3 shrink-0 text-base-content/60" aria-hidden="true" />
			</Button>
		{/snippet}

		<!-- The keydown only roves focus on the arrows; see `onkeydown`. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div bind:this={rootEl} {onkeydown} class="flex min-h-0 flex-col">
			{#if showFilter}
				<div class="shrink-0 border-b border-base-content/15 p-1.5">
					<Input
						type="search"
						bind:value={query}
						aria-label={m.site_selector_filter_label()}
						placeholder={m.site_selector_filter_label()}
						autocomplete="off"
						autocorrect="off"
						autocapitalize="none"
						spellcheck={false}
						enterkeyhint="search"
						{@attach focusOnMount}
					/>
				</div>
			{/if}

			<!-- Debounced result count for screen readers; see "Result count announcement". -->
			<p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
				{resultAnnouncement}
			</p>

			<div bind:this={listEl} class="min-h-0 scroll-pt-7 overflow-y-auto p-1.5">
				{#each visibleGroups as group (group.type)}
					<section aria-labelledby="{uid}-{group.type}">
						<h3
							id="{uid}-{group.type}"
							class="sticky top-0 z-10 bg-base-200 px-2 py-1 text-xs font-semibold tracking-wider
								text-base-content/80 uppercase"
						>
							{dbTypeLabel(group.type)}
						</h3>
						<ul class="flex flex-col">
							{#each group.entries as entry (entry.dbId)}
								{@const current = entry.dbId === siteIndexService.currentDbId}
								<li>
									<a
										href={entry.url}
										target="_blank"
										rel="external noopener noreferrer"
										aria-current={current ? 'page' : undefined}
										title={entry.verified ? undefined : m.site_selector_unverified()}
										onclick={() => (open = false)}
										{@attach current ? revealCurrent : undefined}
										class="block cursor-pointer rounded px-2 py-1 text-sm text-base-content no-underline
											hover:bg-base-300 focus-visible:bg-base-300 focus-visible:ring-1
											focus-visible:ring-accent focus-visible:outline-hidden
											{current ? 'font-medium text-accent' : ''}
											{entry.verified ? '' : 'opacity-50'}"
									>
										{entry.siteName}
									</a>
								</li>
							{/each}
						</ul>
					</section>
				{:else}
					<p class="px-2 py-2 text-center text-sm text-base-content/80">
						{m.site_selector_no_results()}
					</p>
				{/each}
			</div>
		</div>
	</PopoverPanel>
{/if}
