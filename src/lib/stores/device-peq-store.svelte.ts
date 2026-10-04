/**
 * Device PEQ Store — the connected EQ device and what the panel is doing with it.
 *
 * Connecting makes the device's eqcaps profile the active EQ constraint, and disconnecting
 * restores the user's own pick. Here rather than in `DevicePeq.svelte`, so it holds however the
 * connection ends and whether or not the panel is mounted. It never edits the filters: bands that
 * don't fit are flagged, and the user fits them when they choose to.
 */
import type { DeviceConnection } from '$lib/device-peq/types.js';
import type { EQFilter } from '$lib/utils/equalizer.js';
import type { Slot } from '@potatosalad775/eqcaps-device-bridge';
import { eqConstraintsStore } from './eq-constraints-store.svelte.js';

/**
 * What the Device EQ control shows: a listed preset (by id), the EQ off, a preset the device is
 * on that isn't listed (a built-in one), or null when the device can't say.
 */
export type DeviceEqSelection = number | 'off' | 'other' | null;

/** The band list and preamp as they were when last read from or written to the device. */
export interface DeviceSnapshot {
	filters: EQFilter[];
	preamp: number;
}

class DevicePeqStore {
	connection = $state.raw<DeviceConnection | null>(null);
	isConnecting = $state(false);
	isReading = $state(false);
	isWriting = $state(false);
	isSwitching = $state(false);
	/** The listed preset reads and writes target; null when the device lists none. */
	activeSlot = $state<number | null>(null);
	/**
	 * The preset the device is on, as it last reported or was told: may be unlisted (a built-in
	 * preset) or the bypass preset. Null when unknown. Protocols that only read and write the
	 * current preset can reach `activeSlot` only while this equals it.
	 */
	deviceSlot = $state<number | null>(null);
	/** Whether the device's EQ is on, when known. */
	eqEnabled = $state<boolean | null>(null);
	/** What the device held after the last read or write, to tell whether the list has moved on. */
	synced = $state.raw<DeviceSnapshot | null>(null);
	statusMessage = $state<string | null>(null);
	/**
	 * The device dropped the connection after saving (some do by design), so the next operation
	 * needs a fresh one. The connection itself is kept for its name and `reopen`.
	 */
	needsReconnect = $state(false);

	get isConnected(): boolean {
		return this.connection !== null;
	}

	get isBusy(): boolean {
		return this.isConnecting || this.isReading || this.isWriting || this.isSwitching;
	}

	get deviceName(): string | null {
		return this.connection?.name ?? null;
	}

	/** EQ memories to read from and write to — the bypass preset is the off switch, not one. */
	get slots(): Slot[] {
		return (this.connection?.device.capabilities.slots ?? []).filter((s) => !s.bypass);
	}

	get selection(): DeviceEqSelection {
		if (this.eqEnabled === false) return 'off';
		const d = this.deviceSlot;
		if (d !== null && this.slots.length > 0 && !this.slots.some((s) => s.id === d)) return 'other';
		if (this.eqEnabled === null && this.connection?.device.capabilities.canEnable) return null;
		return this.activeSlot;
	}

	setConnected(connection: DeviceConnection, currentSlot: number | null): void {
		this.connection = connection;
		this.isConnecting = false;
		this.needsReconnect = false;
		const bypass = connection.device.capabilities.slots.find((s) => s.bypass);
		// A device reading back its bypass preset has its EQ off, and no memory is selected.
		const onBypass = bypass !== undefined && currentSlot === bypass.id;
		const listed = this.slots.some((s) => s.id === currentSlot);
		this.deviceSlot = currentSlot;
		this.activeSlot = listed ? currentSlot : (this.slots[0]?.id ?? null);
		this.eqEnabled = onBypass ? false : currentSlot !== null ? true : null;
		this.synced = null;
		this.statusMessage = null;
		eqConstraintsStore.setDeviceConstraint(connection.profile, connection.name);
	}

	/** The device was switched to `slot` (undefined: EQ on, no preset named) or its EQ off. */
	played(choice: number | 'off' | undefined): void {
		if (choice === 'off') {
			this.eqEnabled = false;
			const bypass = this.connection?.device.capabilities.slots.find((s) => s.bypass);
			if (bypass) this.deviceSlot = bypass.id;
			return;
		}
		this.eqEnabled = true;
		if (choice === undefined) return;
		this.deviceSlot = choice;
		this.target(choice);
	}

	/** Read and write `slot` from now on. What the device held there is no longer known. */
	target(slot: number): void {
		if (this.activeSlot === slot) return;
		this.activeSlot = slot;
		this.synced = null;
	}

	setDisconnected(): void {
		this.connection = null;
		this.isConnecting = false;
		this.isReading = false;
		this.isWriting = false;
		this.isSwitching = false;
		this.activeSlot = null;
		this.deviceSlot = null;
		this.eqEnabled = null;
		this.synced = null;
		this.statusMessage = null;
		this.needsReconnect = false;
		eqConstraintsStore.clearDeviceConstraint();
	}

	setStatus(message: string | null): void {
		this.statusMessage = message;
	}
}

export const devicePeqStore = new DevicePeqStore();
