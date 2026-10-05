<script lang="ts">
	import { devicePeqStore } from '$lib/stores/device-peq-store.svelte.js';
	import { limitsSummaryOf } from '$lib/utils/eq-domain-hint.js';
	import { needsConfirmation, type PushPlan } from '$lib/device-peq/push-plan.js';
	import { devicePeqService } from '$lib/services/device-peq-service.svelte.js';
	import type { ConnectResult } from '$lib/device-peq/connect.js';
	import type { DeviceCandidate, DeviceConnection } from '$lib/device-peq/types.js';
	import { NETWORK_DEVICE_TYPES, type NetworkDeviceType } from '$lib/device-peq/network-types.js';
	import * as m from '$lib/paraglide/messages.js';
	import { Check, CircleAlert, Info, TriangleAlert, Unplug } from '@lucide/svelte';
	import Button from '../atoms/Button.svelte';
	import Switch from '../atoms/Switch.svelte';
	import DevicePeqPushDialog from './DevicePeqPushDialog.svelte';
	import InfoPopover from '../atoms/InfoPopover.svelte';
	import { panelStatus } from '$lib/device-peq/panel-status.js';

	/** The eqcaps inspector: identifies a device and turns it into a profile. */
	const INSPECTOR_URL = 'https://potatosalad775.github.io/eqcaps/connect';
	/** The inspector's catalog, narrowed to hardware: the devices this panel can look up. */
	const CATALOG_URL = 'https://potatosalad775.github.io/eqcaps/?kind=hardware';
	const ISSUES_URL = 'https://github.com/potatosalad775/eqcaps/issues/new';

	// ── Feature detection ─────────────────────────────────────────────────────

	const hasHid = typeof navigator !== 'undefined' && 'hid' in navigator;
	const hasSerial = typeof navigator !== 'undefined' && 'serial' in navigator;
	const hasBluetooth = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
	const hasDeviceApi = hasHid || hasSerial || hasBluetooth;

	type Kind = 'hid' | 'serial' | 'ble';
	const KIND_LABEL: Record<Kind, () => string> = {
		hid: m.equalizer_device_peq_connect_usb,
		serial: m.equalizer_device_peq_connect_serial,
		ble: m.equalizer_device_peq_connect_bluetooth
	};
	/** USB HID covers most dongles and DACs, so it leads; the rest sit one step back. */
	const available: Kind[] = [
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
	/** The device's identity fit several profiles, or none: the user says which it is. */
	let choice = $state.raw<{
		candidates: DeviceCandidate[];
		finish: (id: string) => Promise<ConnectResult>;
		cancel: () => Promise<void>;
	} | null>(null);
	let chosenId = $state('');
	/** The last device that had no profile and no protocol, for the "help add it" notice. */
	let unsupported = $state(false);
	let pendingPlan = $state.raw<PushPlan | null>(null);
	let showPushDialog = $state(false);

	const connection = $derived(devicePeqStore.connection);
	const caps = $derived(connection?.device.capabilities);

	// ── Device EQ: what the device plays, and what Read and Write reach ───────

	/**
	 * One control for what the device plays: its presets, plus Off where the EQ can be switched off.
	 * Picking an entry switches the device. A device that can't switch only gets a target picker,
	 * shown when there is more than one preset to pick from.
	 */
	const eqOptions = $derived.by(() => {
		if (!caps) return [];
		const out: { value: string; label: string; disabled?: boolean }[] = [];
		const selection = devicePeqStore.selection;
		if (selection === null && caps.canEnable) {
			out.push({ value: 'unknown', label: m.equalizer_device_peq_eq_unknown(), disabled: true });
		}
		if (selection === 'other') {
			out.push({ value: 'other', label: m.equalizer_device_peq_eq_other(), disabled: true });
		}
		for (const slot of devicePeqStore.slots) out.push({ value: `p${slot.id}`, label: slot.name });
		if (caps.canEnable) out.push({ value: 'off', label: m.equalizer_device_peq_eq_off() });
		return out;
	});
	/**
	 * Several memories: a dropdown that picks what the device plays (or Off). One memory or none (a
	 * Walkplay dongle keeps a single set of bands): just the EQ on or off, since a "preset" picker
	 * with one entry reads as a choice that isn't there.
	 */
	const hasPresets = $derived(
		!!caps &&
			devicePeqStore.slots.length > 1 &&
			(caps.canEnable || caps.readsSlot || caps.writesSlot)
	);
	const hasOnOff = $derived(!!caps?.canEnable && devicePeqStore.slots.length <= 1);
	const eqLabel = $derived(
		caps?.canEnable ? m.equalizer_device_peq_eq_label() : m.equalizer_device_peq_preset()
	);
	const eqValue = $derived.by(() => {
		const selection = devicePeqStore.selection;
		if (selection === null) return caps?.canEnable ? 'unknown' : '';
		if (selection === 'off' || selection === 'other') return selection;
		return `p${selection}`;
	});

	const readTarget = $derived(devicePeqStore.readTarget);
	const writeTarget = $derived(devicePeqStore.writeTarget);
	const inSync = $derived(devicePeqStore.inSync);
	/** Auto-write needs a device that can be written without restarting after each save. */
	const canAutoWrite = $derived(!!caps?.canWrite && !caps.disconnectOnSave);

	const limitsSummary = $derived(connection ? limitsSummaryOf(connection.profile) : '');

	// ── What's worth knowing about the profile: one popover in the device row ──

	const isDraft = $derived(
		connection?.profileSource !== 'guess' && connection?.profile.meta.status === 'draft'
	);
	/** A guessed device already says it's experimental. */
	const isExperimental = $derived(!!caps?.experimental && connection?.profileSource !== 'guess');
	const isWriteOnly = $derived(!!caps && !caps.canRead);
	/** Limits that may be wrong get a warning; the rest is only worth knowing. */
	const noticesWarn = $derived(connection?.profileSource === 'guess' || isDraft || isExperimental);
	const hasNotices = $derived(noticesWarn || connection?.profileSource === 'group' || isWriteOnly);

	/** The one line under Read and Write. */
	const status = $derived(
		panelStatus({
			message: devicePeqStore.statusMessage,
			messageIsError: devicePeqStore.statusIsError,
			autoWriting: devicePeqService.autoWriting,
			autoPaused: devicePeqStore.autoPaused,
			autoClipRisk: devicePeqStore.autoClipRisk,
			unreachable: !!caps?.canWrite && (!writeTarget || (caps.canRead && !readTarget)),
			inSync
		})
	);

	const reportUrl = $derived.by(() => {
		if (!connection?.profileId) return null;
		const url = new URL(ISSUES_URL);
		url.searchParams.set('template', 'wrong-constraint.yml');
		url.searchParams.set('title', `Wrong constraint: ${connection.profileId}`);
		url.searchParams.set('profile', connection.profileId);
		url.searchParams.set('app', 'modernGraphTool');
		return url.href;
	});

	// ── Connecting ────────────────────────────────────────────────────────────

	/** Load the connect module and the device database before the click needs them. */
	function warm() {
		void import('$lib/device-peq/connect.js').then((mod) => mod.warmUp());
	}

	async function connect(kind: Kind) {
		unsupported = false;
		choice = null;
		devicePeqStore.isConnecting = true;
		devicePeqStore.setStatus(null);
		try {
			const mod = await import('$lib/device-peq/connect.js');
			const run =
				kind === 'hid' ? mod.connectHid : kind === 'serial' ? mod.connectSerial : mod.connectBle;
			await handleResult(await run());
		} catch (e) {
			fail(e, 'connect');
		} finally {
			devicePeqStore.isConnecting = false;
		}
	}

	async function handleResult(result: ConnectResult) {
		if (result.kind === 'connected') await finishConnect(result.connection);
		else if (result.kind === 'choose') {
			choice = result;
			chosenId = result.candidates[0]?.id ?? '';
		} else if (result.kind === 'unsupported') unsupported = true;
	}

	async function confirmChoice() {
		const pending = choice;
		if (!pending || !chosenId) return;
		choice = null;
		devicePeqStore.isConnecting = true;
		try {
			await handleResult(await pending.finish(chosenId));
		} catch (e) {
			fail(e, 'connect');
		} finally {
			devicePeqStore.isConnecting = false;
		}
	}

	async function cancelChoice() {
		const pending = choice;
		choice = null;
		await pending?.cancel();
	}

	async function finishConnect(conn: DeviceConnection) {
		const slot = await conn.device.currentSlot().catch(() => null);
		devicePeqStore.setConnected(conn, slot);
		devicePeqService.install();
	}

	async function connectNetwork() {
		if (!networkIP.trim()) return;
		const { connectNetworkDevice } = await import('$lib/device-peq/network.js');
		await finishConnect(connectNetworkDevice(networkIP, networkDeviceType));
		showNetworkPanel = false;
	}

	async function reconnect() {
		const conn = devicePeqStore.connection;
		if (!conn) return;
		devicePeqStore.isConnecting = true;
		try {
			const again = conn.reopen ? await conn.reopen() : null;
			if (again) await finishConnect(again);
			else {
				devicePeqStore.setDisconnected();
				devicePeqStore.setStatus(m.equalizer_device_peq_status_reconnect_manual());
			}
		} catch (e) {
			fail(e, 'connect');
		} finally {
			devicePeqStore.isConnecting = false;
		}
	}

	async function disconnect() {
		const conn = devicePeqStore.connection;
		if (!conn) return;
		await conn.device.close().catch(() => {});
		devicePeqStore.setDisconnected();
	}

	// ── Read / write ──────────────────────────────────────────────────────────

	function fail(e: unknown, op: string) {
		devicePeqService.fail(e, op);
	}

	const pullFromDevice = () => devicePeqService.read();

	/** Write now: straight away when the device holds the list exactly, else after a review. */
	async function pushToDevice() {
		const plan = await devicePeqService.prepare();
		if (!plan) return;
		if (needsConfirmation(plan)) {
			pendingPlan = plan;
			showPushDialog = true;
		} else {
			void devicePeqService.write(plan);
		}
	}

	const writePlan = (plan: PushPlan) => devicePeqService.write(plan);
	const chooseEq = (value: string) => devicePeqService.choose(value);
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
	<div class="-mb-1 flex flex-col gap-2">
		{#if !connection}
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
							onclick={cancelChoice}
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
		{:else}
			<!-- The device: what it is, and what's worth knowing about its profile -->
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-base-content">{connection.name}</p>
					<p class="text-xs text-base-content/60">{limitsSummary}</p>
				</div>
				<div class="-mr-1 flex shrink-0 items-center">
					{#if hasNotices}
						<InfoPopover
							label={m.info_popover_about({ topic: m.equalizer_device_peq_profile_notes() })}
							size="sm"
							align="end"
						>
							{#snippet icon()}
								{#if noticesWarn}
									<TriangleAlert class="size-4 text-warning" />
								{:else}
									<Info class="size-4" />
								{/if}
							{/snippet}
							{#if connection.profileSource === 'guess'}
								<p>
									{m.equalizer_device_peq_guess_notice()}
									<a
										href={INSPECTOR_URL}
										target="_blank"
										rel="noopener noreferrer"
										class="text-primary underline-offset-4 hover:underline"
									>
										{m.equalizer_device_peq_help_add()}
									</a>
								</p>
							{:else if connection.profileSource === 'group'}
								<p>{m.equalizer_device_peq_group_notice()}</p>
							{/if}
							{#if isDraft}
								<p>
									{m.equalizer_device_peq_draft_notice()}
									{#if reportUrl}
										<a
											href={reportUrl}
											target="_blank"
											rel="noopener noreferrer"
											class="text-primary underline-offset-4 hover:underline"
										>
											{m.equalizer_device_peq_report_limits()}
										</a>
									{/if}
								</p>
							{/if}
							{#if isExperimental}
								<p>{m.equalizer_device_peq_experimental()}</p>
							{/if}
							{#if isWriteOnly}
								<p>{m.equalizer_device_peq_write_only()}</p>
							{/if}
						</InfoPopover>
					{/if}
					<Button
						title={m.equalizer_device_peq_disconnect()}
						variant="ghost"
						size="icon-sm"
						class="hover:text-error"
						onclick={disconnect}
					>
						<Unplug class="size-4" aria-hidden="true" />
					</Button>
				</div>
			</div>

			{#if devicePeqStore.needsReconnect}
				<!-- Nothing below works until the device is back -->
				<div class="flex items-center justify-between gap-2">
					<p
						class="text-xs {devicePeqStore.statusIsError
							? 'text-base-content'
							: 'text-base-content/70'}"
						role="status"
					>
						{devicePeqStore.statusMessage ?? m.equalizer_device_peq_reconnect_prompt()}
					</p>
					<Button
						title={m.equalizer_device_peq_reconnect()}
						variant="primary"
						size="xs"
						class="shrink-0"
						disabled={devicePeqStore.isConnecting}
						onclick={reconnect}
					>
						{m.equalizer_device_peq_reconnect()}
					</Button>
				</div>
			{:else}
				<!-- Device EQ: what the device plays -->
				<fieldset class="flex flex-col gap-1.5 rounded border border-base-content/15 px-3 py-2">
					<legend class="px-1 text-xs text-base-content/60">
						{m.equalizer_device_peq_hardware_setting()}
					</legend>
					{#if hasPresets}
						<div class="flex items-center gap-1">
							<label class="flex min-w-0 flex-1 items-center gap-2 text-xs text-base-content/70">
								<span class="shrink-0">{eqLabel}</span>
								<select
									value={eqValue}
									disabled={devicePeqStore.isBusy}
									onchange={(e) => {
										const select = e.currentTarget;
										// A failed switch leaves the device as it was: show that again.
										void chooseEq(select.value).then(() => (select.value = eqValue));
									}}
									class="min-w-0 flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs text-base-content disabled:opacity-60"
								>
									{#each eqOptions as option (option.value)}
										<option value={option.value} disabled={option.disabled}>{option.label}</option>
									{/each}
								</select>
							</label>
							<InfoPopover label={m.info_popover_about({ topic: eqLabel })} class="-mr-1">
								<p>
									{caps?.canEnable
										? m.equalizer_device_peq_eq_hint()
										: m.equalizer_device_peq_preset_hint()}
								</p>
							</InfoPopover>
						</div>
					{:else if hasOnOff}
						<Switch
							size="sm"
							bind:checked={
								() => devicePeqStore.eqEnabled !== false, (on) => void chooseEq(on ? 'on' : 'off')
							}
							disabled={devicePeqStore.isBusy}
							labelText={m.equalizer_device_peq_eq_label()}
							labelClass="text-xs text-base-content/70"
						>
							<InfoPopover
								label={m.info_popover_about({ topic: m.equalizer_device_peq_eq_label() })}
								class="ml-0.5"
							>
								<p>
									{devicePeqStore.eqEnabled === null
										? m.equalizer_device_peq_eq_switch_unknown()
										: m.equalizer_device_peq_eq_switch_hint()}
								</p>
							</InfoPopover>
						</Switch>
					{/if}
				</fieldset>

				<!-- Sync: Read and Write, auto-write, and one line saying where things stand -->
				<div class="flex gap-1">
					{#if caps?.canRead}
						<Button
							title={readTarget
								? m.equalizer_device_peq_read_title()
								: m.equalizer_device_peq_unreachable()}
							variant="outline"
							size="sm"
							class="flex-1"
							disabled={devicePeqStore.isBusy || !readTarget}
							onclick={pullFromDevice}
						>
							{devicePeqStore.isReading
								? m.equalizer_device_peq_reading()
								: m.equalizer_device_peq_read()}
						</Button>
					{/if}
					{#if caps?.canWrite}
						<Button
							title={writeTarget
								? m.equalizer_device_peq_write_title()
								: m.equalizer_device_peq_unreachable()}
							variant="primary"
							size="sm"
							class="flex-1"
							disabled={devicePeqStore.isBusy || !writeTarget}
							onclick={pushToDevice}
						>
							{devicePeqStore.isWriting
								? m.equalizer_device_peq_writing()
								: m.equalizer_device_peq_write()}
						</Button>
					{/if}
				</div>

				{#if canAutoWrite}
					<Switch
						size="sm"
						bind:checked={
							() => devicePeqService.autoWriteOn, (on) => devicePeqService.setAutoWrite(on)
						}
						labelText={m.equalizer_device_peq_auto_write()}
						labelClass="text-xs text-base-content/70"
					>
						<InfoPopover
							label={m.info_popover_about({ topic: m.equalizer_device_peq_auto_write() })}
							class="ml-0.5"
						>
							<p>{m.equalizer_device_peq_auto_write_hint()}</p>
						</InfoPopover>
					</Switch>
				{/if}

				<!-- Always rendered: a live region has to exist before its text changes -->
				<div class="flex items-center gap-2">
					<p
						class="flex min-w-0 flex-1 items-start gap-1 text-xs {status?.tone === 'muted'
							? 'text-base-content/60'
							: 'text-base-content'}"
						role="status"
					>
						{#if status?.tone === 'success'}
							<Check class="mt-px size-3.5 shrink-0 text-success" aria-hidden="true" />
						{:else if status?.tone === 'warning'}
							<TriangleAlert class="mt-px size-3.5 shrink-0 text-warning" aria-hidden="true" />
						{:else if status?.tone === 'error'}
							<CircleAlert class="mt-px size-3.5 shrink-0 text-error" aria-hidden="true" />
						{/if}
						<span>{status?.text ?? ''}</span>
					</p>
					{#if status?.action === 'review'}
						<Button
							title={m.equalizer_device_peq_auto_review()}
							variant="outline"
							size="xs"
							class="shrink-0"
							disabled={devicePeqStore.isBusy}
							onclick={pushToDevice}
						>
							{m.equalizer_device_peq_auto_review()}
						</Button>
					{/if}
				</div>
			{/if}
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

<DevicePeqPushDialog
	bind:open={showPushDialog}
	plan={pendingPlan}
	deviceName={connection?.name ?? ''}
	onConfirm={() => pendingPlan && writePlan(pendingPlan)}
/>
