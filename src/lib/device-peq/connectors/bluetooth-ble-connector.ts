/**
 * Bluetooth BLE Connector — wraps navigator.bluetooth for GATT device discovery and communication.
 */
import type {
	BleDeviceConfig,
	ConnectedDevice,
	DeviceFilter,
	DeviceModelConfig,
	PullResult
} from '../types.js';
import { normalizeFiltersForDevice } from '../normalize-filters.js';

let currentDevice: ConnectedDevice | null = null;

function buildRequestOptions(config: BleDeviceConfig[]): RequestDeviceOptions {
	const filters: BluetoothRequestDeviceFilter[] = [];
	const optionalServices = new Set<string>();

	for (const entry of config) {
		const filter: BluetoothRequestDeviceFilter = {};
		if (entry.filters?.namePrefix) {
			filter.namePrefix = entry.filters.namePrefix;
		}
		if (Array.isArray(entry.filters?.services) && entry.filters.services.length > 0) {
			filter.services = entry.filters.services;
			entry.filters.services.forEach((s) => optionalServices.add(s));
		}
		if (Object.keys(filter).length > 0) {
			filters.push(filter);
		}
		if (entry.gatt?.serviceUuid) {
			optionalServices.add(entry.gatt.serviceUuid);
		}
	}

	const requestOptions: RequestDeviceOptions =
		filters.length > 0 ? { filters } : { acceptAllDevices: true };
	if (optionalServices.size > 0) {
		requestOptions.optionalServices = Array.from(optionalServices);
	}
	return requestOptions;
}

function matchConfigEntry(
	deviceName: string,
	config: BleDeviceConfig[]
): BleDeviceConfig | null {
	if (!deviceName) return null;
	return (
		config.find((entry) => {
			if (entry.filters?.namePrefix && deviceName.startsWith(entry.filters.namePrefix)) {
				return true;
			}
			if (entry.devices && Object.prototype.hasOwnProperty.call(entry.devices, deviceName)) {
				return true;
			}
			return false;
		}) ?? null
	);
}

function resolveModelConfig(entry: BleDeviceConfig, deviceName: string): DeviceModelConfig {
	const deviceDetails =
		entry.devices?.[deviceName] ||
		entry.devices?.[Object.keys(entry.devices || {})[0]] ||
		{};
	return {
		...(entry.defaultModelConfig || ({} as DeviceModelConfig)),
		...deviceDetails.modelConfig
	} as DeviceModelConfig;
}

function createNotificationQueue(
	rxChar: BluetoothRemoteGATTCharacteristic
): (timeoutMs?: number) => Promise<Uint8Array | null> {
	const queue: Uint8Array[] = [];
	const waiters: ((value: Uint8Array | null) => void)[] = [];

	rxChar.addEventListener('characteristicvaluechanged', ((event: Event) => {
		const target = event.target as BluetoothRemoteGATTCharacteristic;
		if (!target.value) return;
		const value = new Uint8Array(target.value.buffer);
		if (waiters.length > 0) {
			const resolver = waiters.shift()!;
			resolver(value);
		} else {
			queue.push(value);
		}
	}) as EventListener);

	return async function readNotification(timeoutMs = 5000): Promise<Uint8Array | null> {
		if (queue.length > 0) {
			return queue.shift()!;
		}
		return await new Promise<Uint8Array | null>((resolve) => {
			const timer = setTimeout(() => resolve(null), timeoutMs);
			waiters.push((value) => {
				clearTimeout(timer);
				resolve(value);
			});
		});
	};
}

export async function getDeviceConnected(
	config: BleDeviceConfig[]
): Promise<ConnectedDevice | null> {
	try {
		const requestOptions = buildRequestOptions(config);
		const rawDevice = await navigator.bluetooth.requestDevice(requestOptions);

		const entry = matchConfigEntry(rawDevice.name || '', config);
		if (!entry) {
			console.error('Bluetooth BLE: No configuration found for device:', rawDevice.name);
			return null;
		}

		if (currentDevice) return currentDevice;

		const server = await rawDevice.gatt.connect();
		const serviceUuid = entry.gatt?.serviceUuid || entry.filters?.services?.[0];
		if (!serviceUuid) {
			console.error('Bluetooth BLE: No service UUID configured');
			return null;
		}
		const service = await server.getPrimaryService(serviceUuid);
		const txChar = await service.getCharacteristic(entry.gatt.txCharacteristicUuid);
		const rxChar = await service.getCharacteristic(entry.gatt.rxCharacteristicUuid);

		await rxChar.startNotifications();
		const readNotification = createNotificationQueue(rxChar);

		const modelConfig = resolveModelConfig(entry, rawDevice.name || '');
		const model = rawDevice.name || 'Bluetooth Device';

		currentDevice = {
			rawDevice,
			manufacturer: entry.manufacturer || 'Bluetooth',
			model,
			modelConfig,
			handler: entry.handler,
			connectionType: 'ble',
			txChar,
			rxChar,
			readNotification
		};

		rawDevice.addEventListener('gattserverdisconnected', () => {
			currentDevice = null;
		});

		return currentDevice;
	} catch (error) {
		if (error && (error as DOMException).name === 'NotFoundError') {
			console.log('Bluetooth device chooser cancelled by user.');
			return null;
		}
		console.error('Failed to connect to Bluetooth BLE device:', error);
		return null;
	}
}

export async function disconnectDevice(): Promise<void> {
	if (currentDevice?.rawDevice) {
		try {
			const bleDevice = currentDevice.rawDevice as BluetoothDevice;
			if (bleDevice.gatt?.connected) {
				bleDevice.gatt.disconnect();
			}
			currentDevice = null;
		} catch (error) {
			console.error('Failed to disconnect BLE device:', error);
		}
	}
}

export async function pushToDevice(
	device: ConnectedDevice,
	slot: number,
	preamp: number,
	filters: DeviceFilter[]
): Promise<boolean> {
	if (!device?.handler) {
		console.error('No device handler available for pushing.');
		return true;
	}
	const filtersToWrite = normalizeFiltersForDevice(filters, device.modelConfig);
	return await device.handler.pushToDevice(device, slot, preamp, filtersToWrite);
}

export async function pullFromDevice(
	device: ConnectedDevice,
	slot: number
): Promise<PullResult> {
	if (device?.handler) {
		return await device.handler.pullFromDevice(device, slot);
	}
	console.error('No device handler available for pulling.');
	return { filters: [], globalGain: 0 };
}

export function getAvailableSlots(device: ConnectedDevice) {
	return device.modelConfig.availableSlots;
}

export async function getCurrentSlot(device: ConnectedDevice): Promise<number> {
	if (device?.handler) return await device.handler.getCurrentSlot(device);
	console.error('No device handler available for querying');
	return -2;
}

export async function enablePEQ(
	device: ConnectedDevice,
	enabled: boolean,
	slotId: number
): Promise<void> {
	if (device?.handler) {
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
