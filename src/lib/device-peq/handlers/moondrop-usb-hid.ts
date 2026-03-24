import type {
	ConnectedDevice,
	DeviceHandler,
	DeviceFilter,
	DeviceFilterType,
	PullResult
} from '../types.js';

const REPORT_ID = 0x4b;

const COMMAND_WRITE = 1;
const COMMAND_READ = 128; // 0x80
const COMMAND_UPDATE_EQ = 9;
const COMMAND_UPDATE_EQ_COEFF_TO_REG = 10;
const COMMAND_SAVE_EQ_TO_FLASH = 1;
const COMMAND_SET_DAC_OFFSET = 3;

function buildReadPacket(filterIndex: number): Uint8Array {
	return new Uint8Array([COMMAND_READ, COMMAND_UPDATE_EQ, 0x18, 0x00, filterIndex, 0x00]);
}

function decodeFilterResponse(data: Uint8Array): DeviceFilter {
	const e = new Int8Array(data.buffer);

	const rawFreq = (e[27] & 0xff) | ((e[28] & 0xff) << 8);
	const freq = rawFreq;

	const q = (e[30] & 0xff) + (e[29] & 0xff) / 256;
	const rawGain = e[32] + (e[31] & 0xff) / 256;
	const gain = Math.floor(rawGain * 10) / 10;
	const filterType = convertToFilterType(e[33]);
	const valid = freq > 10 && freq < 24000 && !isNaN(gain) && !isNaN(q);

	return {
		type: filterType,
		freq: valid ? freq : 0,
		q: valid ? q : 1.0,
		gain: valid ? gain : 0.0,
		disabled: !valid
	};
}

function convertToFilterType(byte: number): DeviceFilterType {
	switch (byte) {
		case 1:
			return 'LSQ';
		case 2:
			return 'PK';
		case 3:
			return 'HSQ';
		default:
			return 'PK';
	}
}

function convertFromFilterType(filterType: DeviceFilterType): number {
	const mapping: Record<DeviceFilterType, number> = { PK: 2, LSQ: 1, HSQ: 3 };
	return mapping[filterType] ?? 2;
}

async function getCurrentSlot(deviceDetails: ConnectedDevice): Promise<number> {
	const device = deviceDetails.rawDevice as HIDDevice;
	const request = new Uint8Array([0x80, 0x0f, 0x00]);

	return new Promise<number>((resolve, reject) => {
		const timeout = setTimeout(() => {
			device.removeEventListener('inputreport', onReport);
			reject(new Error('Timeout reading current slot'));
		}, 1000);

		const onReport = (event: HIDInputReportEvent): void => {
			const data = new Uint8Array(event.data.buffer);
			if (data[0] !== 0x80 || data[1] !== 0x0f) return;

			clearTimeout(timeout);
			device.removeEventListener('inputreport', onReport);
			resolve(data[3]);
		};

		device.addEventListener('inputreport', onReport);
		device.sendReport(REPORT_ID, request);
	});
}

async function readFullFilter(device: HIDDevice, filterIndex: number): Promise<DeviceFilter> {
	const packet = buildReadPacket(filterIndex);

	return new Promise<DeviceFilter>((resolve, reject) => {
		const timeout = setTimeout(() => {
			device.removeEventListener('inputreport', onReport);
			reject(new Error('Timeout reading filter'));
		}, 1000);

		const onReport = (event: HIDInputReportEvent): void => {
			const data = new Uint8Array(event.data.buffer);
			if (data[0] !== COMMAND_READ || data[1] !== COMMAND_UPDATE_EQ) return;

			clearTimeout(timeout);
			device.removeEventListener('inputreport', onReport);
			resolve(decodeFilterResponse(data));
		};

		device.addEventListener('inputreport', onReport);
		device.sendReport(REPORT_ID, packet);
	});
}

async function readPregain(device: HIDDevice): Promise<number> {
	const request = new Uint8Array([COMMAND_READ, COMMAND_SET_DAC_OFFSET]);

	return new Promise<number>((resolve, reject) => {
		const timeout = setTimeout(() => {
			device.removeEventListener('inputreport', onReport);
			reject(new Error('Timeout reading pregain'));
		}, 1000);

		const onReport = (event: HIDInputReportEvent): void => {
			const data = new Uint8Array(event.data.buffer);
			if (data[0] !== COMMAND_READ || data[1] !== COMMAND_SET_DAC_OFFSET) return;

			clearTimeout(timeout);
			device.removeEventListener('inputreport', onReport);
			resolve(data[4]);
		};

		device.addEventListener('inputreport', onReport);
		device.sendReport(REPORT_ID, request);
	});
}

