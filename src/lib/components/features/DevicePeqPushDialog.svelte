<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import type { PlanChange, PushPlan } from '#lib/device-peq/push-plan.js';
	import Button from '../atoms/Button.svelte';
	import Dialog from '../atoms/Dialog.svelte';

	/**
	 * Shown before a push whenever the device can't hold the EQ on screen as it is: what eqcaps'
	 * `fit` moved, which bands have no slot, what per-channel bands stay behind, and whether the
	 * result may clip. Nothing is written until the user says so.
	 */
	let {
		open = $bindable(false),
		plan,
		deviceName,
		blocked = false,
		onConfirm,
		onCancel
	}: {
		open?: boolean;
		plan: PushPlan | null;
		deviceName: string;
		/** The device is busy for a moment: Write waits, as the panel's own does. */
		blocked?: boolean;
		onConfirm: () => void;
		/** Closed without writing: Cancel, Escape or a click outside. uniPEQ's review needs the no. */
		onCancel?: () => void;
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
		const change =
			c.kind === 'preamp'
				? m.equalizer_device_peq_push_preamp({
						wanted: show(c.wanted, ' dB'),
						written: show(c.written, ' dB')
					})
				: c.kind === 'dropped'
					? m.equalizer_device_peq_push_dropped({ band: c.band })
					: m.equalizer_device_peq_push_change({
							band: c.band,
							field: FIELD_LABEL[c.field](),
							wanted: show(c.wanted, UNIT[c.field]),
							written: show(c.written, UNIT[c.field])
						});
		if (!c.ear) return change;
		const ear = c.ear === 'L' ? m.eq_channel_left() : m.eq_channel_right();
		return m.equalizer_device_peq_push_ear({ change, ear });
	}

	function confirm() {
		open = false;
		onConfirm();
	}

	function cancel() {
		open = false;
		onCancel?.();
	}
</script>

<!-- `onOpenChange` fires for Escape and outside clicks only, not for the assignments above. -->
<Dialog
	bind:open
	onOpenChange={(next) => !next && onCancel?.()}
	title={m.equalizer_device_peq_push_title({ device: deviceName })}
	description={m.equalizer_device_peq_push_intro()}
	class="max-h-[85dvh]"
>
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
	{#snippet actions()}
		<Button
			label={m.equalizer_device_peq_push_cancel()}
			variant="ghost"
			size="sm"
			onclick={cancel}
		/>
		<Button
			label={m.equalizer_device_peq_push_confirm()}
			variant="primary"
			size="sm"
			{blocked}
			onclick={confirm}
		/>
	{/snippet}
</Dialog>
