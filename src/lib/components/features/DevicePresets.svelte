<!--
	The device's own preset list, for a device that edits it (`devicePeqStore.canEditPresets`: the
	Topping DX5 II and DX9 Discrete): a row under Device EQ with New, Rename and Delete. Rename and
	Delete act on the preset Device EQ shows, so the row needs no list of its own; each asks in a
	dialog first. Their results go to the panel's status line, as every device operation's do.
-->
<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { devicePeqService } from '#lib/services/device-peq-service.svelte.js';
	import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
	import Button from '../atoms/Button.svelte';
	import Dialog from '../atoms/Dialog.svelte';
	import InfoPopover from '../atoms/InfoPopover.svelte';
	import Input from '../atoms/Input.svelte';
	import { deviceRowClass } from './device-rows.js';

	const busy = $derived(devicePeqStore.isBusy);
	const count = $derived(devicePeqStore.slots.length);
	const room = $derived(devicePeqStore.slotRoom);
	const full = $derived(room !== null && count >= room);
	/** The preset Device EQ shows, when it is one of the device's own: what Rename and Delete act on. */
	const shown = $derived.by(() => {
		const selection = devicePeqStore.selection;
		return typeof selection === 'number'
			? devicePeqStore.slots.find((s) => s.id === selection)
			: undefined;
	});

	let renaming = $state(false);
	let deleting = $state(false);
	let newName = $state('');
	/** The device refused the name just tried: said in the dialog, which stays open. */
	let refused = $state(false);

	function startRename() {
		if (!shown) return;
		newName = shown.name;
		refused = false;
		renaming = true;
	}

	/** A failure other than the name (the connection, say) closes it: its toast says what went wrong. */
	async function rename() {
		if (!shown) return;
		refused = (await devicePeqService.renamePreset(shown.id, newName)) === 'refused';
		if (!refused) renaming = false;
	}

	function remove() {
		deleting = false;
		if (shown) void devicePeqService.deletePreset(shown.id);
	}

	const newHint = $derived(
		full
			? m.device_presets_full()
			: room !== null
				? m.device_presets_count({ count, max: room })
				: undefined
	);
	const pickFirst = $derived(shown ? undefined : m.device_presets_pick_first());
</script>

<div class={deviceRowClass}>
	<span class="flex items-center">
		{m.device_presets_label()}
		<InfoPopover label={m.info_popover_about({ topic: m.device_presets_label() })} class="ml-0.5">
			<p>{m.device_presets_hint()}</p>
			{#if room !== null}
				<p>{m.device_presets_count({ count, max: room })}</p>
			{/if}
		</InfoPopover>
	</span>
	<span class="flex gap-1">
		<Button
			label={m.device_presets_new()}
			hint={newHint}
			variant="outline"
			size="xs"
			class="flex-1"
			disabled={busy || full}
			onclick={() => void devicePeqService.createPreset()}
		/>
		<Button
			label={m.device_presets_rename()}
			hint={pickFirst}
			variant="outline"
			size="xs"
			class="flex-1"
			disabled={busy || !shown}
			onclick={startRename}
		/>
		<Button
			label={m.device_presets_delete()}
			hint={pickFirst ?? (count <= 1 ? m.device_presets_last() : undefined)}
			variant="outline"
			size="xs"
			class="flex-1"
			disabled={busy || !shown || count <= 1}
			onclick={() => (deleting = true)}
		/>
	</span>
</div>

<Dialog
	bind:open={renaming}
	title={m.device_presets_rename_title({ name: shown?.name ?? '' })}
	description={m.device_presets_rename_body()}
>
	<form
		id="device-preset-rename"
		class="flex flex-col gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			void rename();
		}}
	>
		<Input
			label={m.device_presets_name()}
			bind:value={newName}
			class="items-center gap-2"
			aria-invalid={refused}
			aria-describedby={refused ? 'device-preset-rename-refused' : undefined}
			maxlength={64}
			disabled={busy}
		/>
		{#if refused}
			<p id="device-preset-rename-refused" role="alert" class="text-sm text-base-content">
				{m.device_presets_name_refused()}
			</p>
		{/if}
	</form>
	{#snippet actions()}
		<Button label={m.device_presets_cancel()} variant="ghost" onclick={() => (renaming = false)} />
		<Button
			label={m.device_presets_rename()}
			variant="primary"
			type="submit"
			form="device-preset-rename"
			disabled={busy || newName.trim() === ''}
		/>
	{/snippet}
</Dialog>

<Dialog
	bind:open={deleting}
	title={m.device_presets_delete_title({ name: shown?.name ?? '' })}
	description={m.device_presets_delete_body({ device: devicePeqStore.deviceName ?? '' })}
>
	{#snippet actions()}
		<Button label={m.device_presets_cancel()} variant="ghost" onclick={() => (deleting = false)} />
		<Button label={m.device_presets_delete()} variant="destructive" onclick={remove} />
	{/snippet}
</Dialog>
