/**
 * Device PEQ Types — shared across handlers, connectors, config, store, and UI.
 */

/** Standard filter type codes used across all device handlers */
export type DeviceFilterType = 'PK' | 'LSQ' | 'HSQ';

/** A single PEQ filter as exchanged between handlers and the UI */
export interface DeviceFilter {
	type: DeviceFilterType;
	freq: number;
	q: number;
	gain: number;
	disabled?: boolean;
}

/** Result from pulling filters from a device */
export interface PullResult {
	filters: DeviceFilter[];
	globalGain: number;
}

/** An EQ preset slot on a device */
export interface DeviceSlot {
	id: number;
	name: string;
}

/** Default filter values used to reset unused filter slots */
export interface DefaultResetFilter {
	gain: number;
	freq: number;
	q: number;
	filterType: string;
}

/** Per-model hardware capabilities and configuration */
export interface DeviceModelConfig {
	minGain: number;
	maxGain: number;
	maxFilters: number;
	firstWritableEQSlot: number;
	maxWritableEQSlots: number;
	disconnectOnSave: boolean;
	disabledPresetId: number;
	experimental: boolean;
	supportsPregain?: boolean;
	supportsLSHSFilters?: boolean;
	defaultResetFiltersValues?: DefaultResetFilter[];
	availableSlots: DeviceSlot[];
	/** HID report ID (FiiO-specific) */
	reportId?: number;
	/** Walkplay scheme number */
	schemeNo?: number;
	/** KTMicro frequency doubling compensation */
	compensate2X?: boolean;
	/** Walkplay default index override */
	defaultIndex?: number;
	/** Serial baud rate override */
	baudRate?: number;
	/** Read-only device flag */
	readOnly?: boolean;
}

/** Connection type for device communication */
export type ConnectionType = 'hid' | 'serial' | 'network';

/**
 * Handler interface that each device-specific handler must implement.
 * All methods receive a ConnectedDevice object from a connector.
 */
export interface DeviceHandler {
	getCurrentSlot(device: ConnectedDevice): Promise<number>;
	pullFromDevice(device: ConnectedDevice, slot: number): Promise<PullResult>;
	pushToDevice(
		device: ConnectedDevice,
		slot: number,
		preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean>;
	enablePEQ(device: ConnectedDevice, enabled: boolean, slotId: number): Promise<void>;
}

/** A connected device returned by a connector */
export interface ConnectedDevice {
	rawDevice: HIDDevice | SerialPort | null;
	manufacturer: string;
	model: string;
	handler: DeviceHandler;
	modelConfig: DeviceModelConfig;
	connectionType: ConnectionType;
	/** Serial port info (serial only) */
	info?: SerialPortInfo;
	/** Read/write shims for serial devices */
	readable?: { read(): Promise<ReadableStreamReadResult<Uint8Array>> };
	writable?: { write(data: Uint8Array): Promise<void> };
	/** Network device IP (network only) */
	ip?: string;
	/** Firmware version (populated by some handlers) */
	version?: number | null;
}

/** USB HID device vendor configuration entry */
export interface UsbHidVendorConfig {
	vendorIds: number[];
	manufacturer: string;
	handler: DeviceHandler;
	defaultModelConfig: DeviceModelConfig;
	devices: Record<
		string,
		{
			manufacturer?: string;
			handler?: DeviceHandler;
			modelConfig?: Partial<DeviceModelConfig>;
			supportsLSHSFilters?: boolean;
			supportsPregain?: boolean;
		}
	>;
}

/** Bluetooth SPP filter configuration for serial devices */
export interface BluetoothFilters {
	usbVendorId: number | null;
	allowedBluetoothServiceClassIds: string[];
	bluetoothServiceClassId: string;
}

/** USB Serial device vendor configuration entry */
export interface UsbSerialVendorConfig {
	vendorId?: number;
	manufacturer: string;
	handler: DeviceHandler;
	filters?: BluetoothFilters;
	devices: Record<
		string,
		{
			usbProductId?: number;
			modelConfig: DeviceModelConfig;
		}
	>;
}
