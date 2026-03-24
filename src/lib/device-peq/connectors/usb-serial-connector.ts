/**
 * USB Serial Connector — wraps navigator.serial for device discovery and communication.
 */
import type {
	ConnectedDevice,
	DeviceFilter,
	DeviceModelConfig,
	PullResult,
	UsbSerialVendorConfig
} from '../types.js';

let currentDevice: ConnectedDevice | null = null;

export async function getDeviceConnected(
	config: UsbSerialVendorConfig[]
): Promise<ConnectedDevice | null> {
	try {
		const filters: SerialPortFilter[] = [];
		const bluetoothServiceIds: string[] = [];

		for (const entry of config) {
			if (entry.vendorId) {
				filters.push({ usbVendorId: entry.vendorId });
			}
			if (entry.filters?.allowedBluetoothServiceClassIds) {
				for (const serviceId of entry.filters.allowedBluetoothServiceClassIds) {
					filters.push({ bluetoothServiceClassId: serviceId } as SerialPortFilter);
					bluetoothServiceIds.push(serviceId);
				}
			}
		}

		const requestOptions: SerialPortRequestOptions = {};
		if (filters.length > 0) requestOptions.filters = filters;
		if (bluetoothServiceIds.length > 0) {
			(requestOptions as Record<string, unknown>).allowedBluetoothServiceClassIds =
				bluetoothServiceIds;
		}

		const rawDevice = await navigator.serial.requestPort(requestOptions);
		const info = rawDevice.getInfo();
		const productId = info.usbProductId;
		const bluetoothServiceClassId = (info as Record<string, unknown>)
			.bluetoothServiceClassId as string | undefined;

		let vendorConfig: UsbSerialVendorConfig | null = null;
		let modelName: string | null = null;
		let modelConfig: DeviceModelConfig | undefined;
		let handler = null;

		for (const entry of config) {
			let deviceMatched = false;

			if (entry.vendorId && entry.vendorId === info.usbVendorId) {
				for (const [name, model] of Object.entries(entry.devices)) {
					if (model.usbProductId === productId) {
						vendorConfig = entry;
						modelName = name;
						modelConfig = model.modelConfig;
						handler = entry.handler;
						deviceMatched = true;
						break;
					}
				}
			}

			if (!deviceMatched && entry.filters) {
				const svc = (bluetoothServiceClassId || '').toLowerCase();
				const cfgSingle = (entry.filters.bluetoothServiceClassId || '').toLowerCase();
				const cfgList = Array.isArray(entry.filters.allowedBluetoothServiceClassIds)
					? entry.filters.allowedBluetoothServiceClassIds.map((x) =>
							String(x).toLowerCase()
						)
					: [];
				if ((svc && cfgSingle && svc === cfgSingle) || (svc && cfgList.includes(svc))) {
					const deviceEntries = Object.entries(entry.devices);
					if (deviceEntries.length > 0) {
						const [name, model] = deviceEntries[0];
						vendorConfig = entry;
						modelName = name;
						modelConfig = model.modelConfig;
						handler = entry.handler;
						deviceMatched = true;
					}
				}
			}

			if (deviceMatched) break;
		}

		if (!vendorConfig || !modelConfig || !handler) {
			console.error('Unsupported serial device');
			return null;
		}

		const defaultBaud = bluetoothServiceClassId ? 9600 : 115200;
		const baudRate =
			modelConfig.baudRate && !bluetoothServiceClassId ? modelConfig.baudRate : defaultBaud;
		await rawDevice.open({ baudRate });

		// Create read/write shims that don't hold locks persistently
		let readable: ConnectedDevice['readable'] = undefined;
		let writable: ConnectedDevice['writable'] = undefined;
		try {
			if (rawDevice.readable) {
				readable = {
					async read() {
						const r = rawDevice.readable!.getReader();
						try {
							return await r.read();
						} finally {
							try {
								r.releaseLock();
							} catch {
								/* ignore */
							}
						}
					}
				};
			}
			if (rawDevice.writable) {
				writable = {
					async write(data: Uint8Array) {
						const w = rawDevice.writable!.getWriter();
						try {
							await w.write(data);
						} finally {
							try {
								w.releaseLock();
							} catch {
								/* ignore */
							}
						}
					}
				};
			}
		} catch (e) {
			console.warn('UsbSerialConnector: Failed to set up read/write shims:', e);
		}

		currentDevice = {
			rawDevice,
			info,
			manufacturer: vendorConfig.manufacturer,
			model: modelName || 'Unknown Serial Device',
			handler,
			modelConfig,
			connectionType: 'serial',
			readable,
			writable
		};
		return currentDevice;
	} catch (error) {
		console.error('Failed to connect to Serial device:', error);
		return null;
	}
}

export async function disconnectDevice(): Promise<void> {
	if (currentDevice?.rawDevice) {
		try {
			await (currentDevice.rawDevice as SerialPort).close();
			currentDevice = null;
		} catch (error) {
			console.error('Failed to disconnect serial device:', error);
		}
	}
}

export async function pushToDevice(
	device: ConnectedDevice,
	slot: number,
	preamp: number,
	filters: DeviceFilter[]
): Promise<boolean | undefined> {
	if (!device?.handler) return;
	return await device.handler.pushToDevice(device, slot, preamp, filters);
}

export async function pullFromDevice(
	device: ConnectedDevice,
	slot: number
): Promise<PullResult> {
	if (!device?.handler) return { filters: [], globalGain: 0 };
	return await device.handler.pullFromDevice(device, slot);
}

export function getAvailableSlots(device: ConnectedDevice) {
	return device.modelConfig.availableSlots;
}

export async function getCurrentSlot(device: ConnectedDevice): Promise<number> {
	if (device?.handler) return await device.handler.getCurrentSlot(device);
	return -2;
}

export async function enablePEQ(
	device: ConnectedDevice,
	enabled: boolean,
	slotId: number
): Promise<void> {
	if (device?.handler) return await device.handler.enablePEQ(device, enabled, slotId);
}

export function getCurrentDevice(): ConnectedDevice | null {
	return currentDevice;
}

export function clearCurrentDevice(): void {
	currentDevice = null;
}
