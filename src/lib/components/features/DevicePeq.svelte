<script lang="ts">
	import { devicePeqStore } from '$lib/stores/device-peq-store.svelte.js';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import type { ConnectedDevice, DeviceSlot } from '$lib/device-peq/types.js';

	// ── Feature detection ─────────────────────────────────────────────────────

	const hasHid = typeof navigator !== 'undefined' && 'hid' in navigator;
	const hasSerial = typeof navigator !== 'undefined' && 'serial' in navigator;
	const hasDeviceApi = hasHid || hasSerial;

	// ── State ─────────────────────────────────────────────────────────────────

	let showNetworkPanel = $state(false);
	let networkIP = $state('');

	// ── Connection handlers ───────────────────────────────────────────────────

	async function connectHid() {
		devicePeqStore.isConnecting = true;
		try {
			const { getHidConfig } = await import('$lib/device-peq/device-config.js');
			const { getDeviceConnected, getAvailableSlots, getCurrentSlot } = await import(
				'$lib/device-peq/connectors/usb-hid-connector.js'
			);
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
			const { getSerialConfig } = await import('$lib/device-peq/device-config.js');
			const { getDeviceConnected, getAvailableSlots, getCurrentSlot } = await import(
				'$lib/device-peq/connectors/usb-serial-connector.js'
			);
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

	async function connectNetwork() {
		if (!networkIP.trim()) return;
		devicePeqStore.isConnecting = true;
		try {
			const { getDeviceConnected, getCurrentSlot } = await import(
				'$lib/device-peq/connectors/network-connector.js'
			);
			const device = await getDeviceConnected(networkIP.trim(), 'WiiM');
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
			eqStore.filters = result.filters.map((f: any) => ({
				enabled: !f.disabled,
				type: f.type,
				freq: f.freq,
				q: f.q,
				gain: f.gain
			}));
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
		{#if !devicePeqStore.isConnected}
			<!-- Connect buttons -->
			<div class="flex gap-1">
				{#if hasHid}
					<button
						onclick={connectHid}
						disabled={devicePeqStore.isConnecting}
						class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs  transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
					>
						{devicePeqStore.isConnecting ? 'Connecting...' : 'USB (HID)'}
					</button>
				{/if}
				{#if hasSerial}
					<button
						onclick={connectSerial}
						disabled={devicePeqStore.isConnecting}
						class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs  transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
					>
						{devicePeqStore.isConnecting ? 'Connecting...' : 'USB (Serial)'}
					</button>
				{/if}
				<button
					onclick={toggleNetworkPanel}
					class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs  transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
				>
					Network
				</button>
			</div>

			{#if showNetworkPanel}
				<div class="flex gap-1">
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
						class="rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
					>
						Connect
					</button>
				</div>
			{/if}
		{:else}
			<!-- Connected state -->
			<div class="flex items-center justify-between text-xs">
				<span
					class="font-medium "
					title={devicePeqStore.manufacturer ?? ''}
				>
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
					class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs  transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
				>
					{devicePeqStore.isReading ? 'Reading...' : 'Pull from Device'}
				</button>
				<button
					onclick={pushToDevice}
					disabled={devicePeqStore.isReading || devicePeqStore.isWriting}
					class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs  transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
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
{/if}
