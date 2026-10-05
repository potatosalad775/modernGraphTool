/**
 * Device PEQ service — reads, writes and switches the connected device, and auto-write.
 *
 * Out of `DevicePeq.svelte` because auto-write has to outlive the panel: panels unmount on every
 * switch, and a change made in the graph or by AutoEQ with the EQ panel closed still has to reach
 * the device. The panel keeps only what needs it: the review dialog and the controls.
 */
import { untrack } from 'svelte';
import { toast } from 'svelte-sonner';
import * as m from '$lib/paraglide/messages.js';
import { describeDeviceError, isConnectionLost } from '$lib/device-peq/errors.js';
import { readRequest } from '$lib/device-peq/preset.js';
import { needsReview, planPush, readLayout, type PushPlan } from '$lib/device-peq/push-plan.js';
import type { DeviceConnection } from '$lib/device-peq/types.js';
import { devicePeqStore } from '$lib/stores/device-peq-store.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { settingsStore } from '$lib/stores/settings-store.svelte.js';
import { fromCapsFilter } from '$lib/utils/eq-constraint.js';
import type { EQFilter } from '$lib/utils/equalizer.js';
import type { Filter } from '@potatosalad775/eqcaps-core';
import { eqCommands } from './eq-commands.js';

/** How long after the last edit auto-write waits: one slider drag is one write, not dozens. */
export const AUTO_WRITE_DELAY_MS = 700;

/** What the auto-writer last saw, to tell an edit from a reconnect or a toggle. */
type Seen = { filters: EQFilter[]; preamp: number; conn: DeviceConnection | null };

class DevicePeqService {
	#installed = false;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#running = false;
	#again = false;
	#seen: Seen | null = null;

	/** The auto-write switch: the saved setting, unless a failed write stopped it on this connection. */
	get autoWriteOn(): boolean {
		return settingsStore.devicePeqAutoWrite && !devicePeqStore.autoStopped;
	}

	/** Auto-write is on, and this device can take it. */
	get autoWriting(): boolean {
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

	/** Replace the band list with what Device EQ shows. */
	async read(): Promise<void> {
		const conn = devicePeqStore.connection;
		const request = devicePeqStore.readTarget;
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
		// A new connection is a new baseline, never an edit: connecting must not write.
		if (!before || before.conn !== now.conn || !now.conn) return this.#cancelPending();
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
				if (!this.autoWriting || devicePeqStore.needsReconnect) return;
				if (devicePeqStore.isBusy) {
					// A read, a switch or a button write is under way: try again after it.
					this.#timer = setTimeout(() => void this.#flush(), AUTO_WRITE_DELAY_MS);
					return;
				}
				if (devicePeqStore.inSync === true) {
					devicePeqStore.autoPaused = false;
					continue;
				}
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
