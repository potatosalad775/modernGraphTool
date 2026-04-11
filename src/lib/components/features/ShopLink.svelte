<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import { frStore } from '$lib/stores/fr-store.svelte';
	import { squiglinkStore } from '$lib/stores/squiglink-store.svelte';
	import { analyticsService } from '$lib/services/analytics-service.svelte';
	import { ShoppingBag } from '@lucide/svelte';
	import type { SponsorProductData } from '$lib/types/squiglink-types';

	onMount(() => {
		if (squiglinkStore.isEnabled) {
			squiglinkStore.fetchSponsorDetail();
			squiglinkStore.fetchShopLinks();
		}
	});

	let productData = $state<SponsorProductData | null>(null);

	const shopLink = $derived.by(() => {
		if (!squiglinkStore.isEnabled || squiglinkStore.isCurrentSiteOptedOut) return null;

		const phones = [...frStore.entries.values()].filter((e) => e.type === 'phone');
		if (phones.length !== 1) return null;

		const phone = phones[0];
		const sponsorDetail = squiglinkStore.getSponsorDetail();
		const match = squiglinkStore.findShopLink(phone.identifier);
		if (!match?.hfg_com) return null;

		return {
			model: phone.identifier,
			url: match.hfg_com + (sponsorDetail?.utmParams ?? ''),
			sponsorName: sponsorDetail?.sponsorName ?? null,
			hfgUrl: match.hfg_com
		};
	});

	$effect(() => {
		const link = shopLink;
		if (!link?.hfgUrl) {
			productData = null;
			return;
		}
		squiglinkStore.fetchSponsorProductData(link.hfgUrl).then((data) => {
			productData = data;
		});
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
		class="flex items-center gap-1.75 rounded-md px-3 py-1.5 h-9 text-sm font-medium transition-colors
			bg-secondary text-secondary-content hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
	>
		<ShoppingBag class="w-4 h-4" />
		{m.shoplink_buy_now()}
		{#if productData?.currentPrice || shopLink.sponsorName}
			<div class="w-px h-5 bg-success-content/60"></div>
			<span class="flex gap-0.5">
				{#if productData?.currentPrice}
					{#if productData.onSale && productData.originalPrice}
						<span class="line-through opacity-60 text-xs">${productData.originalPrice}</span>
						<span class="font-semibold">${productData.currentPrice}</span>
					{:else}
						<span class="font-semibold">${productData.currentPrice}</span>
					{/if}
				{/if}
				{#if productData?.currentPrice && shopLink.sponsorName}
					@
				{/if}
				{#if shopLink.sponsorName}{shopLink.sponsorName}{/if}
			</span>
		{/if}
	</a>
{/if}
