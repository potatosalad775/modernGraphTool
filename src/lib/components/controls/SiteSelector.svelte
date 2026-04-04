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
		class="rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs text-base-content/60
			focus:outline-none focus:ring-1 focus:ring-accent"
	>
		{#each squiglinkStore.sites as site (site.username)}
			<option value={site.username}>{site.name}</option>
		{/each}
	</select>
{/if}
