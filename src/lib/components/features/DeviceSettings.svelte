<!--
	A device's own settings as rows (eqcaps `protocol.controls`), one each in the order given: a
	toggle is a switch, a choice a dropdown (as Device EQ is), a range a slider that writes once let
	go, and a range of two or three values a segmented choice. A setting is written when the user
	changes it, and its row shows what the device holds: the value follows the read-back, not the
	press. One that restarts the device asks first. A gain per channel is one balance slider, in the
	left channel's place. The caller brings the list (the EQ's settings, or the device's) and says
	when it is `disabled`. While the device is busy the rows keep focus and take no change, but a
	slider still moves, and the value it is let go on is written once the device is free. The same
	mapping as uniPEQ's, so a device looks the same in both.
-->
<script lang="ts">
	import type { Control } from '@potatosalad775/eqcaps-core';
	import { untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { balanceLabel, controlLabel, controlValueLabel } from '#lib/device-peq/control-labels.js';
	import {
		balanceOf,
		balanceValue,
		balanceWrites,
		rangeChoices
	} from '#lib/device-peq/controls.js';
	import * as m from '#lib/paraglide/messages.js';
	import { devicePeqService } from '#lib/services/device-peq-service.svelte.js';
	import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
	import Button from '../atoms/Button.svelte';
	import Dialog from '../atoms/Dialog.svelte';
	import SegmentedControl from '../atoms/SegmentedControl.svelte';
	import Switch from '../atoms/Switch.svelte';
	import { deviceRowClass, deviceSelectClass, deviceSpanClass } from './device-rows.js';

	let {
		controls,
		disabled = false
	}: {
		controls: Control[];
		/** The device would refuse a change now (an EQ's settings while that EQ is off). */
		disabled?: boolean;
	} = $props();

	/** A change that restarts the device, waiting for the user to confirm it. */
	let pending = $state.raw<{ control: Control; value: number } | null>(null);
	type Held =
		| { phase: 'moving'; value: number }
		| { phase: 'queued'; value: number; write: (value: number) => Promise<void> }
		| { phase: 'sent'; value: number };
	const held = new SvelteMap<string, Held>();

	const values = $derived(devicePeqStore.controlValues);
	const busy = $derived(devicePeqStore.isBusy);
	/** A label dims with its control, but not for the moment an operation takes. */
	const dim = $derived(disabled ? 'opacity-60' : '');
	const balance = $derived(balanceOf(controls));

	const current = (c: Control) => values[c.id] ?? 0;
	const shown = (id: string, value: number) => held.get(id)?.value ?? value;

	async function set(control: Control, value: number) {
		if (busy || value === values[control.id]) return;
		if (control.reconnect) pending = { control, value };
		else await devicePeqService.setControl(control.id, value);
	}

	// Held until the device is done setting it: over the link uniPEQ can answer before the status
	// that reads the value back, which says it is still setting one.
	$effect(() => {
		for (const [id, h] of held) {
			if (h.phase === 'sent') {
				if (!devicePeqStore.isSettingControl) held.delete(id);
			} else if (h.phase === 'queued' && !devicePeqStore.isBusy) {
				held.set(id, { phase: 'sent', value: h.value });
				untrack(() => void h.write(h.value));
				// One write at a time: the next waits until this one is done.
				break;
			}
		}
	});

	function hint(control: Control): string | undefined {
		if (devicePeqStore.eqOffBy.includes(control)) return m.device_control_eq_off_hint();
		if (control.reconnect) return m.device_control_restart_hint();
		return undefined;
	}

	function confirm() {
		const change = pending;
		pending = null;
		if (change) void devicePeqService.setControl(change.control.id, change.value);
	}

	const uid = $props.id();
	const sliderClass =
		'h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-base-content/50 accent-accent disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:opacity-60';
</script>

{#snippet slider(
	id: string,
	label: string,
	device: number,
	text: (value: number) => string,
	range: { min: number; max: number; step: number | 'any' },
	write: (value: number) => Promise<void>,
	readout = 'w-12'
)}
	{@const value = shown(id, device)}
	<label class={deviceRowClass}>
		<span class={dim}>{label}</span>
		<span class="flex min-w-0 items-center gap-2">
			<input
				type="range"
				min={range.min}
				max={range.max}
				step={range.step}
				{value}
				{disabled}
				aria-disabled={busy || undefined}
				aria-valuetext={text(value)}
				oninput={(e) => {
					const next = e.currentTarget.valueAsNumber;
					const was = held.get(id);
					// A drag let go where it began fires no `change`.
					if (next === device && !busy) held.delete(id);
					else if (was?.phase === 'queued') held.set(id, { ...was, value: next });
					else held.set(id, { phase: 'moving', value: next });
				}}
				onchange={() => {
					const was = held.get(id);
					if (was) held.set(id, { phase: 'queued', value: was.value, write });
				}}
				class={sliderClass}
			/>
			<span class="{readout} shrink-0 text-right whitespace-nowrap text-base-content tabular-nums">
				{text(value)}
			</span>
		</span>
	</label>
{/snippet}

