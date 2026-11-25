/**
 * Device PEQ service — connects, reads, writes and switches the device, and auto-write.
 *
 * Out of the Hardware EQ panel because auto-write has to outlive it: panels unmount on every
 * switch, and a change made in the graph or by AutoEQ with the EQ panel closed still has to reach
 * the device. The panel keeps only what needs it: the review dialog and the controls.
 *
 * Hardware EQ holds one connection at a time: one made here, or uniPEQ's over the link. Nothing
 * connects here while the link is active (`linkStore.active`), and the link doesn't start while
 * something is connected or connecting here (`devicePeqStore.localActive`, checked by
 * `linkService`).
 *
 * A device connected in uniPEQ (`connectionType: 'link'`) is written by uniPEQ from the shared
 * list, so for it Write, Device EQ and the auto-write switch are commands to uniPEQ, and this
 * page's own auto-write stays out of the way.
 */
import { noop } from '#lib/utils/noop.js';
import { untrack } from 'svelte';
import { toast } from '#lib/services/toast.js';
import * as m from '#lib/paraglide/messages.js';
import { controlLabel, controlValueLabel } from '#lib/device-peq/control-labels.js';
import { deviceAs, eqView, type DeviceEq, type EqTarget } from '#lib/device-peq/device-eqs.js';
import {
	describeDeviceError,
	isConnectionLost,
	isInvalidRequest,
	isUnsupported
} from '#lib/device-peq/errors.js';
import { LinkPeqDevice } from '#lib/device-peq/link.js';
import { readRequest } from '#lib/device-peq/preset.js';
import {
	listFromPull,
	needsReview,
	planPush,
	readLayout,
	type Layout,
	type PushPlan
} from '#lib/device-peq/push-plan.js';
import type { ConnectResult } from '#lib/device-peq/connect.js';
import type { NetworkDeviceType } from '#lib/device-peq/network-types.js';
import type { DeviceConnection, PeqDevice, Slot } from '#lib/device-peq/types.js';
import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { linkStore } from '#lib/stores/link-store.svelte.js';
import { settingsStore } from '#lib/stores/settings-store.svelte.js';
import type { EQFilter } from '#lib/utils/equalizer.js';
import { eqProfile, type Control } from '@potatosalad775/eqcaps-core';
import { eqCommands } from './eq-commands.js';
import { volumeWarning } from './volume-warning.svelte.js';

/** How long after the last edit auto-write waits: one slider drag is one write, not dozens. */
export const AUTO_WRITE_DELAY_MS = 700;

/**
 * How long a device that restarts to save gets to come back before Reconnect is offered, ms: a USB
 * re-enumeration takes a second or two, and a grant the browser dropped never comes back.
 */
const RESTART_WAIT_MS = 5000;

/**
 * The preset the device plays and, where its EQ switch is its own state, whether that is on. A
 * failed read is unknown rather than an error: the connection works without it.
 */
async function playing(conn: DeviceConnection) {
	const slot = await conn.device.currentSlot().catch(() => null);
	const enabled = conn.device.capabilities.readsEnabled
		? await conn.device.eqEnabled().catch(() => null)
		: null;
	return { slot, enabled };
}

/** Whether the device's current mode has EQ `id`: one it lacks answers `unsupported`. */
async function eqThere(conn: DeviceConnection, id: string): Promise<boolean> {
	try {
		await deviceAs(conn.device, id).currentSlot();
		return true;
	} catch (e) {
		if (isUnsupported(e)) return false;
		throw e;
	}
}

/**
 * The listed EQs the device's current mode lacks. One that fails to answer otherwise stays listed:
 * picking it reports that failure.
 */
async function absentEqs(conn: DeviceConnection): Promise<string[]> {
	const absent: string[] = [];
	for (const { id } of conn.device.capabilities.eqs ?? []) {
		const there = await eqThere(conn, id).catch((e: unknown) => {
			console.warn(`Device PEQ: asking for EQ ${id} failed:`, e);
			return true;
		});
		if (!there) absent.push(id);
	}
	return absent;
}

/**
 * The band count the device reports for EQ `id` where it differs from the data's, else null: a
 * Qudelix in single-EQ mode has 20 bands where its profile counts 10, and writing 10 would leave
 * the rest playing what they held. Null too where the profile sets slots by index, which would no
 * longer line up.
 */
