<script lang="ts">
	import { Dialog } from 'bits-ui';
	import * as m from '$lib/paraglide/messages.js';
	import { linkStore } from '$lib/stores/link-store.svelte.js';
	import { devicePeqStore } from '$lib/stores/device-peq-store.svelte.js';
	import { linkService } from '$lib/services/link-service.svelte.js';
	import { devicePeqService } from '$lib/services/device-peq-service.svelte.js';
	import type { PushPlan } from '$lib/device-peq/push-plan.js';
	import Button from '../atoms/Button.svelte';
	import DevicePeqPushDialog from './DevicePeqPushDialog.svelte';
	import VolumeWarningDialog from './VolumeWarningDialog.svelte';

	/**
	 * The uniPEQ link's two questions. Mounted from AppShell rather than a panel: uniPEQ may
	 * approve, or ask for a review, while the Equalizer panel is closed.
	 *
	 * - Which list wins when the session's first one differs from this page's. It can't be
	 *   dismissed: until it is answered this page hasn't joined the shared list.
	 * - uniPEQ's review of a write it can't make exactly. It shows on both sides, and either
	 *   side's answer closes both.
	 * - uniPEQ's volume warning before its first write to the device, likewise on both sides.
	 */

	const choice = $derived(linkStore.choice);

	const review = $derived(
		devicePeqStore.connection?.connectionType === 'link' ? (linkStore.status?.review ?? null) : null
	);
	/** uniPEQ's plan in the shape the push dialog shows. */
	const plan = $derived<PushPlan | null>(
		review && {
			filters: [],
			changes: review.changes,
			skippedChannel: 0,
			clipRisk: review.clipRisk,
			infeasible: review.infeasible,
			emptySlots: 0
		}
	);
	/** The review this page already answered: closed here while uniPEQ catches up. */
	let answered = $state<number | null>(null);
	/** Writable: the dialog closes itself before its answer reaches uniPEQ. */
	let reviewOpen = $derived(review !== null && review.rev !== answered);

	function answer(accept: boolean) {
		if (!review) return;
		answered = review.rev;
		void devicePeqService.answerReview(review.rev, accept);
	}

	const link = $derived(devicePeqService.linkDevice);
	/** Closed here once answered, while uniPEQ catches up; open again if uniPEQ asks again. */
	let consentAnswered = $state(false);
	const consent = $derived(!!link && !!linkStore.status?.consent);
	$effect(() => {
		if (!consent) consentAnswered = false;
	});

	function answerConsent(go: boolean, quiet: boolean) {
		consentAnswered = true;
		void link?.consent(go, quiet).catch((e) => devicePeqService.fail(e, 'write'));
	}
</script>

<Dialog.Root open={choice !== null}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
		<Dialog.Content
			interactOutsideBehavior="ignore"
			escapeKeydownBehavior="ignore"
			class="fixed top-1/2 left-1/2 z-50 flex w-11/12 max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl bg-base-200 p-6 shadow-2xl"
		>
			<Dialog.Title class="text-lg font-semibold text-base-content">
				{m.link_start_title()}
			</Dialog.Title>
			<Dialog.Description class="text-sm text-base-content/70">
				{m.link_start_body({ count: choice?.theirs ?? 0 })}
			</Dialog.Description>
			{#if choice && (choice.flattened > 0 || choice.dropped > 0)}
				<ul class="list-disc space-y-1 pl-5 text-sm text-base-content/80">
					{#if choice.flattened > 0}
						<li>{m.link_start_flattened({ count: choice.flattened })}</li>
					{/if}
					{#if choice.dropped > 0}
						<li>{m.link_start_dropped({ count: choice.dropped })}</li>
					{/if}
				</ul>
			{/if}
			<div class="flex flex-wrap justify-end gap-2">
				<Button
					title={m.link_start_send()}
					variant="outline"
					size="sm"
					onclick={() => linkService.choose('mine')}
				>
					{m.link_start_send()}
				</Button>
				<Button
					title={m.link_start_use_unipeq()}
					variant="primary"
					size="sm"
					onclick={() => linkService.choose('theirs')}
				>
					{m.link_start_use_unipeq()}
				</Button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<VolumeWarningDialog
	open={consent && !consentAnswered}
	device={devicePeqStore.connection?.name ?? ''}
	onAnswer={answerConsent}
/>

<DevicePeqPushDialog
	bind:open={reviewOpen}
	{plan}
	deviceName={devicePeqStore.connection?.name ?? ''}
	onConfirm={() => answer(true)}
	onCancel={() => answer(false)}
/>