{#each controls as control (control.id)}
	{@const label = controlLabel(control)}
	{@const choices = rangeChoices(control)}
	{@const note = hint(control)}
	{#if control === balance?.right}
		<!-- Shown with the left channel's. -->
	{:else if balance?.left === control}
		{@render slider(
			'balance',
			m.device_control_balance(),
			balanceValue(balance, values),
			(v) => balanceLabel(balance, v),
			balance,
			(n) => devicePeqService.setControls(balanceWrites(balance, n, values)),
			'w-20'
		)}
	{:else if control.kind === 'toggle'}
		<!-- The label on the left as in every other row; the switch where their controls start. -->
		<div class={deviceRowClass}>
			<label for="{uid}-{control.id}" class={dim}>{label}</label>
			<Switch
				id="{uid}-{control.id}"
				size="sm"
				bind:checked={() => current(control) === 1, (on) => void set(control, on ? 1 : 0)}
				{disabled}
				blocked={busy}
			/>
		</div>
	{:else if control.kind === 'choice'}
		<label class={deviceRowClass}>
			<span class={dim}>{label}</span>
			<select
				value={String(current(control))}
				{disabled}
				aria-disabled={busy || undefined}
				onchange={(e) => {
					const select = e.currentTarget;
					// A refused change leaves the device as it was: show that again.
					void set(control, Number(select.value)).then(
						() => (select.value = String(current(control)))
					);
				}}
				class={deviceSelectClass}
			>
				{#each control.values ?? [] as option (option.value)}
					<option value={String(option.value)}>{option.name}</option>
				{/each}
			</select>
		</label>
	{:else if choices}
		<div class={deviceRowClass}>
			<!-- The unit once, with the name: a unit in each segment leaves a narrow panel no room. -->
			<span class={dim}>{label}{control.unit === 'dB' ? ' (dB)' : ''}</span>
			<!-- The segment follows what the device holds: a write it refuses leaves it where it was. -->
			<SegmentedControl
				{label}
				bind:value={() => String(current(control)), (next) => void set(control, Number(next))}
				options={choices.map((v) => ({
					value: String(v),
					label: String(v),
					title: controlValueLabel(control, v)
				}))}
				{disabled}
				blocked={busy}
				class="w-full"
			/>
		</div>
	{:else if control.range}
		{@const range = control.range}
		{@render slider(
			control.id,
			label,
			current(control),
			(v) => controlValueLabel(control, v),
			{ min: range.min, max: range.max, step: 'step' in range ? range.step : 'any' },
			(next) => set(control, next)
		)}
	{/if}
	{#if note}
		<p class="{deviceSpanClass} -mt-1 text-xs text-base-content/80">{note}</p>
	{/if}
{/each}

<Dialog
	bind:open={
		() => pending !== null,
		(open) => {
			if (!open) pending = null;
		}
	}
	title={pending ? m.device_control_confirm_title({ control: controlLabel(pending.control) }) : ''}
	description={m.device_control_confirm_body()}
>
	{#snippet actions()}
		<Button label={m.device_control_cancel()} variant="ghost" onclick={() => (pending = null)} />
		<Button label={m.device_control_confirm()} variant="primary" onclick={confirm} />
	{/snippet}
</Dialog>