async function writePregain(device: HIDDevice, value: number): Promise<void> {
	const request = new Uint8Array([COMMAND_WRITE, COMMAND_SET_DAC_OFFSET, 0x02, 0x00, value]);
	await device.sendReport(REPORT_ID, request);
}

function encodeBiquad(freq: number, gain: number, q: number): number[] {
	const A = Math.pow(10, gain / 40);
	const w0 = (2 * Math.PI * freq) / 96000;
	const alpha = Math.sin(w0) / (2 * q);
	const cosW0 = Math.cos(w0);
	const norm = 1 + alpha / A;

	const b0 = (1 + alpha * A) / norm;
	const b1 = (-2 * cosW0) / norm;
	const b2 = (1 - alpha * A) / norm;
	const a1 = -b1;
	const a2 = (1 - alpha / A) / norm;

	return [b0, b1, b2, a1, -a2].map((c) => Math.round(c * 1073741824));
}

function encodeToByteArray(coeffs: number[]): Uint8Array {
	const arr = new Uint8Array(20);
	for (let i = 0; i < coeffs.length; i++) {
		const val = coeffs[i];
		arr[i * 4] = val & 0xff;
		arr[i * 4 + 1] = (val >> 8) & 0xff;
		arr[i * 4 + 2] = (val >> 16) & 0xff;
		arr[i * 4 + 3] = (val >> 24) & 0xff;
	}
	return arr;
}

function buildWritePacket(filterIndex: number, filter: DeviceFilter): Uint8Array {
	const { freq, gain, q, type } = filter;
	const packet = new Uint8Array(63);
	packet[0] = COMMAND_WRITE;
	packet[1] = COMMAND_UPDATE_EQ;
	packet[2] = 0x18; // bLength
	packet[3] = 0x00;
	packet[4] = filterIndex;
	packet[5] = 0x00;
	packet[6] = 0x00;

	const coeffs = encodeToByteArray(encodeBiquad(freq, gain, q));
	packet.set(coeffs, 7);

	packet[27] = freq & 0xff;
	packet[28] = (freq >> 8) & 0xff;
	packet[29] = Math.round((q % 1) * 256);
	packet[30] = Math.floor(q);
	packet[31] = Math.round((gain % 1) * 256);
	packet[32] = Math.floor(gain);
	packet[33] = convertFromFilterType(type);
	packet[34] = 0;
	packet[35] = 7; // peqIndex

	return packet;
}

function buildEnablePacket(filterIndex: number): Uint8Array {
	const packet = new Uint8Array(63);
	packet[0] = COMMAND_WRITE;
	packet[1] = COMMAND_UPDATE_EQ_COEFF_TO_REG;
	packet[2] = filterIndex;
	packet[3] = 0;
	packet[4] = 255;
	packet[5] = 255;
	packet[6] = 255;
	return packet;
}

function buildSavePacket(): Uint8Array {
	return new Uint8Array([COMMAND_WRITE, COMMAND_SAVE_EQ_TO_FLASH]);
}

async function pullFromDevice(deviceDetails: ConnectedDevice, _slot: number): Promise<PullResult> {
	const device = deviceDetails.rawDevice as HIDDevice;
	const filters: DeviceFilter[] = [];

	for (let i = 0; i < deviceDetails.modelConfig.maxFilters; i++) {
		const filter = await readFullFilter(device, i);
		filters.push(filter);
	}

	const globalGain = await readPregain(device);

	return { filters, globalGain };
}

async function pushToDevice(
	deviceDetails: ConnectedDevice,
	_slot: number,
	globalGain: number,
	filters: DeviceFilter[]
): Promise<boolean> {
	const device = deviceDetails.rawDevice as HIDDevice;

	for (let i = 0; i < filters.length && i < deviceDetails.modelConfig.maxFilters; i++) {
		const writeFilter = buildWritePacket(i, filters[i]);
		await device.sendReport(REPORT_ID, writeFilter);

		const enable = buildEnablePacket(i);
		await device.sendReport(REPORT_ID, enable);
	}

	await writePregain(device, globalGain);

	const save = buildSavePacket();
	await device.sendReport(REPORT_ID, save);

	return false;
}

export const moondropUsbHidHandler: DeviceHandler = {
	getCurrentSlot,
	pullFromDevice,
	pushToDevice,
	enablePEQ: async (_device: ConnectedDevice, _enabled: boolean, _slotId: number) => {}
};
