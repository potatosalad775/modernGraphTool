<script lang="ts">
	import { devicePeqStore } from '$lib/stores/device-peq-store.svelte.js';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { eqCommands } from '$lib/services/eq-commands.js';
	import { fromCapsFilter, envelopeOf } from '$lib/utils/eq-constraint.js';
	import { needsConfirmation, planPush, type PushPlan } from '$lib/device-peq/push-plan.js';
	import { describeDeviceError, isConnectionLost } from '$lib/device-peq/errors.js';
	import type { ConnectResult } from '$lib/device-peq/connect.js';
	import type { DeviceCandidate, DeviceConnection } from '$lib/device-peq/types.js';
	import { NETWORK_DEVICE_TYPES, type NetworkDeviceType } from '$lib/device-peq/network-types.js';
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';
	import { Info } from '@lucide/svelte';
	import Button from '../atoms/Button.svelte';
	import Switch from '../atoms/Switch.svelte';
	import DevicePeqInfoDialog from './DevicePeqInfoDialog.svelte';
	import DevicePeqPushDialog from './DevicePeqPushDialog.svelte';

	/** The eqcaps inspector: identifies a device and turns it into a profile. */
	const INSPECTOR_URL = 'https://potatosalad775.github.io/eqcaps/connect';
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
	let showInfo = $state(false);
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

	/** "10 bands · -12 to 12 dB" — what the profile allows, at a glance. */
	const limitsSummary = $derived.by(() => {
		if (!connection) return '';
		const gain = envelopeOf(connection.profile, 'gain');
		return m.equalizer_device_peq_limits({
			bands: connection.profile.bandCount ?? '∞',
			min: gain?.min ?? '',
			max: gain?.max ?? ''
		});
	});

	const isDraft = $derived(
		connection?.profileSource !== 'guess' && connection?.profile.meta.status === 'draft'
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
		devicePeqStore.setStatus(m.equalizer_device_peq_status_connected({ device: conn.name }));
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
		console.error(`Device PEQ ${op} failed:`, e);
		const message = describeDeviceError(e);
		devicePeqStore.setStatus(message);
		toast.error(message);
		if (isConnectionLost(e) && devicePeqStore.connection) devicePeqStore.needsReconnect = true;
	}

	async function pullFromDevice() {
		const conn = devicePeqStore.connection;
		if (!conn) return;
		devicePeqStore.isReading = true;
		try {
			const slot = devicePeqStore.activeSlot;
			const result = await conn.device.pull(
				conn.device.capabilities.readsSlot && slot !== null ? { slot } : {}
			);
			const bands = result.filters.filter((f) => f !== null);
			const filters = bands.map(fromCapsFilter).filter((f) => f !== null);
			eqCommands.replaceFilters(filters);
			eqCommands.ensureEnabled();
			devicePeqStore.setStatus(m.equalizer_device_peq_status_read({ count: filters.length }));
			if (filters.length < bands.length) {
				toast.warning(
					m.equalizer_device_peq_read_skipped({ count: bands.length - filters.length })
				);
			}
		} catch (e) {
			fail(e, 'read');
		} finally {
			devicePeqStore.isReading = false;
		}
	}

	function pushToDevice() {
		const conn = devicePeqStore.connection;
		if (!conn) return;
		const plan = planPush(eqStore.filters, eqStore.preamp, conn.profile, conn.device.capabilities);
		if (needsConfirmation(plan)) {
			pendingPlan = plan;
			showPushDialog = true;
		} else {
			void writePlan(plan);
		}
	}

	async function writePlan(plan: PushPlan) {
		const conn = devicePeqStore.connection;
		if (!conn) return;
		devicePeqStore.isWriting = true;
		try {
			const slot = devicePeqStore.activeSlot;
			const result = await conn.device.push({
				filters: plan.filters,
				...(plan.preamp !== undefined ? { preamp: plan.preamp } : {}),
				...(conn.device.capabilities.writesSlot && slot !== null ? { slot } : {})
			});
			if (result.reconnect) {
				// The device restarts to save. Its transport is gone; `reopen` finds it again.
				await conn.device.close().catch(() => {});
				devicePeqStore.needsReconnect = true;
				devicePeqStore.setStatus(m.equalizer_device_peq_status_saved_reconnect());
			} else {
				devicePeqStore.setStatus(
					m.equalizer_device_peq_status_written({ count: plan.filters.length })
				);
			}
			if (plan.skippedChannel > 0) {
				toast.warning(
					m.eq_channel_device_peq_shared_only({
						count: eqStore.filters.length - plan.skippedChannel,
						skipped: plan.skippedChannel
					})
				);
			}
		} catch (e) {
			fail(e, 'write');
		} finally {
			devicePeqStore.isWriting = false;
		}
	}

	// ── Presets and the EQ switch ─────────────────────────────────────────────

	async function setDeviceEq(on: boolean) {
		const conn = devicePeqStore.connection;
		if (!conn) return;
		try {
			await conn.device.setEnabled(on, on ? (devicePeqStore.activeSlot ?? undefined) : undefined);
			devicePeqStore.eqEnabled = on;
		} catch (e) {
			fail(e, 'switch');
		}
	}
