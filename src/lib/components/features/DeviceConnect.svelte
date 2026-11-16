<script lang="ts">
	import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
	import { devicePeqService, type DeviceKind } from '#lib/services/device-peq-service.svelte.js';
	import { NETWORK_DEVICE_TYPES, type NetworkDeviceType } from '#lib/device-peq/network-types.js';
	import { describeNetworkHostProblem } from '#lib/device-peq/errors.js';
	import { parseNetworkHost } from '#lib/device-peq/network-host.js';
	import * as m from '#lib/paraglide/messages.js';
	import { CircleAlert } from '@lucide/svelte';
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
	/** Why the last attempt at the typed address did not connect, shown beside the field. */
	let networkError = $state<string | null>(null);
	const networkFieldId = $props.id();
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

	/**
	 * Enter or Connect. The address is checked here for the message beside the field; the network
	 * functions check it again before any request. A connection replaces this whole component, so
	 * the form is left open: it only stays on screen when the connection did not happen.
	 */
	async function connectNetwork(e: SubmitEvent) {
		e.preventDefault();
		if (devicePeqStore.isConnecting) return;
		const parsed = parseNetworkHost(networkIP);
		if (!parsed.ok) {
			networkError = describeNetworkHostProblem(parsed.problem);
			return;
		}
		networkError = null;
		await devicePeqService.connectNetwork(networkIP, networkDeviceType);
		if (!devicePeqStore.connection && devicePeqStore.statusIsError) {
			networkError = devicePeqStore.statusMessage;
		}
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
						label={m.equalizer_device_peq_push_cancel()}
						variant="ghost"
						size="xs"
						onclick={() => devicePeqService.cancelPick()}
					/>
					<Button
						label={m.equalizer_device_peq_choose_confirm()}
						variant="primary"
						size="xs"
						disabled={!chosenId || devicePeqStore.isConnecting}
						onclick={confirmChoice}
					/>
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
						label={devicePeqStore.isConnecting
							? m.equalizer_device_peq_connecting()
							: KIND_LABEL[primaryKind]()}
						variant="primary"
						size="sm"
						class="w-full"
						disabled={devicePeqStore.isConnecting}
						onclick={() => connect(primaryKind)}
					/>
				{/if}
				<div class="flex flex-wrap items-center gap-1 text-xs text-base-content/60">
					<span>{m.equalizer_device_peq_other_connections()}</span>
					{#each otherKinds as kind (kind)}
						<Button
							label={KIND_LABEL[kind]()}
							variant="ghost"
							size="xs"
							disabled={devicePeqStore.isConnecting}
							onclick={() => connect(kind)}
						/>
					{/each}
					<Button
						label={m.equalizer_device_peq_connect_network()}
						variant="ghost"
						size="xs"
						aria-expanded={showNetworkPanel}
						onclick={() => (showNetworkPanel = !showNetworkPanel)}
					/>
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
				<form class="flex flex-col gap-1" novalidate onsubmit={connectNetwork}>
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
							autocomplete="off"
							autocapitalize="none"
							spellcheck={false}
							enterkeyhint="go"
							placeholder={m.equalizer_device_peq_network_ip()}
							aria-label={m.equalizer_device_peq_network_ip()}
							aria-invalid={networkError ? 'true' : undefined}
							aria-describedby="{networkFieldId}-{networkError ? 'error' : 'hint'}"
							bind:value={networkIP}
							oninput={() => (networkError = null)}
							class="min-w-0 flex-1 rounded border bg-base-200 px-2 py-1 text-xs {networkError
								? 'border-error'
								: 'border-base-content/20'}"
						/>
						<Button
							type="submit"
							label={m.equalizer_device_peq_network_connect()}
							variant="outline"
							size="xs"
							disabled={!networkIP.trim() || devicePeqStore.isConnecting}
						/>
					</div>
					{#if networkError}
						<p
							id="{networkFieldId}-error"
							class="flex items-start gap-1 text-xs text-base-content"
							role="alert"
						>
							<CircleAlert class="mt-px size-3.5 shrink-0 text-error" aria-hidden="true" />
							<span>{networkError}</span>
						</p>
					{:else}
						<p id="{networkFieldId}-hint" class="text-xs text-base-content/60">
							{m.equalizer_device_peq_network_ip_hint()}
						</p>
					{/if}
				</form>
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

		{#if devicePeqStore.statusMessage && devicePeqStore.statusMessage !== networkError}
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
