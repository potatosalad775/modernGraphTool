<script lang="ts">
	import { onMount } from 'svelte';
	import { Dialog } from 'bits-ui';
	import * as m from '$lib/paraglide/messages';
	import { getConfigValue } from '$lib/utils/config';
	import { squiglinkStore } from '$lib/stores/squiglink-store.svelte';

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
				class="fixed inset-0 z-40 bg-black/50"
			/>
			<Dialog.Content
				class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2
					rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-900"
			>
				<Dialog.Title class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
					{sponsor.heading}
				</Dialog.Title>

				<Dialog.Description class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
					{sponsor.sponsorMessage}
				</Dialog.Description>

				{#if sponsor.sponsorLogo}
					<div class="mt-4 flex justify-center">
						<img src={sponsor.sponsorLogo} alt={sponsor.sponsorshipName} class="h-8" />
					</div>
				{/if}

				{#if sponsor.creative}
					<div
						class="mt-4 flex justify-center overflow-hidden rounded-lg p-4"
						style:background-color={sponsor.creativeBgColor || '#f4f4f5'}
					>
						<img src={sponsor.creative} alt={sponsor.sponsorshipName} class="max-h-48 object-contain" />
					</div>
				{/if}

				<div class="mt-6 flex flex-col gap-2">
					{#if sponsor.ctaLink}
						<a
							href={buildUtmUrl(sponsor.ctaLink, sponsor.sponsorId)}
							target="_blank"
							rel="noopener noreferrer"
							class="rounded-lg bg-zinc-800 px-4 py-2.5 text-center text-sm font-medium text-white
								hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-300"
						>
							{sponsor.ctaText}
						</a>
					{/if}

					{#if sponsor.cta2Link && sponsor.cta2Text}
						<a
							href={buildUtmUrl(sponsor.cta2Link, sponsor.sponsorId)}
							target="_blank"
							rel="noopener noreferrer"
							class="rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm font-medium
								text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
						>
							{sponsor.cta2Text}
						</a>
					{/if}
				</div>

				<Dialog.Close
					class="mt-4 w-full text-center text-xs text-zinc-400 hover:text-zinc-600
						dark:text-zinc-500 dark:hover:text-zinc-300"
				>
					{m.sponsor_banner_dismiss()}
				</Dialog.Close>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{/if}
