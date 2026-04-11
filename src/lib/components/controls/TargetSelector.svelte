<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { getConfigValue } from '$lib/utils/config.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import type { TargetManifestEntry } from '$lib/types/data-types.js';
	import Accordion from '../atoms/Accordion.svelte';
	import AccordionItem from '../atoms/AccordionItem.svelte';
	import ScrollArea from '../atoms/ScrollArea.svelte';
	import Button from '../atoms/Button.svelte';

	// ── Config ──────────────────────────────────────────────────────────────────

	const allowMultiLine = (getConfigValue('INTERFACE.TARGET.ALLOW_MULTIPLE_LINE_PER_TYPE') as boolean) ?? true;
	const omitSuffix = (getConfigValue('INTERFACE.TARGET.OMIT_TARGET_SUFFIX') as boolean) ?? false;
	const collapseOnInitial = (getConfigValue('INTERFACE.TARGET.COLLAPSE_TARGET_LIST_ON_INITIAL') as boolean) ?? false;

	// ── State ───────────────────────────────────────────────────────────────────

	const targets: TargetManifestEntry[] =
		(getConfigValue('TARGET_MANIFEST') as TargetManifestEntry[] | undefined) ?? [];

	function getIdentifier(file: string): string {
		return file.includes(' Target') ? file : file + ' Target';
	}

	function getDisplayName(file: string): string {
		if (omitSuffix) return file.replace(/ Target$/, '');
		return file;
	}

	const loadedIds = $derived(
		new Set([...frStore.entries.values()].map((e) => e.identifier))
	);

	let loading = $state(new Set<string>());

	async function toggleTarget(identifier: string, isLoaded: boolean) {
		if (loading.has(identifier)) return;
		loading = new Set([...loading, identifier]);
		try {
			await dataProvider.toggleFRData('target', identifier, !isLoaded);
		} finally {
			loading = new Set([...loading].filter((id) => id !== identifier));
		}
	}
</script>

{#snippet targetRow(group: TargetManifestEntry)}
	<ScrollArea orientation="horizontal" type="always" viewportClasses="flex w-full px-[1px] pt-[1px] pb-2 last-child:pb-[1px]">
		<div class="flex items-center gap-2">
			<span class="pl-1 shrink-0 text-xs font-medium text-base-content/40">{group.type}</span>
			<div class="flex gap-1.5">
				{#each group.files as file (file)}
					{@const identifier = getIdentifier(file)}
					{@const isLoaded = loadedIds.has(identifier)}
					{@const isLoading = loading.has(identifier)}
					<Button
						title={getDisplayName(file)}
						onclick={() => toggleTarget(identifier, isLoaded)}
						disabled={isLoading}
						variant={isLoaded ? 'primary' : 'outline'}
						size="sm"
						class="whitespace-nowrap"
					>
						{getDisplayName(file)}
					</Button>
				{/each}
			</div>
		</div>
	</ScrollArea>
{/snippet}

{#if targets.length > 0}
	{#if allowMultiLine}
		<Accordion type="single" value={collapseOnInitial ? '' : 'targets'}>
			<AccordionItem value="targets" title={m.target_selector_label()}>
				<div class="flex flex-col gap-0.5 pt-1 -mb-0.75">
					{#each targets as group (group.type)}
						{@render targetRow(group)}
					{/each}
				</div>
			</AccordionItem>
		</Accordion>
	{:else}
		{#each targets as group (group.type)}
			{@render targetRow(group)}
		{/each}
	{/if}
{/if}
