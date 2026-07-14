/**
 * USB HID Connector — wraps navigator.hid for device discovery and communication.
 */
import type {
	ConnectedDevice,
	DeviceFilter,
	DeviceModelConfig,
	PullResult,
	UsbHidVendorConfig
} from '../types.js';
import { normalizeFiltersForDevice } from '../normalize-filters.js';

let currentDevice: ConnectedDevice | null = null;

export async function getDeviceConnected(
	config: UsbHidVendorConfig[]
): Promise<ConnectedDevice | null> {
	try {
		const vendorFilters = config.flatMap((entry) =>
			entry.vendorIds.map((vendorId) => ({ vendorId }))
		);
		const selectedDevices = await navigator.hid.requestDevice({ filters: vendorFilters });
		if (selectedDevices.length === 0) return null;

		const rawDevice = selectedDevices[0];
		const vendorConfig = config.find((entry) => entry.vendorIds.includes(rawDevice.vendorId));
		if (!vendorConfig) {
			console.error('No configuration found for vendor:', rawDevice.vendorId);
			return null;
		}

		const model = rawDevice.productName;
		let deviceDetails = vendorConfig.devices[model];

		// If no productName match, try matching by productId in deviceGroups
		if (!deviceDetails && vendorConfig.deviceGroups) {
			for (const [groupName, groupConfig] of Object.entries(vendorConfig.deviceGroups)) {
				if (groupConfig.productIds.includes(rawDevice.productId)) {
					deviceDetails = { modelConfig: groupConfig.modelConfig };
					console.log(
						`Matched device by productId in group: ${groupName} (0x${rawDevice.productId.toString(16)})`
					);
					break;
				}
			}
		}

		const resolvedDetails = deviceDetails || {};
		const modelConfig: DeviceModelConfig = {
			...vendorConfig.defaultModelConfig,
			...resolvedDetails.modelConfig
		};
		const handler = resolvedDetails.handler || vendorConfig.handler;

		if (currentDevice != null) return currentDevice;
		if (!rawDevice.opened) await rawDevice.open();

		currentDevice = {
			rawDevice,
			manufacturer: resolvedDetails.manufacturer || vendorConfig.manufacturer,
			model,
			handler,
			modelConfig,
			connectionType: 'hid'
		};
		return currentDevice;
	} catch (error) {
		console.error('Failed to connect to HID device:', error);
		return null;
	}
}

export async function disconnectDevice(): Promise<void> {
	if (currentDevice?.rawDevice) {
		try {
			await (currentDevice.rawDevice as HIDDevice).close();
			currentDevice = null;
		} catch (error) {
			console.error('Failed to disconnect device:', error);
		}
	}
}

async function checkDeviceConnected(device: ConnectedDevice): Promise<boolean> {
	const rawDevice = device.rawDevice as HIDDevice;
	const rawDevices = await navigator.hid.getDevices();
	const match = rawDevices.find(
		(d) => d.vendorId === rawDevice.vendorId && d.productId === rawDevice.productId
	);
	if (!match) {
		console.error('Device disconnected?');
		return false;
	}
	if (!match.opened) {
		await match.open();
		device.rawDevice = match;
	}
	return true;
}

export async function pushToDevice(
	device: ConnectedDevice,
	slot: number,
	preamp: number,
	filters: DeviceFilter[]
): Promise<boolean> {
	if (!(await checkDeviceConnected(device))) throw new Error('Device Disconnected');
	if (!device.handler) {
		console.error('No device handler available for pushing.');
		return true;
	}

	const filtersToWrite = normalizeFiltersForDevice(filters, device.modelConfig);
	return await device.handler.pushToDevice(device, slot, preamp, filtersToWrite);
}

export async function pullFromDevice(device: ConnectedDevice, slot: number): Promise<PullResult> {
	if (!(await checkDeviceConnected(device))) throw new Error('Device Disconnected');
	if (device.handler) {
		return await device.handler.pullFromDevice(device, slot);
	}
	console.error('No device handler available for pulling.');
	return { filters: [], globalGain: 0 };
}

export function getAvailableSlots(device: ConnectedDevice) {
	return device.modelConfig.availableSlots;
}

export async function getCurrentSlot(device: ConnectedDevice): Promise<number> {
	if (device.handler) return await device.handler.getCurrentSlot(device);
	console.error('No device handler available for querying');
	return -2;
}

export async function enablePEQ(
	device: ConnectedDevice,
	enabled: boolean,
	slotId: number
): Promise<void> {
	if (device.handler) {
		return await device.handler.enablePEQ(device, enabled, slotId);
	}
	console.error('No device handler available for enabling.');
}

export function getCurrentDevice(): ConnectedDevice | null {
	return currentDevice;
}

export function clearCurrentDevice(): void {
	currentDevice = null;
}