async function reportedBands(conn: DeviceConnection, id: string | undefined) {
	const data = eqProfile(conn.profile, id);
	const device = deviceAs(conn.device, id);
	if (!data || data.bands?.length) return null;
	if (!conn.device.capabilities.readsBandCount || !device.bandCount) return null;
	const reported = await device.bandCount().catch(() => null);
	return reported === null || reported === data.bandCount ? null : reported;
}

/** EQ `id` of `conn` as a connect opens one: its band count as the device has it, and what it plays. */
async function openEq(conn: DeviceConnection, id: string | undefined) {
	const eq: EqTarget = { id, bandCount: await reportedBands(conn, id) };
	const view = eqView(conn, eq);
	return { eq, view, ...(await playing(view)), listed: await listPresets(view) };
}

/**
 * The presets a device that keeps a list holds now, under its own names; null for a device whose
 * presets are the profile's, and when the list can't be read (the profile's then stand in).
 */
async function listPresets(conn: DeviceConnection): Promise<readonly Slot[] | null> {
	const { device } = conn;
	if (!device.capabilities.listsSlots || !device.slots) return null;
	return device.slots().catch(() => null);
}

/** An EQ's label: the data's name, else "Main EQ" (only the profile's own can lack one). */
export function eqName(eq: Pick<DeviceEq, 'name'> | undefined): string {
	return eq?.name ?? m.device_eq_target_main();
}

/** `plan` as the bridge's push takes it: the right channel where it is written apart. */
function writeOf(plan: PushPlan) {
	return {
		filters: plan.filters,
		...(plan.right ? { right: { filters: plan.right } } : {}),
		...(plan.preamp !== undefined ? { preamp: plan.preamp } : {})
	};
}

/** What the status line says while a restarted device is awaited, once it is back, and if it isn't. */
interface RestartWords {
	waiting: string;
	back: string;
	manual: string;
}

/** The transports a browser connects through its own device APIs. */
export type DeviceKind = 'hid' | 'serial' | 'ble';

/** What the auto-writer last saw, to tell an edit from a reconnect or a toggle. */
interface Seen {
	filters: EQFilter[];
	preamp: number;
	conn: DeviceConnection | null;
}

class DevicePeqService {
	#installed = false;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#running = false;
	/** Flushes that arrived while one was running; a change means the list moved again. */
	#queued = 0;
	#seen: Seen | null = null;
	#unwatchLost: () => void = noop;

	/** The connected device when it is uniPEQ's, reached over the link. */
	get linkDevice(): LinkPeqDevice | null {
		const device = devicePeqStore.connection?.device;
		return device instanceof LinkPeqDevice ? device : null;
	}

	/**
	 * The auto-write switch: the saved setting, unless a failed write stopped it on this connection.
	 * Over the link it is uniPEQ's setting, which uniPEQ keeps.
	 */
	get autoWriteOn(): boolean {
		if (this.linkDevice) {
			const auto = linkStore.status?.auto;
			return !!auto?.on && !auto.stopped;
		}
		return settingsStore.devicePeqAutoWrite && !devicePeqStore.autoStopped;
	}

	/** Auto-write is on, and this device can take it. */
	get autoWriting(): boolean {
		if (this.linkDevice) return this.autoWriteOn;
		const caps = devicePeqStore.connection?.device.capabilities;
		return this.autoWriteOn && !!caps?.canWrite && !caps.disconnectOnSave;
	}

	/** Report a failed operation. `note` says what else it caused, in the same toast. */
	fail(e: unknown, op: string, note?: string): void {
		console.error(`Device PEQ ${op} failed:`, e);
		const message = describeDeviceError(e);
		devicePeqStore.setStatus(message, true);
		toast.error(message, note ? { description: note } : undefined);
		if (isConnectionLost(e) && devicePeqStore.connection) devicePeqStore.needsReconnect = true;
		// The EQ may have gone with the device's mode, switched on the device or in its own app.
		if (isUnsupported(e) && devicePeqStore.eq !== undefined) void this.#checkEq();
	}

	// ── Connecting ────────────────────────────────────────────────────────────

	/** Load the connect module and the device database before the click needs them. */
	warm(): void {
		void import('#lib/device-peq/connect.js').then((mod) => mod.warmUp());
	}

