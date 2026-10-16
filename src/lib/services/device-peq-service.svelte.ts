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
import { untrack } from 'svelte';
import { toast } from 'svelte-sonner';
import * as m from '#lib/paraglide/messages.js';
import { describeDeviceError, isConnectionLost } from '#lib/device-peq/errors.js';
import { LinkPeqDevice } from '#lib/device-peq/link.js';
import { readRequest } from '#lib/device-peq/preset.js';
import { needsReview, planPush, readLayout, type PushPlan } from '#lib/device-peq/push-plan.js';
import type { ConnectResult } from '#lib/device-peq/connect.js';
import type { NetworkDeviceType } from '#lib/device-peq/network-types.js';
import type { DeviceConnection } from '#lib/device-peq/types.js';
import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { linkStore } from '#lib/stores/link-store.svelte.js';
import { settingsStore } from '#lib/stores/settings-store.svelte.js';
import { fromCapsFilter } from '#lib/utils/eq-constraint.js';
import type { EQFilter } from '#lib/utils/equalizer.js';
import type { Filter } from '@potatosalad775/eqcaps-core';
import { eqCommands } from './eq-commands.js';
import { volumeWarning } from './volume-warning.svelte.js';

/** How long after the last edit auto-write waits: one slider drag is one write, not dozens. */
export const AUTO_WRITE_DELAY_MS = 700;

/** The transports a browser connects through its own device APIs. */
export type DeviceKind = 'hid' | 'serial' | 'ble';

/** What the auto-writer last saw, to tell an edit from a reconnect or a toggle. */
type Seen = { filters: EQFilter[]; preamp: number; conn: DeviceConnection | null };

class DevicePeqService {
	#installed = false;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#running = false;
	#again = false;
	#seen: Seen | null = null;

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
	async connect(kind: DeviceKind): Promise<'unsupported' | void> {
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
	async pick(id: string): Promise<'unsupported' | void> {
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
		if (link) return link.reconnect().catch((e) => this.fail(e, 'connect'));
		devicePeqStore.isConnecting = true;
		try {
			const again = conn.reopen ? await conn.reopen() : null;
			if (again) await this.#connected(again);
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
		await conn.device.close().catch(() => {});
		devicePeqStore.setDisconnected();
	}

	async #settle(result: ConnectResult): Promise<'unsupported' | void> {
		if (result.kind === 'connected') await this.#connected(result.connection);
		else if (result.kind === 'choose') devicePeqStore.choice = result;
		else if (result.kind === 'unsupported') return 'unsupported';
	}

	async #connected(conn: DeviceConnection): Promise<void> {
		const slot = await conn.device.currentSlot().catch(() => null);
		devicePeqStore.setConnected(conn, slot);
		this.install();
		// Auto-write writes without a press, so its volume warning comes now, before any edit.
		if (this.autoWriting) {
			volumeWarning.ask(undefined, () => (devicePeqStore.autoStopped = true));
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
			await link.pull().catch((e) => this.fail(e, 'read'));
			return;
		}
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
		const plan = (hints?: (Filter | null)[] | null) =>
			planPush(eqStore.filters, eqStore.preamp, conn.profile, caps, hints ?? undefined);
		const first = plan(devicePeqStore.layout?.hints);
		if (first.emptySlots === 0 || devicePeqStore.layout) return first;
		const slot = devicePeqStore.activeSlot;
		devicePeqStore.isWriting = true;
		let hints: (Filter | null)[] | null;
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
		await this.linkDevice?.write().catch((e) => this.fail(e, 'write'));
	}

	/** This page's answer to uniPEQ's review; either side's answer closes both dialogs. */
	async answerReview(rev: number, accept: boolean): Promise<void> {
		await this.linkDevice?.review(rev, accept).catch((e) => this.fail(e, 'write'));
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
			const result = await conn.device.push({
				filters: plan.filters,
				...(plan.preamp !== undefined ? { preamp: plan.preamp } : {}),
				...request
			});
			devicePeqStore.synced = snapshot;
			devicePeqStore.autoPaused = false;
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
		} catch (e) {
			this.fail(e, 'switch');
		} finally {
			devicePeqStore.isSwitching = false;
		}
	}

	// ── Auto-write ────────────────────────────────────────────────────────────

	/**
	 * Turn auto-write on or off. On writes the list once, now: from then on the device follows
	 * every change. Off drops an edit still waiting.
	 */
	setAutoWrite(on: boolean): void {
		const link = this.linkDevice;
		if (link) {
			void link.setAutoWrite(on).catch((e) => this.fail(e, 'auto-write'));
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
		if (!before || before.conn !== now.conn || !now.conn) return this.#cancelPending();
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
			this.#again = true;
			return;
		}
		this.#running = true;
		try {
			do {
				this.#again = false;
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
			} while (this.#again);
		} finally {
			this.#running = false;
		}
	}
}

export const devicePeqService = new DevicePeqService();
