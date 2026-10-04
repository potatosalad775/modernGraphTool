<script lang="ts">
	import { devicePeqStore } from '$lib/stores/device-peq-store.svelte.js';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { eqCommands, eqFiltersEqual } from '$lib/services/eq-commands.js';
	import { fromCapsFilter, envelopeOf } from '$lib/utils/eq-constraint.js';
	import {
		needsConfirmation,
		planPush,
		readLayout,
		type PushPlan
	} from '$lib/device-peq/push-plan.js';
	import { readRequest, writeRequest } from '$lib/device-peq/preset.js';
	import { describeDeviceError, isConnectionLost } from '$lib/device-peq/errors.js';
	import type { Filter } from '@potatosalad775/eqcaps-core';
	import type { ConnectResult } from '$lib/device-peq/connect.js';
	import type { DeviceCandidate, DeviceConnection } from '$lib/device-peq/types.js';
	import { NETWORK_DEVICE_TYPES, type NetworkDeviceType } from '$lib/device-peq/network-types.js';
	import * as m from '$lib/paraglide/messages.js';
	import { toast } from 'svelte-sonner';
	import { Check, Info } from '@lucide/svelte';
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
	const eqValue = $derived.by(() => {
		const selection = devicePeqStore.selection;
		if (selection === null) return caps?.canEnable ? 'unknown' : '';
		if (selection === 'off' || selection === 'other') return selection;
		return `p${selection}`;
	});

	/** Read follows the control: the preset it shows, or whatever unlisted one the device is on. */
	const readTarget = $derived(
		caps && devicePeqStore.selection === 'other'
			? caps.canRead
				? {}
				: null
			: caps
				? readRequest(caps, devicePeqStore.activeSlot, devicePeqStore.deviceSlot)
				: null
	);
	const writeTarget = $derived(
		caps ? writeRequest(caps, devicePeqStore.activeSlot, devicePeqStore.deviceSlot) : null
	);

	/** Whether the list still matches what was last read from or written to the device. */
	const inSync = $derived.by(() => {
		const synced = devicePeqStore.synced;
		if (!synced) return null;
		const preampMatters = caps?.writesPreamp ?? false;
		return (
			synced.filters.length === eqStore.filters.length &&
			synced.filters.every((f, i) => eqFiltersEqual(f, eqStore.filters[i])) &&
			(!preampMatters || synced.preamp === eqStore.preamp)
		);
	});

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
		const request = readTarget;
		if (!conn || !request) return;
		devicePeqStore.isReading = true;
		try {
			const result = await conn.device.pull(request);
			const bands = result.filters.filter((f) => f !== null);
			const filters = bands.map(fromCapsFilter).filter((f) => f !== null);
			eqCommands.replaceFilters(filters);
			eqCommands.ensureEnabled();
			devicePeqStore.synced = { filters: eqStore.filters, preamp: eqStore.preamp };
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

	async function pushToDevice() {
		const conn = devicePeqStore.connection;
		if (!conn || !writeTarget) return;
		let hints: (Filter | null)[] | undefined;
		const plan = () =>
			planPush(eqStore.filters, eqStore.preamp, conn.profile, conn.device.capabilities, hints);
		if (plan().emptySlots > 0) {
			// Read the preset first, so the bands the list leaves empty keep the device's layout.
			devicePeqStore.isWriting = true;
			const request = readRequest(
				conn.device.capabilities,
				devicePeqStore.activeSlot,
				devicePeqStore.deviceSlot
			);
			hints = (await readLayout(conn.device, request)) ?? undefined;
			devicePeqStore.isWriting = false;
			if (devicePeqStore.connection !== conn) return;
		}
		const final = plan();
		if (needsConfirmation(final)) {
			pendingPlan = final;
			showPushDialog = true;
		} else {
			void writePlan(final);
		}
	}

	async function writePlan(plan: PushPlan) {
		const conn = devicePeqStore.connection;
		const request = writeTarget;
		if (!conn || !request) return;
		const snapshot = { filters: eqStore.filters, preamp: eqStore.preamp };
		devicePeqStore.isWriting = true;
		try {
			const result = await conn.device.push({
				filters: plan.filters,
				...(plan.preamp !== undefined ? { preamp: plan.preamp } : {}),
				...request
			});
			devicePeqStore.synced = snapshot;
			const count = plan.filters.length - plan.emptySlots;
			if (result.reconnect) {
				// The device restarts to save. Its transport is gone; `reopen` finds it again.
				await conn.device.close().catch(() => {});
				devicePeqStore.needsReconnect = true;
				devicePeqStore.setStatus(m.equalizer_device_peq_status_saved_reconnect());
			} else {
				// Written to a listed preset while the device sits on a built-in one: switch to it,
				// so what was written is what plays.
				const slot = devicePeqStore.activeSlot;
				if (
					devicePeqStore.selection === 'other' &&
					conn.device.capabilities.canEnable &&
					slot !== null
				) {
					await conn.device.setEnabled(true, slot);
					devicePeqStore.played(slot);
				}
				devicePeqStore.setStatus(
					devicePeqStore.eqEnabled === false
						? m.equalizer_device_peq_status_written_off({ count })
						: m.equalizer_device_peq_status_written({ count })
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

	// ── Device EQ ─────────────────────────────────────────────────────────────

	/** Switch the device to what the control picked: a preset, the EQ on, or off. */
	async function chooseEq(value: string) {
		const conn = devicePeqStore.connection;
		if (!conn) return;
		const slot = value.startsWith('p')
			? Number(value.slice(1))
			: value === 'on'
				? devicePeqStore.slots[0]?.id
				: undefined;
		if (!conn.device.capabilities.canEnable) {
			// Nothing to switch: the control only picks what Read and Write reach.
			if (slot !== undefined) devicePeqStore.target(slot);
			return;
		}
		devicePeqStore.isSwitching = true;
		try {
			if (value === 'off') {
				await conn.device.setEnabled(false);
				devicePeqStore.played('off');
			} else {
				await conn.device.setEnabled(true, slot);
				devicePeqStore.played(slot);
			}
		} catch (e) {
			fail(e, 'switch');
		} finally {
			devicePeqStore.isSwitching = false;
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
				{#if hasPresets}
					<div class="flex flex-col gap-1">
						<label class="flex items-center gap-2 text-xs text-base-content/70">
							<span class="shrink-0">
								{caps?.canEnable
									? m.equalizer_device_peq_eq_label()
									: m.equalizer_device_peq_preset()}
							</span>
							<select
								value={eqValue}
								disabled={devicePeqStore.isBusy}
								onchange={(e) => {
									const select = e.currentTarget;
									// A failed switch leaves the device as it was: show that again.
									void chooseEq(select.value).then(() => (select.value = eqValue));
								}}
								class="w-full rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs text-base-content disabled:opacity-60"
							>
								{#each eqOptions as option (option.value)}
									<option value={option.value} disabled={option.disabled}>{option.label}</option>
								{/each}
							</select>
						</label>
						<p class="text-xs text-base-content/60">
							{caps?.canEnable
								? m.equalizer_device_peq_eq_hint()
								: m.equalizer_device_peq_preset_hint()}
						</p>
					</div>
				{:else if hasOnOff}
					<div class="flex flex-col gap-1">
						<Switch
							size="sm"
							bind:checked={
								() => devicePeqStore.eqEnabled !== false, (on) => void chooseEq(on ? 'on' : 'off')
							}
							disabled={devicePeqStore.isBusy}
							labelText={m.equalizer_device_peq_eq_label()}
							labelClass="text-xs text-base-content/70"
						/>
						<p class="text-xs text-base-content/60">
							{devicePeqStore.eqEnabled === null
								? m.equalizer_device_peq_eq_switch_unknown()
								: m.equalizer_device_peq_eq_switch_hint()}
						</p>
					</div>
				{/if}

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
				{#if caps?.canWrite && (!writeTarget || (caps.canRead && !readTarget))}
					<p class="text-xs text-base-content/60">{m.equalizer_device_peq_unreachable()}</p>
				{:else if inSync === true}
					<p class="flex items-center gap-1 text-xs text-base-content/60">
						<Check class="h-3.5 w-3.5 text-success" aria-hidden="true" />
						{m.equalizer_device_peq_synced()}
					</p>
				{:else if inSync === false}
					<p class="text-xs text-base-content/70">{m.equalizer_device_peq_unsynced()}</p>
				{/if}
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