</script>

{#snippet infoButton()}
	<Button
		title={m.equalizer_device_peq_info_trigger_label()}
		variant="ghost"
		size="icon-xs"
		class="shrink-0 text-base-content/60 hover:text-base-content"
		onclick={() => (showInfo = true)}
	>
		<Info class="h-4 w-4" />
	</Button>
{/snippet}

{#if hasDeviceApi}
	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between text-xs text-base-content/60">
			<span>{m.equalizer_device_peq_info_prompt()}</span>
			{@render infoButton()}
		</div>

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
		{:else}
			<!-- Connected -->
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate text-xs font-medium text-base-content">{connection.name}</p>
					<p class="text-xs text-base-content/60">{limitsSummary}</p>
				</div>
				<Button
					title={m.equalizer_device_peq_disconnect()}
					variant="outline"
					size="xs"
					class="shrink-0 text-error ring-error/40 hover:bg-error/10"
					onclick={disconnect}
				>
					{m.equalizer_device_peq_disconnect()}
				</Button>
			</div>

			{#if connection.profileSource === 'guess'}
				<p class="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs">
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
				<p class="text-xs text-base-content/60">{m.equalizer_device_peq_group_notice()}</p>
			{/if}
			{#if isDraft}
				<p class="text-xs text-base-content/60">
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
			{#if caps?.experimental && connection.profileSource !== 'guess'}
				<p class="text-xs text-base-content/60">{m.equalizer_device_peq_experimental()}</p>
			{/if}

			{#if devicePeqStore.needsReconnect}
				<div class="flex items-center justify-between gap-2">
					<span class="text-xs text-base-content/70">
						{m.equalizer_device_peq_reconnect_prompt()}
					</span>
					<Button
						title={m.equalizer_device_peq_reconnect()}
						variant="primary"
						size="xs"
						disabled={devicePeqStore.isConnecting}
						onclick={reconnect}
					>
						{m.equalizer_device_peq_reconnect()}
					</Button>
				</div>
			{:else}
				{#if devicePeqStore.slots.length > 0 && (caps?.readsSlot || caps?.writesSlot || caps?.canEnable)}
					<label class="flex items-center gap-2 text-xs text-base-content/70">
						<span class="shrink-0">{m.equalizer_device_peq_preset()}</span>
						<select
							bind:value={devicePeqStore.activeSlot}
							class="w-full rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs text-base-content"
						>
							{#each devicePeqStore.slots as slot (slot.id)}
								<option value={slot.id}>{slot.name}</option>
							{/each}
						</select>
					</label>
				{/if}

				{#if caps?.canEnable}
					<Switch
						size="sm"
						checked={devicePeqStore.eqEnabled ?? true}
						onCheckedChange={setDeviceEq}
						labelText={m.equalizer_device_peq_eq_switch()}
						labelClass="text-xs text-base-content/70"
					/>
				{/if}

				<div class="flex gap-1">
					{#if caps?.canRead}
						<Button
							title={m.equalizer_device_peq_read_title()}
							variant="outline"
							size="sm"
							class="flex-1"
							disabled={devicePeqStore.isBusy}
							onclick={pullFromDevice}
						>
							{devicePeqStore.isReading
								? m.equalizer_device_peq_reading()
								: m.equalizer_device_peq_read()}
						</Button>
					{/if}
					{#if caps?.canWrite}
						<Button
							title={m.equalizer_device_peq_write_title()}
							variant="primary"
							size="sm"
							class="flex-1"
							disabled={devicePeqStore.isBusy}
							onclick={pushToDevice}
						>
							{devicePeqStore.isWriting
								? m.equalizer_device_peq_writing()
								: m.equalizer_device_peq_write()}
						</Button>
					{/if}
				</div>
				{#if caps && !caps.canRead}
					<p class="text-xs text-base-content/60">{m.equalizer_device_peq_write_only()}</p>
				{/if}
			{/if}
		{/if}

		<!-- Status message -->
		{#if devicePeqStore.statusMessage}
			<p class="text-xs text-base-content/60" role="status">{devicePeqStore.statusMessage}</p>
		{/if}
	</div>
{:else}
	<div class="flex items-start justify-between gap-2">
		<p class="text-xs text-base-content/60">
			{m.equalizer_device_peq_incompatible_browser_alert()}
		</p>
		{@render infoButton()}
	</div>
{/if}

<DevicePeqInfoDialog bind:open={showInfo} />
<DevicePeqPushDialog
	bind:open={showPushDialog}
	plan={pendingPlan}
	deviceName={connection?.name ?? ''}
	onConfirm={() => pendingPlan && writePlan(pendingPlan)}
/>
