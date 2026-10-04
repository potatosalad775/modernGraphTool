<script lang="ts">
	import { Dialog } from 'bits-ui';
	import * as m from '$lib/paraglide/messages.js';
	import type { PlanChange, PushPlan } from '$lib/device-peq/push-plan.js';
	import Button from '../atoms/Button.svelte';

	/**
	 * Shown before a push whenever the device can't hold the EQ on screen as it is: what eqcaps'
	 * `fit` moved, which bands have no slot, what per-channel bands stay behind, and whether the
	 * result may clip. Nothing is written until the user says so.
	 */
	let {
		open = $bindable(false),
		plan,
		deviceName,
		onConfirm
	}: {
		open?: boolean;
		plan: PushPlan | null;
		deviceName: string;
		onConfirm: () => void;
	} = $props();

	const FIELD_LABEL: Record<'type' | 'freq' | 'q' | 'gain', () => string> = {
		type: m.equalizer_device_peq_field_type,
		freq: m.equalizer_device_peq_field_freq,
		q: m.equalizer_device_peq_field_q,
		gain: m.equalizer_device_peq_field_gain
	};
	const UNIT = { type: '', freq: ' Hz', q: '', gain: ' dB' } as const;

	function show(value: number | string, unit: string): string {
		if (typeof value === 'string') return value === 'LSC' ? 'LS' : value === 'HSC' ? 'HS' : value;
		return `${Math.round(value * 1000) / 1000}${unit}`;
	}

	function describe(c: PlanChange): string {
		if (c.kind === 'dropped') return m.equalizer_device_peq_push_dropped({ band: c.band });
		if (c.kind === 'preamp') {
			return m.equalizer_device_peq_push_preamp({
				wanted: show(c.wanted, ' dB'),
				written: show(c.written, ' dB')
			});
		}
		return m.equalizer_device_peq_push_change({
			band: c.band,
			field: FIELD_LABEL[c.field](),
			wanted: show(c.wanted, UNIT[c.field]),
			written: show(c.written, UNIT[c.field])
		});
	}

	function confirm() {
		open = false;
		onConfirm();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-11/12 max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl bg-base-200 p-6 shadow-2xl"
		>
			<Dialog.Title class="text-lg font-semibold text-base-content">
				{m.equalizer_device_peq_push_title({ device: deviceName })}
			</Dialog.Title>
			<Dialog.Description class="text-sm text-base-content/70">
				{m.equalizer_device_peq_push_intro()}
			</Dialog.Description>

			{#if plan}
				<ul class="flex-1 space-y-1 overflow-y-auto text-sm text-base-content/80">
					{#each plan.changes as change, i (i)}
						<li>{describe(change)}</li>
					{/each}
					{#if plan.skippedChannel > 0}
						<li>{m.equalizer_device_peq_push_skipped_channel({ count: plan.skippedChannel })}</li>
					{/if}
				</ul>
				{#if plan.clipRisk}
					<p
						class="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-base-content"
					>
						{m.equalizer_device_peq_push_clip_risk()}
					</p>
				{/if}
				{#if plan.infeasible}
					<p
						class="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-base-content"
					>
						{m.equalizer_device_peq_push_infeasible()}
					</p>
				{/if}
			{/if}

			<div class="flex justify-end gap-2">
				<Button
					title={m.equalizer_device_peq_push_cancel()}
					variant="ghost"
					size="sm"
					onclick={() => (open = false)}
				>
					{m.equalizer_device_peq_push_cancel()}
				</Button>
				<Button
					title={m.equalizer_device_peq_push_confirm()}
					variant="primary"
					size="sm"
					onclick={confirm}
				>
					{m.equalizer_device_peq_push_confirm()}
				</Button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
