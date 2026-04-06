//
// Moondrop Old Fashioned USB HID handler — ported from legacy moondropOldFashionedUsbHidHandler.js
//
// Simple register read/write protocol. Report ID 75, 10-byte packets.
// Only PK filters, gain -12.8 to +12.7 dB range.
//

import type { ConnectedDevice, DeviceHandler, DeviceFilter, PullResult } from '../types.js';

const REPORT_ID = 75;
const EQ_REG_BASE = 38;
const WRITE_REG = 87; // 'W'
const SAVE_REG = 83; // 'S'
const READ_REG = 82; // 'R'

const PACKET_LEN = 10;
const SCALE_GAIN = 10;
const SCALE_Q = 1000;
const DELAY_MS = 100;

const ADDR = 0;
const CMD = 4;
const DATA_SLOT_GAIN = 6;
const DATA_SLOT_Q = 6;
const DATA_SLOT_FREQUENCY = 8;

function sleep(ms = DELAY_MS): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFilterRegAddr(filterIndex: number): number {
	return EQ_REG_BASE + filterIndex * 2;
}

function createPacket(builder: (view: DataView) => void): Uint8Array {
	const buffer = new ArrayBuffer(PACKET_LEN);
	const view = new DataView(buffer);
	builder(view);
	return new Uint8Array(buffer);
}

async function readRegister(device: HIDDevice, addr: number): Promise<DataView> {
	const packet = createPacket((view) => {
		view.setUint8(ADDR, addr);
		view.setUint8(CMD, READ_REG);
	});

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			device.removeEventListener('inputreport', onReport);
			reject(new Error('Timeout reading register'));
		}, 1000);

		const onReport = (event: HIDInputReportEvent) => {
			const data = new DataView(event.data.buffer);
			clearTimeout(timeout);
			device.removeEventListener('inputreport', onReport);
			resolve(data);
		};

		device.addEventListener('inputreport', onReport);
		device.sendReport(REPORT_ID, packet);
	});
}

async function writeRegister(
	device: HIDDevice,
	addr: number,
	dataBuilder: (view: DataView) => void
): Promise<void> {
	const packet = createPacket((view) => {
		view.setUint8(ADDR, addr);
		view.setUint8(CMD, WRITE_REG);
		dataBuilder(view);
	});
	await device.sendReport(REPORT_ID, packet);
}

async function readSingleFilter(device: HIDDevice, filterIndex: number): Promise<DeviceFilter> {
	const regAddr = getFilterRegAddr(filterIndex);

	const data1 = await readRegister(device, regAddr);
	const freq = data1.getUint16(DATA_SLOT_FREQUENCY, true);
	const gainRaw = data1.getInt8(DATA_SLOT_GAIN);
	const gain = Math.max(-12.8, Math.min(12.7, gainRaw / SCALE_GAIN));

	await sleep();

	const data2 = await readRegister(device, regAddr + 1);
	const q = data2.getInt16(DATA_SLOT_Q, true) / SCALE_Q;

	return { freq, gain, q, type: 'PK' };
}

async function writeSingleFilter(
	device: HIDDevice,
	filterIndex: number,
	filter: DeviceFilter
): Promise<void> {
	const regAddr = getFilterRegAddr(filterIndex);

	await writeRegister(device, regAddr, (view) => {
		const gainVal = Math.round(filter.gain * SCALE_GAIN);
		const clampedGain = Math.max(-128, Math.min(127, gainVal));
		view.setInt8(DATA_SLOT_GAIN, clampedGain);
		view.setUint16(DATA_SLOT_FREQUENCY, filter.freq, true);
	});

	await sleep();

	await writeRegister(device, regAddr + 1, (view) => {
		const qVal = Math.round(filter.q * SCALE_Q);
		view.setInt16(DATA_SLOT_Q, qVal, true);
	});

	await sleep();
}

async function saveToFlash(device: HIDDevice): Promise<void> {
	const packet = createPacket((view) => {
		view.setUint8(CMD, SAVE_REG);
	});
	await device.sendReport(REPORT_ID, packet);
}

// ── Exported handler ──────────────────────────────────────────────────────────

export const moondropOldFashionedHidHandler: DeviceHandler = {
	async getCurrentSlot(_device: ConnectedDevice): Promise<number> {
		return 0;
	},

	async pullFromDevice(deviceDetails: ConnectedDevice): Promise<PullResult> {
		const device = deviceDetails.rawDevice as HIDDevice;
		const filters: DeviceFilter[] = [];
		const filterCount = deviceDetails.modelConfig.maxFilters || 5;

		for (let i = 0; i < filterCount; i++) {
			const filter = await readSingleFilter(device, i);
			filters.push(filter);
			await sleep();
		}

		return { filters, globalGain: 0 };
	},

	async pushToDevice(
		deviceDetails: ConnectedDevice,
		_slot: number,
		_preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean> {
		const device = deviceDetails.rawDevice as HIDDevice;
		const filterCount = deviceDetails.modelConfig.maxFilters || 5;

		for (let i = 0; i < filters.length && i < filterCount; i++) {
			await writeSingleFilter(device, i, filters[i]);
		}

		await saveToFlash(device);
		console.log(`USB Device PEQ: Old Fashioned pushed ${filters.length} filters`);
		return false;
	},

	async enablePEQ(): Promise<void> {
		// Old Fashioned does not support enable/disable toggle
	}
};
