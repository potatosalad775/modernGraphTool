/**
 * Type declarations for WebHID and WebSerial APIs.
 * These are experimental browser APIs not yet in lib.dom.d.ts.
 */

/* eslint-disable @typescript-eslint/no-empty-object-type */

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
// Augment Navigator
// ---------------------------------------------------------------------------

interface Navigator {
	readonly hid: HID;
	readonly serial: Serial;
}
