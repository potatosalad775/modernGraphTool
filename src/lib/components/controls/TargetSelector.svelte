<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { getConfigValue } from '$lib/utils/config.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import type { TargetManifestEntry } from '$lib/types/data-types.js';

	const targets: TargetManifestEntry[] =
		(getConfigValue('TARGET_MANIFEST') as TargetManifestEntry[] | undefined) ?? [];

	function getIdentifier(file: string): string {
		return file.includes(' Target') ? file : file + ' Target';
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

		{#each targets as group (group.type)}
			<div class="flex flex-col gap-1">
				<span class="text-xs font-semibold uppercase tracking-wide text-zinc-500">
					{group.type}
				</span>
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
							{file}
						</button>
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/if}
