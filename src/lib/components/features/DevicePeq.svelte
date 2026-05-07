<script lang="ts">
	import { devicePeqStore } from '$lib/stores/device-peq-store.svelte.js';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { eqConstraintsStore } from '$lib/stores/eq-constraints-store.svelte.js';
	import { eqCommands } from '$lib/services/eq-commands.js';
	import { deriveDeviceConstraint } from '$lib/device-peq/derive-constraint.js';
	import * as m from '$lib/paraglide/messages.js';
	import { Info } from '@lucide/svelte';
	import DevicePeqInfoDialog from './DevicePeqInfoDialog.svelte';

	// Sync the connected device's hardware capabilities into the constraint
	// store as a synthetic preset, auto-selected while the device is
	// connected. Disconnect restores whichever preset the user had picked.
	// Re-clamping is pushed as a single undoable command in eqCommands.
	$effect(() => {
		const dev = devicePeqStore.device;
		if (dev) {
			eqConstraintsStore.setDeviceConstraint(deriveDeviceConstraint(dev));
		} else {
			eqConstraintsStore.clearDeviceConstraint();
		}
		eqCommands.reclampToActiveConstraint();
	});

	// ── Feature detection ─────────────────────────────────────────────────────

	const hasHid = typeof navigator !== 'undefined' && 'hid' in navigator;
	const hasSerial = typeof navigator !== 'undefined' && 'serial' in navigator;
	const hasBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
	const hasDeviceApi = hasHid || hasSerial || hasBluetooth;

	// ── State ─────────────────────────────────────────────────────────────────

	let showNetworkPanel = $state(false);
	let networkIP = $state('');
	let networkDeviceType = $state('WiiM');
	let showInfo = $state(false);

	// ── Connection handlers ───────────────────────────────────────────────────

	async function connectHid() {
		devicePeqStore.isConnecting = true;
		try {
			const { getHidConfig } = await import('$lib/device-peq/registry.js');
			const { getDeviceConnected, getAvailableSlots, getCurrentSlot } =
				await import('$lib/device-peq/connectors/usb-hid-connector.js');
			const config = await getHidConfig();
			const device = await getDeviceConnected(config);
			if (!device) {
				devicePeqStore.isConnecting = false;
				return;
			}
			const slots = getAvailableSlots(device);
			const currentSlot = await getCurrentSlot(device);
			devicePeqStore.setConnected(device, slots, currentSlot);
		} catch (e) {
			console.error('Failed to connect HID device:', e);
			devicePeqStore.isConnecting = false;
			devicePeqStore.setStatus('Connection failed');
		}
	}

	async function connectSerial() {
		devicePeqStore.isConnecting = true;
		try {
			const { getSerialConfig } = await import('$lib/device-peq/registry.js');
			const { getDeviceConnected, getAvailableSlots, getCurrentSlot } =
				await import('$lib/device-peq/connectors/usb-serial-connector.js');
			const config = await getSerialConfig();
			const device = await getDeviceConnected(config);
			if (!device) {
				devicePeqStore.isConnecting = false;
				return;
			}
			const slots = getAvailableSlots(device);
			const currentSlot = await getCurrentSlot(device);
			devicePeqStore.setConnected(device, slots, currentSlot);
		} catch (e) {
			console.error('Failed to connect serial device:', e);
			devicePeqStore.isConnecting = false;
			devicePeqStore.setStatus('Connection failed');
		}
	}

	async function connectBle() {
		devicePeqStore.isConnecting = true;
		try {
			const { getBleConfig } = await import('$lib/device-peq/registry.js');
			const { getDeviceConnected, getAvailableSlots, getCurrentSlot } =
				await import('$lib/device-peq/connectors/bluetooth-ble-connector.js');
			const config = await getBleConfig();
			const device = await getDeviceConnected(config);
			if (!device) {
				devicePeqStore.isConnecting = false;
				return;
			}
			const slots = getAvailableSlots(device);
			const currentSlot = await getCurrentSlot(device);
			devicePeqStore.setConnected(device, slots, currentSlot);
		} catch (e) {
			console.error('Failed to connect BLE device:', e);
			devicePeqStore.isConnecting = false;
			devicePeqStore.setStatus('Connection failed');
		}
	}

	async function connectNetwork() {
		if (!networkIP.trim()) return;
		devicePeqStore.isConnecting = true;
		try {
			const { getDeviceConnected, getCurrentSlot } =
				await import('$lib/device-peq/connectors/network-connector.js');
			const device = await getDeviceConnected(networkIP.trim(), networkDeviceType);
			if (!device) {
				devicePeqStore.isConnecting = false;
				return;
			}
			const slots = device.modelConfig.availableSlots;
			const currentSlot = await getCurrentSlot(device);
			devicePeqStore.setConnected(device, slots, currentSlot);
		} catch (e) {
			console.error('Failed to connect network device:', e);
			devicePeqStore.isConnecting = false;
			devicePeqStore.setStatus('Connection failed');
		}
	}

	// ── Connector resolver ────────────────────────────────────────────────────

	async function getConnector(connectionType: string) {
		if (connectionType === 'hid') {
			return await import('$lib/device-peq/connectors/usb-hid-connector.js');
		}
		if (connectionType === 'serial') {
			return await import('$lib/device-peq/connectors/usb-serial-connector.js');
		}
		if (connectionType === 'ble') {
			return await import('$lib/device-peq/connectors/bluetooth-ble-connector.js');
		}
		return await import('$lib/device-peq/connectors/network-connector.js');
	}

	// ── Pull / Push / Disconnect ──────────────────────────────────────────────

	async function pullFromDevice() {
		const device = devicePeqStore.device;
		if (!device) return;
		devicePeqStore.isReading = true;
		try {
			const connector = await getConnector(device.connectionType);
			const result = await connector.pullFromDevice(device, devicePeqStore.activeSlot ?? 0);
			eqCommands.replaceFilters(
				result.filters.map((f: any) => ({
					enabled: !f.disabled,
					type: f.type,
					freq: f.freq,
					q: f.q,
					gain: f.gain
				}))
			);
			devicePeqStore.setStatus(`Read ${result.filters.length} filters from device`);
		} catch (e) {
			console.error('Failed to pull from device:', e);
			devicePeqStore.setStatus('Read failed');
		} finally {
			devicePeqStore.isReading = false;
		}
	}

	async function pushToDevice() {
		const device = devicePeqStore.device;
		if (!device) return;
		devicePeqStore.isWriting = true;
		try {
			const connector = await getConnector(device.connectionType);
			const filters = eqStore.filters
				.filter((f) => f.freq != null && f.q != null && f.gain != null)
				.map((f: any) => ({
					type: f.type,
					freq: f.freq,
					q: f.q,
					gain: f.gain,
					disabled: !f.enabled
				}));
			const preamp = -Math.max(0, ...filters.map((f: any) => f.gain));
			const shouldDisconnect = await connector.pushToDevice(
				device,
				devicePeqStore.activeSlot ?? 0,
				preamp,
				filters
			);
			devicePeqStore.setStatus(`Wrote ${filters.length} filters to device`);
			if (shouldDisconnect) {
				await disconnect();
			}
		} catch (e) {
			console.error('Failed to push to device:', e);
			devicePeqStore.setStatus('Write failed');
		} finally {
			devicePeqStore.isWriting = false;
		}
	}

	async function disconnect() {
		const device = devicePeqStore.device;
		if (!device) return;
		try {
			const connector = await getConnector(device.connectionType);
			await connector.disconnectDevice();
		} catch (e) {
			console.error('Failed to disconnect:', e);
		}
		devicePeqStore.setDisconnected();
	}

	// ── Slot change ───────────────────────────────────────────────────────────

	async function onSlotChange(slotId: number) {
		const device = devicePeqStore.device;
		if (!device) return;
		devicePeqStore.activeSlot = slotId;
		try {
			const connector = await getConnector(device.connectionType);
			await connector.enablePEQ(device, true, slotId);
		} catch (e) {
			console.error('Failed to change slot:', e);
		}
	}

	// ── UI helpers ────────────────────────────────────────────────────────────

	function toggleNetworkPanel() {
		showNetworkPanel = !showNetworkPanel;
	}
