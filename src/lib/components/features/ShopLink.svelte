<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import { frStore } from '$lib/stores/fr-store.svelte';
	import { squiglinkStore } from '$lib/stores/squiglink-store.svelte';
	import { analyticsService } from '$lib/services/analytics-service.svelte';

	onMount(() => {
		if (squiglinkStore.isEnabled) {
			squiglinkStore.fetchShopLinks();
		}
	});

	const shopLink = $derived.by(() => {
		if (!squiglinkStore.isEnabled || squiglinkStore.isCurrentSiteOptedOut) return null;

		const phones = [...frStore.entries.values()].filter((e) => e.type === 'phone');
		if (phones.length !== 1) return null;

		const phone = phones[0];
		const match = squiglinkStore.findShopLink(phone.identifier);
		if (!match?.hfg_com) return null;

		return {
			model: phone.identifier,
			url: match.hfg_com + '?utm_source=squiglink&utm_medium=shoplink&utm_campaign=mgt_v2'
		};
	});

	function handleClick() {
		if (shopLink) {
			analyticsService.trackGeneralEvent('shoplink_click', { model: shopLink.model });
		}
	}
</script>

{#if shopLink}
	<a
		href={shopLink.url}
		target="_blank"
		rel="noopener noreferrer"
		onclick={handleClick}
		class="flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-medium text-success-content transition-colors
			hover:bg-success/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 20 20"
			fill="currentColor"
			class="h-3.5 w-3.5"
			aria-hidden="true"
		>
			<path d="M1 1.75A.75.75 0 011.75 1h1.628a1.75 1.75 0 011.734 1.51L5.18 3a65.25 65.25 0 0113.36 1.412.75.75 0 01.58.875 48.645 48.645 0 01-1.618 6.2.75.75 0 01-.712.513H6a2.503 2.503 0 00-2.292 1.5H17.25a.75.75 0 010 1.5H2.76a.75.75 0 01-.748-.807 4.002 4.002 0 012.716-3.486L3.626 2.716a.25.25 0 00-.248-.216H1.75A.75.75 0 011 1.75zM6 17.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
		</svg>
		{m.shoplink_buy_now()}
	</a>
{/if}
