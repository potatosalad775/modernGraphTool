<script lang="ts">
	import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
	import { devicePeqService, type DeviceKind } from '#lib/services/device-peq-service.svelte.js';
	import { NETWORK_DEVICE_TYPES, type NetworkDeviceType } from '#lib/device-peq/network-types.js';
	import * as m from '#lib/paraglide/messages.js';
	import Button from '../atoms/Button.svelte';
	import InfoPopover from '../atoms/InfoPopover.svelte';

	/** Hardware EQ before a device is connected in this browser: the ways to connect one. */

	/** The eqcaps inspector: identifies a device and turns it into a profile. */
	const INSPECTOR_URL = 'https://potatosalad775.github.io/eqcaps/connect';
	/** The inspector's catalog, narrowed to hardware: the devices this panel can look up. */
	const CATALOG_URL = 'https://potatosalad775.github.io/eqcaps/?kind=hardware';

	// ── Feature detection ─────────────────────────────────────────────────────

	const hasHid = typeof navigator !== 'undefined' && 'hid' in navigator;
	const hasSerial = typeof navigator !== 'undefined' && 'serial' in navigator;
	const hasBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
	const hasDeviceApi = hasHid || hasSerial || hasBluetooth;

	const KIND_LABEL: Record<DeviceKind, () => string> = {
		hid: m.equalizer_device_peq_connect_usb,
		serial: m.equalizer_device_peq_connect_serial,
		ble: m.equalizer_device_peq_connect_bluetooth
	};
	/** USB HID covers most dongles and DACs, so it leads; the rest sit one step back. */
	const available: DeviceKind[] = [
		...(hasHid ? (['hid'] as const) : []),
		...(hasSerial ? (['serial'] as const) : []),
		...(hasBluetooth ? (['ble'] as const) : [])
	];
	const primaryKind = available[0];
	const otherKinds = available.slice(1);

	// ── State ─────────────────────────────────────────────────────────────────

	let showNetworkPanel = $state(false);
	let networkIP = $state('');
	let networkDeviceType = $state<NetworkDeviceType>('WiiM');
	let chosenId = $state('');
	/** The last device that had no profile and no protocol, for the "help add it" notice. */
	let unsupported = $state(false);

	const choice = $derived(devicePeqStore.choice);

	async function connect(kind: DeviceKind) {
		unsupported = false;
		settle(await devicePeqService.connect(kind));
	}

	async function confirmChoice() {
		if (!chosenId) return;
		settle(await devicePeqService.pick(chosenId));
	}

	function settle(result: 'unsupported' | void) {
		unsupported = result === 'unsupported';
		chosenId = devicePeqStore.choice?.candidates[0]?.id ?? '';
	}

	async function connectNetwork() {
		await devicePeqService.connectNetwork(networkIP, networkDeviceType);
		showNetworkPanel = false;
	}

	const warm = () => devicePeqService.warm();
</script>

