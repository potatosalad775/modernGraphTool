/**
 * Device PEQ Store — reactive state for USB/network device PEQ connection.
 */
import type { ConnectedDevice, ConnectionType, DeviceSlot } from '$lib/device-peq/types.js';

class DevicePeqStore {
	isConnected = $state(false);
	isConnecting = $state(false);
	deviceName = $state<string | null>(null);
	manufacturer = $state<string | null>(null);
	connectionType = $state<ConnectionType | null>(null);
	activeSlot = $state<number | null>(null);
	slots = $state<DeviceSlot[]>([]);
	isReading = $state(false);
	isWriting = $state(false);
	statusMessage = $state<string | null>(null);
	device = $state<ConnectedDevice | null>(null);

	setConnected(device: ConnectedDevice, slots: DeviceSlot[], currentSlot: number): void {
		this.device = device;
		this.isConnected = true;
		this.isConnecting = false;
		this.deviceName = device.model;
		this.manufacturer = device.manufacturer;
		this.connectionType = device.connectionType;
		this.slots = slots;
		this.activeSlot = currentSlot;
		this.statusMessage = `Connected: ${device.model}`;
	}

	setDisconnected(): void {
		this.device = null;
		this.isConnected = false;
		this.isConnecting = false;
		this.deviceName = null;
		this.manufacturer = null;
		this.connectionType = null;
		this.activeSlot = null;
		this.slots = [];
		this.isReading = false;
		this.isWriting = false;
		this.statusMessage = null;
	}

	setStatus(message: string): void {
		this.statusMessage = message;
	}
}

export const devicePeqStore = new DevicePeqStore();
