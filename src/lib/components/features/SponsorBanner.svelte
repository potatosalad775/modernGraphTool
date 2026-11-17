<script lang="ts">
	import { onMount } from 'svelte';
	import { Dialog } from 'bits-ui';
	import * as m from '#lib/paraglide/messages.js';
	import { squiglinkStore } from '#lib/stores/squiglink-store.svelte.js';
	import { ExternalLink } from '@lucide/svelte';
	import { dialogCardClass, dialogOverlayClass } from '../atoms/dialog-shell.js';

	let open = $state(false);

	const showDialog = $derived(
		squiglinkStore.isSponsorEnabled && squiglinkStore.sponsorContent !== null
	);

	onMount(async () => {
		if (!squiglinkStore.isSponsorEnabled) return;

		// Joins the load hooks.client.ts started before mount
		await squiglinkStore.fetchSponsorContent();

		// Open only for a sponsor the visitor has not dismissed yet
		const sponsor = squiglinkStore.sponsorContent;
		if (sponsor && !squiglinkStore.isSponsorDismissed(sponsor.sponsorId)) {
			open = true;
		}
	});

	function dismiss() {
		open = false;
		squiglinkStore.dismissSponsor();
	}

	function buildUtmUrl(baseUrl: string, sponsorId: string): string {
		const separator = baseUrl.includes('?') ? '&' : '?';
		return `${baseUrl}${separator}utm_source=squiglink&utm_medium=landingpromo&utm_campaign=${encodeURIComponent(sponsorId)}`;
	}
</script>

{#if showDialog && squiglinkStore.sponsorContent}
	{@const sponsor = squiglinkStore.sponsorContent}
	<Dialog.Root
		bind:open
		onOpenChange={(v) => {
			if (!v) dismiss();
		}}
	>
		<Dialog.Portal>
			<Dialog.Overlay class={dialogOverlayClass} />
			<Dialog.Content class={dialogCardClass}>
				<Dialog.Title class="text-lg font-semibold text-balance text-base-content">
					{sponsor.heading}
				</Dialog.Title>

				<Dialog.Description class="mt-1 text-sm text-pretty text-base-content/80">
					{sponsor.sponsorMessage}
				</Dialog.Description>

				{#if sponsor.creative}
					<div
						class="mt-4 flex flex-1 justify-center overflow-hidden rounded-lg"
						style:background-color={sponsor.creativeBgColor || 'var(--color-base-300)'}
					>
						<img
							src={sponsor.creative}
							alt={sponsor.sponsorshipName}
							fetchpriority="high"
							class="object-contain"
						/>
					</div>
				{/if}

				<div class="mt-3 flex flex-row gap-2">
					{#if sponsor.ctaLink}
						<a
							href={buildUtmUrl(sponsor.ctaLink, sponsor.sponsorId)}
							target="_blank"
							rel="external noopener noreferrer"
							class="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-medium text-accent-content transition-colors
								hover:bg-accent/80 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-hidden"
						>
							<ExternalLink class="h-4 w-4" />
							{sponsor.ctaText}
						</a>
					{/if}

					{#if sponsor.cta2Link && sponsor.cta2Text}
						<a
							href={buildUtmUrl(sponsor.cta2Link, sponsor.sponsorId)}
							target="_blank"
							rel="external noopener noreferrer"
							class="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border
								border-base-content/20 px-4 py-2.5 text-center text-sm font-medium hover:bg-base-300"
						>
							<ExternalLink class="h-4 w-4" />
							{sponsor.cta2Text}
						</a>
					{/if}
				</div>

				<Dialog.Close
					class="mt-3 -mb-2 h-12 w-full cursor-pointer rounded-lg py-1 text-center text-sm text-base-content/80 transition-colors hover:bg-base-300 hover:text-base-content focus-visible:ring-2 focus-visible:ring-base-content/80 focus-visible:outline-hidden"
				>
					{m.sponsor_banner_dismiss()}
				</Dialog.Close>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{/if}