{#snippet catalogLink()}
	<a
		href={CATALOG_URL}
		target="_blank"
		rel="noopener noreferrer"
		class="self-start text-xs text-primary underline-offset-4 hover:underline"
	>
		{m.equalizer_device_peq_supported_devices()}
	</a>
{/snippet}

{#if hasDeviceApi}
	<div class="flex flex-col gap-2">
		{#if choice}
			<!-- Several profiles fit this device's identity, or a serial port named none -->
			<div class="flex flex-col gap-1.5 rounded-md border border-base-content/15 p-2">
				<label class="flex flex-col gap-1 text-xs text-base-content/70">
					{m.equalizer_device_peq_choose_prompt()}
					<select
						bind:value={chosenId}
						class="rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs text-base-content"
					>
						{#each choice.candidates as c (c.id)}
							<option value={c.id}>{c.label}</option>
						{/each}
					</select>
				</label>
				<div class="flex justify-end gap-1">
					<Button
						title={m.equalizer_device_peq_push_cancel()}
						variant="ghost"
						size="xs"
						onclick={() => devicePeqService.cancelPick()}
					>
						{m.equalizer_device_peq_push_cancel()}
					</Button>
					<Button
						title={m.equalizer_device_peq_choose_confirm()}
						variant="primary"
						size="xs"
						disabled={!chosenId || devicePeqStore.isConnecting}
						onclick={confirmChoice}
					>
						{m.equalizer_device_peq_choose_confirm()}
					</Button>
				</div>
			</div>
		{:else}
			<!-- Connect: one obvious way in; the other transports one step back -->
			<div
				class="flex flex-col gap-1.5"
				role="group"
				aria-label={m.equalizer_device_peq_label()}
				onpointerenter={warm}
				onfocusin={warm}
			>
				{#if primaryKind}
					<Button
						title={KIND_LABEL[primaryKind]()}
						variant="primary"
						size="sm"
						class="w-full"
						disabled={devicePeqStore.isConnecting}
						onclick={() => connect(primaryKind)}
					>
						{devicePeqStore.isConnecting
							? m.equalizer_device_peq_connecting()
							: KIND_LABEL[primaryKind]()}
					</Button>
				{/if}
				<div class="flex flex-wrap items-center gap-1 text-xs text-base-content/60">
					<span>{m.equalizer_device_peq_other_connections()}</span>
					{#each otherKinds as kind (kind)}
						<Button
							title={KIND_LABEL[kind]()}
							variant="ghost"
							size="xs"
							disabled={devicePeqStore.isConnecting}
							onclick={() => connect(kind)}
						>
							{KIND_LABEL[kind]()}
						</Button>
					{/each}
					<Button
						title={m.equalizer_device_peq_connect_network()}
						variant="ghost"
						size="xs"
						aria-expanded={showNetworkPanel}
						onclick={() => (showNetworkPanel = !showNetworkPanel)}
					>
						{m.equalizer_device_peq_connect_network()}
					</Button>
					<InfoPopover
						label={m.info_popover_about({ topic: m.equalizer_device_peq_connections_topic() })}
						align="end"
					>
						<p>{m.equalizer_device_peq_transport_hid()}</p>
						<p>{m.equalizer_device_peq_transport_serial()}</p>
						<p>{m.equalizer_device_peq_transport_ble()}</p>
						<p>{m.equalizer_device_peq_transport_network()}</p>

						<!-- Before a device is picked: whether it is one this panel can drive -->
						{@render catalogLink()}
					</InfoPopover>
				</div>
			</div>

			{#if showNetworkPanel}
				<div class="flex gap-1">
					<select
						bind:value={networkDeviceType}
						aria-label={m.equalizer_device_peq_network_type()}
						class="rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs"
					>
						{#each NETWORK_DEVICE_TYPES as t (t.id)}
							<option value={t.id}>{t.label}</option>
						{/each}
					</select>
					<input
						type="text"
						placeholder={m.equalizer_device_peq_network_ip()}
						aria-label={m.equalizer_device_peq_network_ip()}
						bind:value={networkIP}
						class="min-w-0 flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs"
					/>
					<Button
						title={m.equalizer_device_peq_network_connect()}
						variant="outline"
						size="xs"
						disabled={!networkIP.trim()}
						onclick={connectNetwork}
					>
						{m.equalizer_device_peq_network_connect()}
					</Button>
				</div>
			{/if}

			{#if unsupported}
				<p class="text-xs text-base-content/70">
					{m.equalizer_device_peq_unsupported()}
					<a
						href={INSPECTOR_URL}
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary underline-offset-4 hover:underline"
					>
						{m.equalizer_device_peq_help_add()}
					</a>
				</p>
			{/if}
		{/if}

		{#if devicePeqStore.statusMessage}
			<p class="text-xs text-base-content/70" role="status">{devicePeqStore.statusMessage}</p>
		{/if}
	</div>
{:else}
	<div class="flex flex-col gap-2">
		<p class="text-xs text-base-content/60">
			{m.equalizer_device_peq_incompatible_browser_alert()}
		</p>
		{@render catalogLink()}
	</div>
{/if}
