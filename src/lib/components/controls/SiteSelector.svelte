<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { appStore } from '$lib/stores/app-store.svelte';
	import { squiglinkStore } from '$lib/stores/squiglink-store.svelte';
	import { siteIndexService } from '$lib/services/site-index.svelte';
	import { getSiteSelectorConfig } from '$lib/services/site-index-core';
	import { Select } from 'bits-ui';
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

	const flatItems = $derived(
		groups.flatMap((group) =>
			group.entries.map((entry) => ({ value: entry.dbId, label: entry.siteName }))
		)
	);

	const triggerLabel = $derived(siteIndexService.currentEntry?.siteName ?? m.site_selector_label());
</script>

{#if isVisible}
	<Select.Root type="single" value={siteIndexService.currentDbId ?? ''} items={flatItems}>
		<Select.Trigger
			aria-label={m.site_selector_label()}
			class="inline-flex min-w-36 items-center justify-between gap-1 rounded border
				border-base-content/20 bg-base-200 px-2 py-1 text-sm focus:ring-1 focus:ring-accent focus:outline-none"
		>
			{triggerLabel}
			<ChevronDown class="h-3 w-3 shrink-0 text-base-content/60" />
		</Select.Trigger>

		<Select.Content
			side="bottom"
			sideOffset={4}
			class="z-50 max-h-80 overflow-y-auto rounded-lg border border-base-content/15
				bg-base-200 p-1 shadow-xl"
			style="min-width: 12rem;"
		>
			{#each groups as group (group.type)}
				<Select.Group>
					<Select.GroupHeading
						class="px-2 py-1 text-[12px] font-semibold tracking-wider text-base-content/50
							uppercase"
					>
						{group.type}
					</Select.GroupHeading>

					{#each group.entries as entry (entry.dbId)}
						<Select.Item value={entry.dbId} label={entry.siteName}>
							{#snippet child({ props, selected })}
								<a
									{...props}
									href={entry.url}
									target="_blank"
									rel="external noopener noreferrer"
									title={entry.verified ? undefined : m.site_selector_unverified()}
									class="block cursor-pointer rounded px-2 py-1 text-sm text-base-content
										no-underline outline-none data-highlighted:bg-base-300
										{selected ? 'font-medium text-accent' : ''}
										{entry.verified ? '' : 'opacity-50'}"
								>
									{entry.siteName}
								</a>
							{/snippet}
						</Select.Item>
					{/each}
				</Select.Group>
			{/each}
		</Select.Content>
	</Select.Root>
{/if}