</script>

{#if hasDeviceApi}
	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between text-xs text-base-content/60">
			<span>{m.equalizer_device_peq_info_prompt()}</span>
			<button
				type="button"
				onclick={() => (showInfo = true)}
				aria-label={m.equalizer_device_peq_info_trigger_label()}
				class="rounded p-1 text-base-content/60 transition-colors hover:bg-base-content/10 hover:text-base-content focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
			>
				<Info class="h-4 w-4" />
			</button>
		</div>
		{#if !devicePeqStore.isConnected}
			<!-- Connect buttons -->
			<div class="flex gap-1">
				{#if hasHid}
					<button
						onclick={connectHid}
						disabled={devicePeqStore.isConnecting}
						class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs transition-colors hover:bg-base-300 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
					>
						{devicePeqStore.isConnecting ? 'Connecting...' : 'USB (HID)'}
					</button>
				{/if}
				{#if hasSerial}
					<button
						onclick={connectSerial}
						disabled={devicePeqStore.isConnecting}
						class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs transition-colors hover:bg-base-300 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
					>
						{devicePeqStore.isConnecting ? 'Connecting...' : 'USB (Serial)'}
					</button>
				{/if}
				{#if hasBluetooth}
					<button
						onclick={connectBle}
						disabled={devicePeqStore.isConnecting}
						class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs text-base-content/60 transition-colors hover:bg-base-300 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
					>
						{devicePeqStore.isConnecting ? 'Connecting...' : 'Bluetooth'}
					</button>
				{/if}
				<button
					onclick={toggleNetworkPanel}
					class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs transition-colors hover:bg-base-300 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
				>
					Network
				</button>
			</div>

			{#if showNetworkPanel}
				<div class="flex gap-1">
					<select
						value={networkDeviceType}
						onchange={(e) => (networkDeviceType = (e.target as HTMLSelectElement).value)}
						class="rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs"
					>
						<option value="WiiM">WiiM</option>
						<option value="LuxsinX9">Luxsin X9</option>
					</select>
					<input
						type="text"
						placeholder="Device IP"
						value={networkIP}
						oninput={(e) => (networkIP = (e.target as HTMLInputElement).value)}
						class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs"
					/>
					<button
						onclick={connectNetwork}
						disabled={devicePeqStore.isConnecting}
						class="rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs transition-colors hover:bg-base-300 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
					>
						Connect
					</button>
				</div>
			{/if}
		{:else}
			<!-- Connected state -->
			<div class="flex items-center justify-between text-xs">
				<span class="font-medium" title={devicePeqStore.manufacturer ?? ''}>
					{devicePeqStore.deviceName}
				</span>
				<button
					onclick={disconnect}
					class="rounded border border-error/40 px-2 py-0.5 text-xs text-error hover:bg-error/10"
				>
					Disconnect
				</button>
			</div>

			<!-- Slot selector -->
			{#if devicePeqStore.slots.length > 0}
				<select
					value={devicePeqStore.activeSlot ?? ''}
					onchange={(e) => onSlotChange(Number((e.target as HTMLSelectElement).value))}
					class="w-full rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs"
				>
					{#each devicePeqStore.slots as slot (slot.id)}
						<option value={slot.id}>{slot.name}</option>
					{/each}
				</select>
			{/if}

			<!-- Pull / Push buttons -->
			<div class="flex gap-1">
				<button
					onclick={pullFromDevice}
					disabled={devicePeqStore.isReading || devicePeqStore.isWriting}
					class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs transition-colors hover:bg-base-300 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
				>
					{devicePeqStore.isReading ? 'Reading...' : 'Pull from Device'}
				</button>
				<button
					onclick={pushToDevice}
					disabled={devicePeqStore.isReading || devicePeqStore.isWriting}
					class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs transition-colors hover:bg-base-300 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
				>
					{devicePeqStore.isWriting ? 'Writing...' : 'Push to Device'}
				</button>
			</div>
		{/if}

		<!-- Status message -->
		{#if devicePeqStore.statusMessage}
			<p class="text-xs text-base-content/60">{devicePeqStore.statusMessage}</p>
		{/if}
	</div>
{:else}
	<div class="flex flex-col gap-2">
		<div class="flex items-start justify-between gap-2">
			<p class="text-xs text-base-content/60">
				{m.equalizer_device_peq_incompatible_browser_alert()}
			</p>
			<button
				type="button"
				onclick={() => (showInfo = true)}
				aria-label={m.equalizer_device_peq_info_trigger_label()}
				class="shrink-0 rounded p-1 text-base-content/60 transition-colors hover:bg-base-content/10 hover:text-base-content focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
			>
				<Info class="h-4 w-4" />
			</button>
		</div>
	</div>
{/if}

<DevicePeqInfoDialog bind:open={showInfo} />