	/**
	 * Connect a device over `kind`. `'unsupported'` when it has no profile and no protocol; a device
	 * several profiles fit waits in `devicePeqStore.choice` for `pick`.
	 */
	async connect(kind: DeviceKind): Promise<'unsupported' | undefined> {
		if (linkStore.active || devicePeqStore.localActive) return;
		devicePeqStore.isConnecting = true;
		devicePeqStore.setStatus(null);
		try {
			const mod = await import('#lib/device-peq/connect.js');
			const run =
				kind === 'hid' ? mod.connectHid : kind === 'serial' ? mod.connectSerial : mod.connectBle;
			return await this.#settle(await run());
		} catch (e) {
			this.fail(e, 'connect');
		} finally {
			devicePeqStore.isConnecting = false;
		}
	}

	/** The profile the user picked for the device waiting in `devicePeqStore.choice`. */
	async pick(id: string): Promise<'unsupported' | undefined> {
		const pending = devicePeqStore.choice;
		if (!pending) return;
		devicePeqStore.choice = null;
		devicePeqStore.isConnecting = true;
		try {
			return await this.#settle(await pending.finish(id));
		} catch (e) {
			this.fail(e, 'connect');
		} finally {
			devicePeqStore.isConnecting = false;
		}
	}

	/** Give up on the device waiting in `devicePeqStore.choice`. */
	async cancelPick(): Promise<void> {
		const pending = devicePeqStore.choice;
		devicePeqStore.choice = null;
		await pending?.cancel();
	}

	async connectNetwork(ip: string, type: NetworkDeviceType): Promise<void> {
		if (linkStore.active || devicePeqStore.localActive || !ip.trim()) return;
		devicePeqStore.isConnecting = true;
		try {
			const { connectNetworkDevice } = await import('#lib/device-peq/network.js');
			await this.#connected(connectNetworkDevice(ip, type));
		} catch (e) {
			this.fail(e, 'connect');
		} finally {
			devicePeqStore.isConnecting = false;
		}
	}

	/** Find a device again after it dropped the connection, or restarted to save. */
	async reconnect(): Promise<void> {
		const conn = devicePeqStore.connection;
		if (!conn) return;
		// uniPEQ holds the device: it reconnects, and says so in `status`.
		const link = this.linkDevice;
		if (link) return link.reconnect().catch((e: unknown) => this.fail(e, 'connect'));
		devicePeqStore.isConnecting = true;
		try {
			const again = conn.reopen ? await conn.reopen() : null;
			if (again) await this.#reopened(again);
			else {
				devicePeqStore.setDisconnected();
				devicePeqStore.setStatus(m.equalizer_device_peq_status_reconnect_manual());
			}
		} catch (e) {
			this.fail(e, 'connect');
		} finally {
			devicePeqStore.isConnecting = false;
		}
	}

	/** Close the connection. A device uniPEQ holds closes by unlinking. */
	async disconnect(): Promise<void> {
		const conn = devicePeqStore.connection;
		if (!conn) return;
		this.#unwatchLost();
		this.#unwatchLost = noop;
		await conn.device.close().catch(noop);
		devicePeqStore.setDisconnected();
	}

