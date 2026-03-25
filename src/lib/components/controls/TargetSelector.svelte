<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import * as m from '$lib/paraglide/messages';
	import { getConfigValue } from '$lib/utils/config.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import type { TargetManifestEntry } from '$lib/types/data-types.js';

	// ── Config ──────────────────────────────────────────────────────────────────

	const allowMultiLine = (getConfigValue('INTERFACE.TARGET.ALLOW_MULTIPLE_LINE_PER_TYPE') as boolean) ?? true;
	const omitSuffix = (getConfigValue('INTERFACE.TARGET.OMIT_TARGET_SUFFIX') as boolean) ?? false;
	const collapseOnInitial = (getConfigValue('INTERFACE.TARGET.COLLAPSE_TARGET_LIST_ON_INITIAL') as boolean) ?? false;

	// ── State ───────────────────────────────────────────────────────────────────

	const targets: TargetManifestEntry[] =
		(getConfigValue('TARGET_MANIFEST') as TargetManifestEntry[] | undefined) ?? [];

	// Track collapsed groups (by type name)
	const collapsedGroups = new SvelteSet<string>(
		collapseOnInitial ? targets.map((g) => g.type) : []
	);

	function getIdentifier(file: string): string {
		return file.includes(' Target') ? file : file + ' Target';
	}

	function getDisplayName(file: string): string {
		if (omitSuffix) return file.replace(/ Target$/, '');
		return file;
	}

	function toggleCollapse(type: string) {
		if (collapsedGroups.has(type)) collapsedGroups.delete(type);
		else collapsedGroups.add(type);
	}

	// Derive a reactive set of loaded identifiers from the SvelteMap
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

{#if targets.length > 0}
	<div class="flex flex-col gap-2">
		<span class="text-xs font-semibold uppercase tracking-wide text-zinc-500">
			{m.target_selector_label()}
		</span>

		{#if allowMultiLine}
			<!-- Grouped by type with optional collapse -->
			{#each targets as group (group.type)}
				<div class="flex flex-col gap-1">
					<button
						onclick={() => toggleCollapse(group.type)}
						class="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
					>
						<span class="text-[10px]">{collapsedGroups.has(group.type) ? '▶' : '▼'}</span>
						{group.type}
					</button>
					{#if !collapsedGroups.has(group.type)}
						<div class="flex flex-wrap gap-1">
							{#each group.files as file (file)}
								{@const identifier = getIdentifier(file)}
								{@const isLoaded = loadedIds.has(identifier)}
								{@const isLoading = loading.has(identifier)}
								<button
									onclick={() => toggleTarget(identifier, isLoaded)}
									disabled={isLoading}
									class={[
										'rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50',
										isLoaded
											? 'bg-zinc-200 text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600'
											: 'border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800'
									].join(' ')}
								>
									{getDisplayName(file)}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		{:else}
			<!-- Flat list — all targets in one row -->
			<div class="flex flex-wrap gap-1">
				{#each targets as group}
					{#each group.files as file (file)}
						{@const identifier = getIdentifier(file)}
						{@const isLoaded = loadedIds.has(identifier)}
						{@const isLoading = loading.has(identifier)}
						<button
							onclick={() => toggleTarget(identifier, isLoaded)}
							disabled={isLoading}
							class={[
								'rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50',
								isLoaded
									? 'bg-zinc-200 text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600'
									: 'border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800'
							].join(' ')}
						>
							{getDisplayName(file)}
						</button>
					{/each}
				{/each}
			</div>
		{/if}
	</div>
{/if}
