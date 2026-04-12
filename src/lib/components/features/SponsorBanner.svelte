<script lang="ts">
	import { onMount } from 'svelte';
	import { Dialog } from 'bits-ui';
	import * as m from '$lib/paraglide/messages';
	import { getConfigValue } from '$lib/utils/config';
	import { squiglinkStore } from '$lib/stores/squiglink-store.svelte';
	import { ExternalLink } from '@lucide/svelte';

	let open = $state(false);

	const configEnabled = $derived(
		squiglinkStore.isEnabled &&
			(getConfigValue('SQUIGLINK.ENABLE_SPONSOR') as boolean) !== false &&
			!squiglinkStore.isCurrentSiteOptedOut
	);

	const showDialog = $derived(configEnabled && squiglinkStore.sponsorContent !== null);

	onMount(async () => {
		if (!configEnabled || localStorage.getItem('squiglink-sponsor-dismissed')) return;

		// Load the sponsor content from squiglink-intro.js
		await squiglinkStore.fetchSponsorContent();

		// Open dialog after data is loaded (reactivity will handle the rest)
		if (squiglinkStore.sponsorContent) {
			open = true;
		}
	});

	function dismiss() {
		open = false;
		localStorage.setItem('squiglink-sponsor-dismissed', 'true');
	}

	function buildUtmUrl(baseUrl: string, sponsorId: string): string {
		const separator = baseUrl.includes('?') ? '&' : '?';
		return `${baseUrl}${separator}utm_source=squiglink&utm_medium=landingpromo&utm_campaign=${sponsorId}`;
	}
</script>

{#if showDialog && squiglinkStore.sponsorContent}
	{@const sponsor = squiglinkStore.sponsorContent}
	<Dialog.Root bind:open onOpenChange={(v) => { if (!v) dismiss(); }}>
		<Dialog.Portal>
			<Dialog.Overlay
				class="fixed inset-0 z-40 bg-black/40"
			/>
			<Dialog.Content
				class="fixed left-1/2 top-1/2 z-50 w-11/12 max-w-md max-h-11/12 -translate-x-1/2 -translate-y-1/2
					flex flex-col rounded-xl bg-base-200 p-6 shadow-2xl"
			>
				<Dialog.Title class="text-lg font-semibold text-base-content">
					{sponsor.heading}
				</Dialog.Title>

				<Dialog.Description class="mt-1 text-sm text-base-content/60">
					{sponsor.sponsorMessage}
				</Dialog.Description>

				{#if sponsor.creative}
					<div
						class="mt-4 flex flex-1 justify-center overflow-hidden rounded-lg"
						style:background-color={sponsor.creativeBgColor || 'var(--color-base-300)'}
					>
						<img src={sponsor.creative} alt={sponsor.sponsorshipName} class="object-contain" />
					</div>
				{/if}

				<div class="mt-3 flex flex-row gap-2">
					{#if sponsor.ctaLink}
						<a
							href={buildUtmUrl(sponsor.ctaLink, sponsor.sponsorId)}
							target="_blank"
							rel="noopener noreferrer"
							class="flex items-center justify-center flex-1 gap-2 h-12 rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-medium text-accent-content transition-colors
								hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
						>
							<ExternalLink class="w-4 h-4" />
							{sponsor.ctaText}
						</a>
					{/if}

					{#if sponsor.cta2Link && sponsor.cta2Text}
						<a
							href={buildUtmUrl(sponsor.cta2Link, sponsor.sponsorId)}
							target="_blank"
							rel="noopener noreferrer"
							class="flex items-center justify-center flex-1 gap-2 h-12 rounded-lg border 
								border-base-content/20 px-4 py-2.5 text-center text-sm font-medium hover:bg-base-300"
						>
							<ExternalLink class="w-4 h-4" />
							{sponsor.cta2Text}
						</a>
					{/if}
				</div>

				<Dialog.Close
					class="mt-3 -mb-2 h-12 w-full text-center text-sm text-base-content/60 hover:bg-base-300 rounded-lg py-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-base-content/80"
				>
					{m.sponsor_banner_dismiss()}
				</Dialog.Close>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{/if}
