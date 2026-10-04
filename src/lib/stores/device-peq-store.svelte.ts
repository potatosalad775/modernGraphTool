/**
 * Device PEQ Store — the connected EQ device and what the panel is doing with it.
 *
 * Connecting makes the device's eqcaps profile the active EQ constraint, and disconnecting
 * restores the user's own pick. Here rather than in `DevicePeq.svelte`, so it holds however the
 * connection ends and whether or not the panel is mounted. It never edits the filters: bands that
 * don't fit are flagged, and the user fits them when they choose to.
 */
import type { DeviceConnection } from '$lib/device-peq/types.js';
import type { Slot } from '@potatosalad775/eqcaps-device-bridge';
import { eqConstraintsStore } from './eq-constraints-store.svelte.js';

class DevicePeqStore {
	connection = $state.raw<DeviceConnection | null>(null);
	isConnecting = $state(false);
	isReading = $state(false);
	isWriting = $state(false);
	/** The preset slot reads and writes target; null when the device has none or can't say. */
	activeSlot = $state<number | null>(null);
	/** Whether the device's EQ is on, when known. */
	eqEnabled = $state<boolean | null>(null);
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
		return this.isConnecting || this.isReading || this.isWriting;
	}

	get deviceName(): string | null {
		return this.connection?.name ?? null;
	}

	/** EQ memories to read from and write to — the bypass preset is the off switch, not one. */
	get slots(): Slot[] {
		return (this.connection?.device.capabilities.slots ?? []).filter((s) => !s.bypass);
	}

	setConnected(connection: DeviceConnection, currentSlot: number | null): void {
		this.connection = connection;
		this.isConnecting = false;
		this.needsReconnect = false;
		const bypass = connection.device.capabilities.slots.find((s) => s.bypass);
		// A device reading back its bypass preset has its EQ off, and no memory is selected.
		const onBypass = bypass !== undefined && currentSlot === bypass.id;
		this.activeSlot = onBypass
			? (this.slots[0]?.id ?? null)
			: (currentSlot ?? this.slots[0]?.id ?? null);
		this.eqEnabled = onBypass ? false : currentSlot !== null ? true : null;
		this.statusMessage = null;
		eqConstraintsStore.setDeviceConstraint(connection.profile, connection.name);
	}

	setDisconnected(): void {
		this.connection = null;
		this.isConnecting = false;
		this.isReading = false;
		this.isWriting = false;
		this.activeSlot = null;
		this.eqEnabled = null;
		this.statusMessage = null;
		this.needsReconnect = false;
		eqConstraintsStore.clearDeviceConstraint();
	}

	setStatus(message: string | null): void {
		this.statusMessage = message;
	}
}

export const devicePeqStore = new DevicePeqStore();
