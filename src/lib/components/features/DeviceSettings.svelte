<!--
	A device's own settings as rows (eqcaps `protocol.controls`), one each in the order given: a
	toggle is a switch, a choice a dropdown (as Device EQ is), a range a slider that writes once let
	go, and a range of two or three values a segmented choice. A setting is written when the user
	changes it, and its row shows what the device holds: the value follows the read-back, not the
	press. One that restarts the device asks first. A gain per channel is one balance slider, in the
	left channel's place. The caller brings the list (the EQ's settings, or the device's) and says
	when it is `disabled`. While the device is busy the rows keep focus and take no change, but a
	slider still moves, and the value it is let go on is written once the device is free (by the
	service, so a panel switch doesn't drop it). The same mapping as uniPEQ's, so a device looks the
	same in both.
-->
<script lang="ts">
	import type { Control } from '@potatosalad775/eqcaps-core';
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
	/** A slider's value while it is dragged; once let go, the service holds it till it is written. */
	const moving = new SvelteMap<string, number>();

	const values = $derived(devicePeqStore.controlValues);
	const busy = $derived(devicePeqStore.isBusy);
	/** A label dims with its control, but not for the moment an operation takes. */
	const dim = $derived(disabled ? 'opacity-60' : '');
	const balance = $derived(balanceOf(controls));

	const current = (c: Control) => values[c.id] ?? 0;
	/** Where a slider rests: on a value let go that the device doesn't have yet, else the device's. */
	const settled = (id: string, device: number) => devicePeqService.heldSetting(id) ?? device;
	const shown = (id: string, device: number) => moving.get(id) ?? settled(id, device);

	async function set(control: Control, value: number) {
		if (busy || value === values[control.id]) return;
		if (control.reconnect) pending = { control, value };
		else await devicePeqService.setControl(control.id, value);
	}

	/** Write `value` once the device is free, now if it is. */
	function setWhenFree(control: Control, value: number) {
		devicePeqService.setWhenFree(control.id, value, async () => {
			if (devicePeqStore.controlValues[control.id] !== value) {
				await devicePeqService.setControl(control.id, value);
			}
		});
	}

	/** A slider let go on `value`. One that restarts the device asks first. */
	function release(control: Control, value: number) {
		if (control.reconnect) pending = { control, value };
		else setWhenFree(control, value);
	}

	function hint(control: Control): string | undefined {
		if (devicePeqStore.eqOffBy.includes(control)) return m.device_control_eq_off_hint();
		if (control.reconnect) return m.device_control_restart_hint();
		return undefined;
	}

	function confirm() {
		const change = pending;
		pending = null;
		if (change) setWhenFree(change.control, change.value);
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
	write: (value: number) => void,
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
					// A drag let go where it began fires no `change`: back there, nothing moves.
					if (next === settled(id, device)) moving.delete(id);
					else moving.set(id, next);
				}}
				onchange={() => {
					const next = moving.get(id);
					moving.delete(id);
					if (next !== undefined) write(next);
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
			(n) =>
				devicePeqService.setWhenFree('balance', n, () =>
					devicePeqService.setControls(balanceWrites(balance, n, devicePeqStore.controlValues))
				),
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
			(next) => release(control, next)
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
