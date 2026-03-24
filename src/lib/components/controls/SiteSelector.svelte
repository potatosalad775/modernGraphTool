<script lang="ts">
	import { onMount } from 'svelte';
	import { squiglinkStore } from '$lib/stores/squiglink-store.svelte';

	onMount(() => {
		squiglinkStore.fetchSiteRegistry();
	});

	function handleChange(e: Event) {
		const username = (e.currentTarget as HTMLSelectElement).value;
		const site = squiglinkStore.sites.find((s) => s.username === username);
		if (site) {
			window.location.href = squiglinkStore.buildSiteUrl(site);
		}
	}
</script>

{#if squiglinkStore.isEnabled && squiglinkStore.sites.length > 0}
	<select
		value={squiglinkStore.currentSiteUsername ?? ''}
		onchange={handleChange}
		class="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700
			focus:border-zinc-500 focus:outline-none
			dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
	>
		{#each squiglinkStore.sites as site (site.username)}
			<option value={site.username}>{site.name}</option>
		{/each}
	</select>
{/if}
