<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { linkStore } from '#lib/stores/link-store.svelte.js';
	import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
	import { linkService } from '#lib/services/link-service.svelte.js';
	import { devicePeqService } from '#lib/services/device-peq-service.svelte.js';
	import type { PushPlan } from '#lib/device-peq/push-plan.js';
	import Button from '../atoms/Button.svelte';
	import Dialog from '../atoms/Dialog.svelte';
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
	const EAR = { left: 'L', right: 'R' } as const;
	/** uniPEQ's plan in the shape the push dialog shows, each change in its channel's ear. */
	const plan = $derived<PushPlan | null>(
		review && {
			filters: [],
			changes: review.changes.map((change) =>
				change.kind === 'preamp' || !change.channel
					? change
					: { ...change, ear: EAR[change.channel] }
			),
			skippedChannel: 0,
			clipRisk: review.clipRisk,
			infeasible: review.infeasible,
			emptySlots: 0,
			sent: 0
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
		void link?.consent(go, quiet).catch((e: unknown) => devicePeqService.fail(e, 'write'));
	}
</script>

<Dialog
	open={choice !== null}
	dismissible={false}
	title={m.link_start_title()}
	description={m.link_start_body({ count: choice?.theirs ?? 0 })}
>
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
	{#snippet actions()}
		<Button
			label={m.link_start_send()}
			variant="outline"
			size="sm"
			onclick={() => linkService.choose('mine')}
		/>
		<Button
			label={m.link_start_use_unipeq()}
			variant="primary"
			size="sm"
			onclick={() => linkService.choose('theirs')}
		/>
	{/snippet}
</Dialog>

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
