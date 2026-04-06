/**
 * Network Device Connector — wraps HTTP-based communication for network audio devices.
 * Handler and config are loaded lazily from the registry.
 */
import type { ConnectedDevice, DeviceFilter, PullResult } from '../types.js';

let currentDevice: ConnectedDevice | null = null;

export async function getDeviceConnected(
	deviceIP: string,
	deviceType: string
): Promise<ConnectedDevice | null> {
	try {
		if (!deviceIP) {
			console.warn('No IP Address provided.');
			return null;
		}

		const { getNetworkHandlers } = await import('../registry.js');
		const handlers = await getNetworkHandlers();
		const entry = handlers[deviceType];

		if (!entry) {
			console.warn('Unsupported Device Type.');
			return null;
		}

		currentDevice = {
			rawDevice: null,
			ip: deviceIP,
			manufacturer: deviceType,
			model: deviceType,
			handler: entry.handler,
			modelConfig: entry.defaultModelConfig,
			connectionType: 'network'
		};
		return currentDevice;
	} catch (error) {
		console.error('Failed to connect to Network Device:', error);
		return null;
	}
}

export async function disconnectDevice(): Promise<void> {
	if (currentDevice) {
		currentDevice = null;
	}
}

export async function pushToDevice(
	device: ConnectedDevice,
	slot: number,
	preamp: number,
	filters: DeviceFilter[]
): Promise<boolean | undefined> {
	if (!currentDevice) {
		console.warn('No network device connected.');
		return;
	}
	return await currentDevice.handler.pushToDevice(currentDevice, slot, preamp, filters);
}

export async function pullFromDevice(
	device: ConnectedDevice,
	slot: number
): Promise<PullResult> {
	if (!currentDevice) {
		console.warn('No network device connected.');
		return { filters: [], globalGain: 0 };
	}
	return await currentDevice.handler.pullFromDevice(currentDevice, slot);
}

export async function getCurrentSlot(device: ConnectedDevice): Promise<number> {
	if (!currentDevice) return 0;
	return await currentDevice.handler.getCurrentSlot(currentDevice);
}

export async function enablePEQ(
	device: ConnectedDevice,
	enabled: boolean,
	slotId: number
): Promise<void> {
	if (!currentDevice) {
		console.warn('No network device connected.');
		return;
	}
	return await currentDevice.handler.enablePEQ(currentDevice, enabled, slotId);
}

export function getCurrentDevice(): ConnectedDevice | null {
	return currentDevice;
}

export function clearCurrentDevice(): void {
	currentDevice = null;
}