	async #settle(result: ConnectResult): Promise<'unsupported' | undefined> {
		if (result.kind === 'connected') await this.#connected(result.connection);
		else if (result.kind === 'choose') devicePeqStore.choice = result;
		else if (result.kind === 'unsupported') return 'unsupported';
	}

	/**
	 * `conn` is the device as it was opened. It is reached as the EQ its profile describes, or as
	 * `eqId` where that is given and the device's mode still has it (a reopened device).
	 */
	async #connected(conn: DeviceConnection, eqId?: string): Promise<void> {
		const absent = await absentEqs(conn);
		const known = conn.device.capabilities.eqs?.some((e) => e.id === eqId) ?? false;
		const id = known && eqId !== undefined && !absent.includes(eqId) ? eqId : undefined;
		const { eq, view, slot, enabled, listed } = await openEq(conn, id);
		devicePeqStore.setConnected(view, slot, enabled, { conn, eq, absent }, listed);
		this.#unwatchLost();
		this.#unwatchLost = conn.onLost?.(() => void this.#lost(conn)) ?? noop;
		await this.#readControls(view);
		this.install();
		// Auto-write writes without a press, so its volume warning comes now, before any edit.
		if (this.autoWriting) {
			volumeWarning.ask(undefined, () => (devicePeqStore.autoStopped = true));
		}
	}

	/**
	 * The same device, opened again. It still holds what was last read or written while it is on the
	 * same preset, so the list is still in sync: connecting never reads, so nothing else would say so.
	 */
	async #reopened(again: DeviceConnection): Promise<void> {
		const { synced, activeSlot, eq } = devicePeqStore;
		await this.#connected(again, eq);
		if (devicePeqStore.eq === eq && devicePeqStore.activeSlot === activeSlot) {
			devicePeqStore.synced = synced;
		}
	}

	/**
	 * The device went on its own: disconnected now, not at the next failed operation, so its limits
	 * stop applying and nothing tries to write to it. One that restarts to save is expected to go and
	 * kept for its return, and it can go before the write that saved has returned.
	 */
	async #lost(conn: DeviceConnection): Promise<void> {
		if (devicePeqStore.opened !== conn) return;
		const saving = devicePeqStore.isWriting && conn.device.capabilities.disconnectOnSave;
		if (devicePeqStore.needsReconnect || saving) return;
		await this.disconnect();
		const message = m.equalizer_device_peq_reconnect_prompt();
		devicePeqStore.setStatus(message);
		toast.warning(message);
	}

	/**
	 * A device that restarted to save is reopened as soon as it is back. Not back in time, or no
	 * longer granted to the site, Reconnect stays on offer.
	 */
	async #awaitRestart(conn: DeviceConnection, words: RestartWords): Promise<void> {
		if (!conn.reopen) {
			devicePeqStore.setStatus(words.manual);
			return;
		}
		devicePeqStore.isConnecting = true;
		devicePeqStore.setStatus(words.waiting);
		let again: DeviceConnection | null = null;
		try {
			again = await conn.reopen({ timeoutMs: RESTART_WAIT_MS });
		} catch (e) {
			console.warn('Device PEQ: reopening after a restart failed:', e);
		}
		// Disconnected meanwhile: what came back is no longer wanted.
		if (devicePeqStore.connection !== conn) {
			await again?.device.close().catch(noop);
			return;
		}
		if (!again) {
			devicePeqStore.isConnecting = false;
			devicePeqStore.setStatus(words.manual);
			return;
		}
		try {
			await this.#reopened(again);
			devicePeqStore.setStatus(words.back);
		} catch (e) {
			this.fail(e, 'connect');
		} finally {
			devicePeqStore.isConnecting = false;
		}
	}

	// ── Read / write ──────────────────────────────────────────────────────────

	/** Replace the band list with what Device EQ shows. */
	async read(): Promise<void> {
		const conn = devicePeqStore.connection;
		const request = devicePeqStore.readTarget;
		if (!conn || !request) return;
		const link = this.linkDevice;
		if (link) {
			// uniPEQ reads into the shared list, which arrives as an `eq`; `status` says it's busy.
			await link.pull().catch((e: unknown) => this.fail(e, 'read'));
			return;
		}
		devicePeqStore.isReading = true;
		try {
			const result = await conn.device.pull(request);
			const { filters, skipped } = listFromPull(result);
			eqCommands.replaceFilters(filters);
			eqCommands.ensureEnabled();
			devicePeqStore.synced = { filters: eqStore.filters, preamp: eqStore.preamp };
			devicePeqStore.setStatus(m.equalizer_device_peq_status_read({ count: filters.length }));
			if (skipped > 0) toast.warning(m.equalizer_device_peq_read_skipped({ count: skipped }));
			await this.#readEqControls(conn);
		} catch (e) {
			this.fail(e, 'read');
		} finally {
			devicePeqStore.isReading = false;
		}
	}

	/**
	 * The plan for writing the list as it is now. When it leaves device bands empty, the target
	 * preset is read once first (and kept in `devicePeqStore.layout` until the preset changes), so
	 * those bands keep the device's own layout. Null when the device went away meanwhile.
	 */
	async prepare(): Promise<PushPlan | null> {
		const conn = devicePeqStore.connection;
		if (!conn || !devicePeqStore.writeTarget) return null;
		const caps = conn.device.capabilities;
		const plan = (hints?: Layout | null) =>
			planPush(eqStore.filters, eqStore.preamp, conn.profile, caps, hints ?? undefined);
		const first = plan(devicePeqStore.layout?.hints);
		if (first.emptySlots === 0 || devicePeqStore.layout) return first;
		const slot = devicePeqStore.activeSlot;
		devicePeqStore.isWriting = true;
		let hints: Layout | null;
		try {
			hints = await readLayout(conn.device, readRequest(caps, slot, devicePeqStore.deviceSlot));
		} finally {
			devicePeqStore.isWriting = false;
		}
		if (devicePeqStore.connection !== conn) return null;
		if (devicePeqStore.activeSlot === slot) devicePeqStore.layout = { slot, hints };
		return plan(hints);
	}

	/**
	 * Ask uniPEQ to write the shared list. It plans the write itself, and one that needs review
	 * comes back as `status.review`, which opens the same review dialog here as in uniPEQ.
	 */
	async writeLinked(): Promise<void> {
		await this.linkDevice?.write().catch((e: unknown) => this.fail(e, 'write'));
	}

	/** This page's answer to uniPEQ's review; either side's answer closes both dialogs. */
	async answerReview(rev: number, accept: boolean): Promise<void> {
		await this.linkDevice?.review(rev, accept).catch((e: unknown) => this.fail(e, 'write'));
	}

	/**
	 * Send `plan` to the preset Device EQ shows. Whether it was written. An automatic write that
	 * fails stops auto-write on this connection.
	 */
	async write(plan: PushPlan, auto = false): Promise<boolean> {
		const conn = devicePeqStore.connection;
		const request = devicePeqStore.writeTarget;
		if (!conn || !request) return false;
		const snapshot = { filters: eqStore.filters, preamp: eqStore.preamp };
		devicePeqStore.isWriting = true;
		try {
			const result = await conn.device.push({ ...writeOf(plan), ...request });
			devicePeqStore.synced = snapshot;
			devicePeqStore.autoPaused = false;
			const count = plan.sent;
			if (result.reconnect) {
				// The device restarts to save. Its transport is gone; `reopen` finds it again.
				await conn.device.close().catch(noop);
				// Unless the user disconnected while it wrote.
				if (devicePeqStore.connection === conn) {
					devicePeqStore.needsReconnect = true;
					void this.#awaitRestart(conn, {
						waiting: m.equalizer_device_peq_status_saved_reconnecting(),
						back: m.equalizer_device_peq_status_saved_reconnected({ count }),
						manual: m.equalizer_device_peq_status_saved_reconnect()
					});
				}
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
			return true;
		} catch (e) {
			if (auto) devicePeqStore.autoStopped = true;
			this.fail(e, 'write', auto ? m.equalizer_device_peq_auto_stopped() : undefined);
			return false;
		} finally {
			devicePeqStore.isWriting = false;
		}
	}

	/** Switch the device to what Device EQ picked: `p<id>` for a preset, `on`, or `off`. */
	async choose(value: string): Promise<void> {
		const conn = devicePeqStore.connection;
		if (!conn) return;
		// An edit waiting to be auto-written belongs to the preset it was made on.
		this.#cancelPending();
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
		// Another preset, or the EQ on or off, changes what plays as much as a write does. Over the
		// link uniPEQ warns for its own device.
		if (!this.linkDevice && volumeWarning.ask(() => void this.choose(value))) return;
		devicePeqStore.isSwitching = true;
		try {
			if (value === 'off') {
				await conn.device.setEnabled(false);
				devicePeqStore.played('off');
			} else {
				await conn.device.setEnabled(true, slot);
				devicePeqStore.played(slot);
			}
			await this.#readEqControls(conn);
		} catch (e) {
			this.fail(e, 'switch');
		} finally {
			devicePeqStore.isSwitching = false;
		}
	}

	// ── The device's own preset list ──────────────────────────────────────────

	/** Read the device's presets and where it is again, after an edit to the list. */
	async #relist(conn: DeviceConnection, keep = false): Promise<void> {
		const slots = await listPresets(conn);
		const { slot, enabled } = await playing(conn);
		if (slots && devicePeqStore.connection === conn) {
			devicePeqStore.relisted(slots, slot, enabled, keep);
		}
	}

	/**
	 * One edit to the device's preset list, as one operation; the list is read again whatever it
	 * did. `refused` is what to say when the device won't take the request as given (a name it
	 * can't store): the user's to put right, so it is said without the failure toast.
	 */
	async #editPresets(
		conn: DeviceConnection,
		edit: () => Promise<string>,
		keep = false,
		refused?: string
	): Promise<boolean> {
		devicePeqStore.isSwitching = true;
		try {
			const done = await edit();
			await this.#relist(conn, keep);
			devicePeqStore.setStatus(done);
			return true;
		} catch (e) {
			if (refused !== undefined && isInvalidRequest(e)) devicePeqStore.setStatus(refused, true);
			else this.fail(e, 'preset');
			if (!devicePeqStore.needsReconnect) await this.#relist(conn, keep).catch(noop);
			return false;
		} finally {
			devicePeqStore.isSwitching = false;
		}
	}

	/** Add an empty preset to the device. The device goes over to it, and so do Read and Write. */
	async createPreset(): Promise<void> {
		const conn = devicePeqStore.connection;
		const create = conn?.device.createSlot?.bind(conn.device);
		const room = devicePeqStore.slotRoom;
		if (!conn || !create || !devicePeqStore.canEditPresets || devicePeqStore.isBusy) return;
		if (room !== null && devicePeqStore.slots.length >= room) return;
		// An edit waiting to be auto-written belongs to the preset it was made on.
		this.#cancelPending();
		// The device goes over to the new preset, which is flat: as audible as a write.
		if (volumeWarning.ask(() => void this.createPreset())) return;
		let made: Slot | undefined;
		const added = await this.#editPresets(conn, async () => {
			made = await create();
			return m.device_presets_created({ name: made.name });
		});
		if (!added || !made || devicePeqStore.connection !== conn) return;
		await this.choose(`p${made.id}`);
		// Going over to the new preset clears the line, as any change of target does: say it again,
		// unless the switch itself failed and said so.
		if (!devicePeqStore.statusIsError) {
			devicePeqStore.setStatus(m.device_presets_created({ name: made.name }));
		}
	}

	/**
	 * Rename preset `id`; true when the device took the name. A name the device can't store is
	 * refused as it is, not shortened to fit, and the caller says so where the name was typed.
	 */
	async renamePreset(id: number, name: string): Promise<boolean> {
		const conn = devicePeqStore.connection;
		const rename = conn?.device.renameSlot?.bind(conn.device);
		const slot = devicePeqStore.slots.find((s) => s.id === id);
		if (!conn || !rename || !slot || !devicePeqStore.canEditPresets) return false;
		if (devicePeqStore.isBusy) return false;
		const next = name.trim();
		if (next === slot.name) return true;
		return this.#editPresets(
			conn,
			async () => {
				await rename(slot.id, next);
				return m.device_presets_renamed({ name: next });
			},
			true,
			m.device_presets_name_refused()
		);
	}

	/**
	 * Delete preset `id`, for good. The device may move to another of its presets, and the ones
	 * after the deleted one are renumbered: Device EQ then shows where the device is.
	 */
	async deletePreset(id: number): Promise<void> {
		const conn = devicePeqStore.connection;
		const remove = conn?.device.deleteSlot?.bind(conn.device);
		const slot = devicePeqStore.slots.find((s) => s.id === id);
		if (!conn || !remove || !slot || !devicePeqStore.canEditPresets) return;
		if (devicePeqStore.isBusy || devicePeqStore.slots.length <= 1) return;
		// A waiting auto-write was aimed at the target's id, which the delete may move.
		this.#cancelPending();
		// The device may go over to another preset: as audible as a write.
		if (volumeWarning.ask(() => void this.deletePreset(id))) return;
		const deleted = await this.#editPresets(conn, async () => {
			await remove(slot.id);
			return m.device_presets_deleted({ name: slot.name });
		});
		// On another preset now, the EQ's settings may be that one's.
		if (deleted && devicePeqStore.connection === conn) await this.#readEqControls(conn);
	}

	// ── The device's EQs ──────────────────────────────────────────────────────

	/**
	 * Reach another of the device's EQs: Device EQ, Read, Write and the limits are that EQ's from
	 * now on. Like picking another preset, it reads nothing and leaves the band list alone; whether
	 * the EQ holds the list is unknown until a Read or a Write.
	 */
	async selectEq(id: string | undefined): Promise<void> {
		const store = devicePeqStore;
		if (this.linkDevice || store.isBusy || store.needsReconnect || id === store.eq) return;
		if (!store.eqs.some((e) => e.id === id && e.present)) return;
		await this.#openEq(id);
	}

	/**
	 * Open EQ `id` as connecting opens one. The device is asked again which EQs its mode has: one
	 * that has gone is shown absent, and the profile's own EQ is opened in its place.
	 */
	async #openEq(id: string | undefined): Promise<void> {
		const conn = devicePeqStore.opened;
		if (!conn) return;
		// An edit waiting to be auto-written belongs to the EQ it was made on.
		this.#cancelPending();
		devicePeqStore.isSwitching = true;
		try {
			const absent = await absentEqs(conn);
			const gone = id !== undefined && absent.includes(id) ? id : undefined;
			const { eq, view, slot, enabled, listed } = await openEq(
				conn,
				gone === undefined ? id : undefined
			);
			if (devicePeqStore.opened !== conn) return;
			devicePeqStore.selectEq(view, eq, slot, enabled, absent, listed);
			// The mode that brought or took an EQ did the same to its settings.
			await this.#readControls(view);
			const named = (of: string | undefined) => eqName(devicePeqStore.eqs.find((e) => e.id === of));
			devicePeqStore.setStatus(
				gone === undefined
					? m.device_eq_status({ eq: named(eq.id) })
					: m.device_eq_status_gone({ eq: named(gone), own: named(eq.id) })
			);
		} catch (e) {
			this.fail(e, 'eq');
		} finally {
			devicePeqStore.isSwitching = false;
		}
	}

	/**
	 * An operation on a listed EQ was refused as unsupported. If the device's mode has lost that
	 * EQ, the profile's own is opened instead; otherwise the failure stands as it was said.
	 */
	async #checkEq(): Promise<void> {
		const conn = devicePeqStore.opened;
		const id = devicePeqStore.eq;
		if (!conn || id === undefined) return;
		if (await eqThere(conn, id).catch(() => true)) return;
		// Another device, or another EQ, by now: nothing to fall back from.
		if (devicePeqStore.opened !== conn || devicePeqStore.eq !== id) return;
		await this.#openEq(id);
	}

	// ── The device's own settings ─────────────────────────────────────────────

	/**
	 * Read the device's settings into the store. A failed read is not an error: the rows don't
	 * show (or stay as they were) and the EQ works without them.
	 */
	async #readControls(conn: DeviceConnection): Promise<void> {
		const { device } = conn;
		if (!device.readControls || !device.capabilities.controls?.length) return;
		try {
			const values = await device.readControls();
			if (devicePeqStore.connection === conn) devicePeqStore.controlValues = values;
		} catch (e) {
			console.warn("Device PEQ: could not read the device's settings:", e);
		}
	}

	/**
	 * Read them again where a setting of the EQ may have moved with it: a device can keep one with
	 * each preset (a Qudelix's crossfeed), so after a switch or a Read. Only for a device that has one.
	 */
	async #readEqControls(conn: DeviceConnection): Promise<void> {
		if (conn.device.capabilities.controls?.some((c) => c.eq !== undefined)) {
			await this.#readControls(conn);
		}
	}

	/** Set one of the device's settings to `value`, now. */
	setControl(id: string, value: number): Promise<void> {
		return this.setControls([[id, value]]);
	}

	/**
	 * Set the device's settings, in order. Written at once and no part of the band list: not an undo
	 * step, never sent by Write, nothing to do with whether the device holds the list. The rows
	 * show what the device reads back, so a write it refuses leaves them where they were. One that
	 * restarts the device (`reconnect`) ends the run, and the device is reopened as after a save.
	 */
	async setControls(changes: readonly (readonly [id: string, value: number])[]): Promise<void> {
		const conn = devicePeqStore.connection;
		const device = conn?.device;
		if (!conn || !device?.writeControl || changes.length === 0 || devicePeqStore.isBusy) return;
		const known = device.capabilities.controls ?? [];
		const steps = changes.flatMap(([id, value]) => {
			const control = known.find((c) => c.id === id);
			return control ? [{ control, value }] : [];
		});
		if (steps.length !== changes.length) return;
		// An output gain or a headroom changes how loud the device plays, as a write does.
		if (volumeWarning.ask(() => void this.setControls(changes))) return;
		devicePeqStore.isSettingControl = true;
		try {
			await this.#writeControls(conn, device.writeControl.bind(device), steps);
		} catch (e) {
			this.fail(e, 'control');
			if (!devicePeqStore.needsReconnect) await this.#readControls(conn);
		} finally {
			devicePeqStore.isSettingControl = false;
		}
	}

	async #writeControls(
		conn: DeviceConnection,
		write: NonNullable<PeqDevice['writeControl']>,
		steps: { control: Control; value: number }[]
	): Promise<void> {
		let last = steps[0];
		let restarts = false;
		for (const step of steps) {
			last = step;
			restarts = (await write(step.control.id, step.value)).reconnect;
			if (restarts) break;
		}
		const control = controlLabel(last.control);
		if (!restarts) {
			// One setting can decide which others exist (a USB mode), so all of them are read again.
			await this.#readControls(conn);
			devicePeqStore.setStatus(
				m.device_control_set({ control, value: controlValueLabel(last.control, last.value) })
			);
			return;
		}
		await conn.device.close().catch(noop);
		if (devicePeqStore.connection !== conn) return;
		devicePeqStore.needsReconnect = true;
		void this.#awaitRestart(conn, {
			waiting: m.device_control_restarting({ control }),
			back: m.device_control_restarted({ control }),
			manual: m.device_control_restart_reconnect({ control })
		});
	}

	// ── Auto-write ────────────────────────────────────────────────────────────

	/**
	 * Turn auto-write on or off. On writes the list once, now: from then on the device follows
	 * every change. Off drops an edit still waiting.
	 */
	setAutoWrite(on: boolean): void {
		const link = this.linkDevice;
		if (link) {
			void link.setAutoWrite(on).catch((e: unknown) => this.fail(e, 'auto-write'));
			return;
		}
		devicePeqStore.autoStopped = false;
		settingsStore.setDevicePeqAutoWrite(on);
		if (!on) {
			this.#cancelPending();
			devicePeqStore.autoPaused = false;
			devicePeqStore.autoClipRisk = false;
			return;
		}
		this.install();
		void this.#flush();
	}

	/**
	 * Start following the band list. Idempotent; called on connect. The root is never disposed:
	 * like the audio player's, it lives as long as the page.
	 */
	install(): void {
		if (this.#installed) return;
		this.#installed = true;
		$effect.root(() => {
			$effect(() => {
				const seen: Seen = {
					filters: eqStore.filters,
					preamp: eqStore.preamp,
					conn: devicePeqStore.connection
				};
				untrack(() => this.#changed(seen));
			});
		});
	}

	#changed(now: Seen): void {
		const before = this.#seen;
		this.#seen = now;
		// A new connection is a new baseline, never an edit: connecting must not write. uniPEQ writes
		// its own device from the shared list, on the `settle` the link sends.
		if (before?.conn !== now.conn || !now.conn) {
			this.#cancelPending();
			return;
		}
		if (now.conn.connectionType === 'link') return;
		if (before.filters === now.filters && before.preamp === now.preamp) return;
		if (!this.autoWriting) return;
		this.#cancelPending();
		this.#timer = setTimeout(() => void this.#flush(), AUTO_WRITE_DELAY_MS);
	}

	#cancelPending(): void {
		clearTimeout(this.#timer);
		this.#timer = undefined;
	}

	/** One write at a time; edits made during one are written next, as the list is by then. */
	async #flush(): Promise<void> {
		this.#timer = undefined;
		if (this.#running) {
			this.#queued++;
			return;
		}
		this.#running = true;
		try {
			let seen: number;
			do {
				seen = this.#queued;
				if (!this.autoWriting || devicePeqStore.needsReconnect || this.linkDevice) return;
				if (devicePeqStore.isBusy) {
					// A read, a switch or a button write is under way: try again after it.
					this.#timer = setTimeout(() => void this.#flush(), AUTO_WRITE_DELAY_MS);
					return;
				}
				if (devicePeqStore.inSync === true) {
					devicePeqStore.autoPaused = false;
					continue;
				}
				// Not now stops auto-write on this connection, or every edit would ask again.
				const stop = () => (devicePeqStore.autoStopped = true);
				if (volumeWarning.ask(() => void this.#flush(), stop)) return;
				const plan = await this.prepare();
				if (!plan) return;
				devicePeqStore.autoClipRisk = plan.clipRisk;
				if (needsReview(plan)) {
					devicePeqStore.autoPaused = true;
					continue;
				}
				if (!(await this.write(plan, true))) return;
			} while (this.#queued !== seen);
		} finally {
			this.#running = false;
		}
	}
}

export const devicePeqService = new DevicePeqService();
