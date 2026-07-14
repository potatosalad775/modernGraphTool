/**
 * Type declarations for WebHID and WebSerial APIs.
 * These are experimental browser APIs not yet in lib.dom.d.ts.
 */

// ---------------------------------------------------------------------------
// WebHID API
// ---------------------------------------------------------------------------

interface HIDDeviceFilter {
	vendorId?: number;
	productId?: number;
	usagePage?: number;
	usage?: number;
}

interface HIDDeviceRequestOptions {
	filters: HIDDeviceFilter[];
}

interface HIDReportItem {
	reportCount?: number;
	reportSize?: number;
	reportId?: number;
}

interface HIDReportInfo {
	reportId: number;
	items?: HIDReportItem[];
}

interface HIDCollectionInfo {
	usagePage?: number;
	usage?: number;
	type?: number;
	children?: HIDCollectionInfo[];
	inputReports?: HIDReportInfo[];
	outputReports?: HIDReportInfo[];
	featureReports?: HIDReportInfo[];
}

interface HIDInputReportEvent extends Event {
	readonly device: HIDDevice;
	readonly reportId: number;
	readonly data: DataView;
}

interface HIDDevice extends EventTarget {
	readonly opened: boolean;
	readonly vendorId: number;
	readonly productId: number;
	readonly productName: string;
	readonly collections: HIDCollectionInfo[];
	open(): Promise<void>;
	close(): Promise<void>;
	sendReport(reportId: number, data: ArrayBufferView | ArrayBuffer): Promise<void>;
	sendFeatureReport(reportId: number, data: ArrayBufferView | ArrayBuffer): Promise<void>;
	receiveFeatureReport(reportId: number): Promise<DataView>;
	oninputreport: ((this: HIDDevice, ev: HIDInputReportEvent) => void) | null;
	addEventListener(
		type: 'inputreport',
		listener: (ev: HIDInputReportEvent) => void,
		options?: boolean | AddEventListenerOptions
	): void;
	removeEventListener(
		type: 'inputreport',
		listener: (ev: HIDInputReportEvent) => void,
		options?: boolean | EventListenerOptions
	): void;
}

interface HID extends EventTarget {
	getDevices(): Promise<HIDDevice[]>;
	requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
}

// ---------------------------------------------------------------------------
// WebSerial API
// ---------------------------------------------------------------------------

interface SerialPortFilter {
	usbVendorId?: number;
	usbProductId?: number;
	bluetoothServiceClassId?: string;
}

interface SerialPortRequestOptions {
	filters?: SerialPortFilter[];
	allowedBluetoothServiceClassIds?: string[];
}

interface SerialPortInfo {
	usbVendorId?: number;
	usbProductId?: number;
	bluetoothServiceClassId?: string;
}

interface SerialOptions {
	baudRate: number;
	dataBits?: number;
	stopBits?: number;
	parity?: 'none' | 'even' | 'odd';
	bufferSize?: number;
	flowControl?: 'none' | 'hardware';
}

interface SerialPort extends EventTarget {
	readonly readable: ReadableStream<Uint8Array> | null;
	readonly writable: WritableStream<Uint8Array> | null;
	open(options: SerialOptions): Promise<void>;
	close(): Promise<void>;
	getInfo(): SerialPortInfo;
}

interface Serial extends EventTarget {
	getPorts(): Promise<SerialPort[]>;
	requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
}

// ---------------------------------------------------------------------------
// Web Bluetooth API
// ---------------------------------------------------------------------------

interface BluetoothRequestDeviceFilter {
	namePrefix?: string;
	services?: string[];
	name?: string;
	manufacturerData?: { companyIdentifier: number }[];
}

interface RequestDeviceOptions {
	filters?: BluetoothRequestDeviceFilter[];
	optionalServices?: string[];
	acceptAllDevices?: boolean;
}

interface BluetoothRemoteGATTCharacteristicProperties {
	readonly write: boolean;
	readonly writeWithoutResponse: boolean;
	readonly read: boolean;
	readonly notify: boolean;
	readonly indicate: boolean;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
	readonly uuid: string;
	readonly properties: BluetoothRemoteGATTCharacteristicProperties;
	readonly value: DataView | null;
	readValue(): Promise<DataView>;
	writeValue(value: ArrayBufferView | ArrayBuffer): Promise<void>;
	writeValueWithResponse(value: ArrayBufferView | ArrayBuffer): Promise<void>;
	writeValueWithoutResponse(value: ArrayBufferView | ArrayBuffer): Promise<void>;
	startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
	stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
	addEventListener(
		type: 'characteristicvaluechanged',
		listener: (ev: Event) => void,
		options?: boolean | AddEventListenerOptions
	): void;
	removeEventListener(
		type: 'characteristicvaluechanged',
		listener: (ev: Event) => void,
		options?: boolean | EventListenerOptions
	): void;
}

interface BluetoothRemoteGATTService {
	readonly uuid: string;
	getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
	getCharacteristics(characteristic?: string): Promise<BluetoothRemoteGATTCharacteristic[]>;
}

interface BluetoothRemoteGATTServer {
	readonly connected: boolean;
	readonly device: BluetoothDevice;
	connect(): Promise<BluetoothRemoteGATTServer>;
	disconnect(): void;
	getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
	getPrimaryServices(service?: string): Promise<BluetoothRemoteGATTService[]>;
}

interface BluetoothDevice extends EventTarget {
	readonly id: string;
	readonly name: string | undefined;
	readonly gatt: BluetoothRemoteGATTServer;
	addEventListener(
		type: 'gattserverdisconnected',
		listener: (ev: Event) => void,
		options?: boolean | AddEventListenerOptions
	): void;
	removeEventListener(
		type: 'gattserverdisconnected',
		listener: (ev: Event) => void,
		options?: boolean | EventListenerOptions
	): void;
}

interface Bluetooth extends EventTarget {
	requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
	getDevices?(): Promise<BluetoothDevice[]>;
}

// ---------------------------------------------------------------------------
// Augment Navigator
// ---------------------------------------------------------------------------

interface Navigator {
	readonly hid: HID;
	readonly serial: Serial;
	readonly bluetooth: Bluetooth;
}
