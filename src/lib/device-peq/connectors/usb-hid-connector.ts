/**
 * USB HID Connector — wraps navigator.hid for device discovery and communication.
 */
import type {
	ConnectedDevice,
	DeviceFilter,
	DeviceHandler,
	DeviceModelConfig,
	PullResult,
	UsbHidVendorConfig
} from '../types.js';

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
		const deviceDetails = vendorConfig.devices[model] || {};
		const modelConfig: DeviceModelConfig = {
			...vendorConfig.defaultModelConfig,
			...deviceDetails.modelConfig
		};
		const handler = deviceDetails.handler || vendorConfig.handler;

		if (currentDevice != null) return currentDevice;
		if (!rawDevice.opened) await rawDevice.open();

		currentDevice = {
			rawDevice,
			manufacturer: deviceDetails.manufacturer || vendorConfig.manufacturer,
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

	const filtersToWrite = [...filters];

	if (filtersToWrite.length > device.modelConfig.maxFilters) {
		console.warn(
			`USB Device PEQ: Truncating ${filtersToWrite.length} filters to ${device.modelConfig.maxFilters} (device limit)`
		);
		filtersToWrite.splice(device.modelConfig.maxFilters);
	}

	for (let i = 0; i < filtersToWrite.length; i++) {
		if (filtersToWrite[i].freq < 20 || filtersToWrite[i].freq > 20000) {
			filtersToWrite[i].freq = 100;
		}
		if (filtersToWrite[i].q < 0.01 || filtersToWrite[i].q > 100) {
			filtersToWrite[i].q = 1;
		}
	}

	const hasLSHSFilters = filtersToWrite.some(
		(filter) => (filter.type === 'LSQ' || filter.type === 'HSQ') && filter.gain !== 0
	);
	const needsPreGain = preamp < 0;

	if (hasLSHSFilters && device.modelConfig.supportsLSHSFilters === false) {
		for (let i = 0; i < filtersToWrite.length; i++) {
			if (
				(filtersToWrite[i].type === 'LSQ' || filtersToWrite[i].type === 'HSQ') &&
				filtersToWrite[i].gain !== 0
			) {
				filtersToWrite[i].type = 'PK';
				filtersToWrite[i].gain = 0;
			}
		}
	}

	if (hasLSHSFilters && device.modelConfig.supportsLSHSFilters === false) {
		if (needsPreGain && device.modelConfig.supportsPregain === false) {
			console.warn(
				"Device doesn't support LS/HS filters and auto pregain - both will be ignored"
			);
		} else {
			console.warn('Device only supports Peak filters - ignoring LS/HS filters');
		}
	} else if (needsPreGain && device.modelConfig.supportsPregain === false) {
		console.warn('Device does not support auto calculated pregain');
	}

	if (
		filtersToWrite.length < device.modelConfig.maxFilters &&
		device.modelConfig.defaultResetFiltersValues
	) {
		const defaultFilter = device.modelConfig.defaultResetFiltersValues[0];
		for (let i = filtersToWrite.length; i < device.modelConfig.maxFilters; i++) {
			filtersToWrite.push({
				type: (defaultFilter.filterType as DeviceFilter['type']) || 'PK',
				freq: defaultFilter.freq,
				q: defaultFilter.q,
				gain: defaultFilter.gain
			});
		}
	}

	return await device.handler.pushToDevice(device, slot, preamp, filtersToWrite);
}

export async function pullFromDevice(
	device: ConnectedDevice,
	slot: number
): Promise<PullResult> {
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
