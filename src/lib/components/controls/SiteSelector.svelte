<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { appStore } from '#lib/stores/app-store.svelte.js';
	import { squiglinkStore } from '#lib/stores/squiglink-store.svelte.js';
	import { siteIndexService } from '#lib/services/site-index.svelte.js';
	import { dbTypeLabel } from '#lib/services/aggregate-index-core.js';
	import { getSiteSelectorConfig } from '#lib/services/site-index-core.js';
	import Button from '#lib/components/atoms/Button.svelte';
	import PopoverPanel from '#lib/components/atoms/PopoverPanel.svelte';
	import { ChevronDown } from '@lucide/svelte';

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
		contentClass="min-w-48 max-h-[min(20rem,var(--bits-popover-content-available-height))]"
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

		{#each groups as group (group.type)}
			<section aria-labelledby="{uid}-{group.type}">
				<h3
					id="{uid}-{group.type}"
					class="sticky top-0 z-10 bg-base-200 px-2 py-1 text-[12px] font-semibold tracking-wider
						text-base-content/50 uppercase"
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
								class="block cursor-pointer rounded px-2 py-1 text-sm text-base-content no-underline
									hover:bg-base-300 focus-visible:bg-base-300 focus-visible:ring-1
									focus-visible:ring-accent focus-visible:outline-none
									{current ? 'font-medium text-accent' : ''}
									{entry.verified ? '' : 'opacity-50'}"
							>
								{entry.siteName}
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</PopoverPanel>
{/if}
