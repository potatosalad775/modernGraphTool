//
// Topping USB HID Protocol Handler — ported from legacy toppingUsbHidHandler.js
//
// Per-band register writes (base = 0x90 + bandIndex).
// Echo-based reads: poke APPLY, then harvest echoed state packets.
// Half-dB gain steps, Q * 10000 encoding.
//
// NOTE: This handler is intentionally NOT registered in any device config or registry,
// matching the original project's pattern. The handler was imported by the original project
// but no device entries were ever created for it. getCurrentSlot and readVersion are stubs.
// It is included here for completeness and future use when Topping device support matures.
//

import type { ConnectedDevice, DeviceHandler, DeviceFilter, PullResult } from '../types.js';

const REPORT_ID = 0x01;

// ── Helpers ──────────────────────────────────────────────────────────────────

function bandBase(filterIndex: number): number {
	return (0x90 + filterIndex) & 0xff;
}

function encFreq(hz: number): number {
	return Math.max(1, Math.round(hz));
}

function encGainSteps(db: number): number {
	// Half-dB steps, signed 16-bit safe
	const v = Math.round(db * 2);
	return (v << 16) >> 16; // ensure signed 16-bit
}

function encQ(q: number): number {
	return Math.max(1, Math.round(q * 10000));
}

function makePacket(cmd: number, data: number): Uint8Array {
	const buf = new ArrayBuffer(5);
	const view = new DataView(buf);
	view.setUint8(0, cmd & 0xff);
	view.setUint32(1, data >>> 0, true);
	return new Uint8Array(buf);
}

async function sendCmd(device: HIDDevice, cmd: number, data: number): Promise<void> {
	const pkt = makePacket(cmd, data);
	await device.sendReport(REPORT_ID, pkt);
}

// Wait for echoed state packets and collect results
function collectEchoes(
	device: HIDDevice,
	wantedCmds: number[],
	ms = 120
): Promise<Map<number, number>> {
	return new Promise((resolve) => {
		const found = new Map<number, number>();
		const onReport = (e: HIDInputReportEvent) => {
			if (e.reportId !== REPORT_ID) return;
			const dv = e.data;
			if (dv.byteLength < 5) return;
			const cmd = dv.getUint8(0);
			if (!wantedCmds.includes(cmd)) return;
			const val = dv.getUint32(1, true);
			found.set(cmd, val);
		};
		device.addEventListener('inputreport', onReport);
		setTimeout(() => {
			device.removeEventListener('inputreport', onReport);
			resolve(found);
		}, ms);
	});
}

function decodeFilterResponse(
	cmd: number,
	value: number
): Partial<DeviceFilter & { disabled: boolean }> {
	const low = cmd & 0x0f;
	const out: Partial<DeviceFilter & { disabled: boolean }> = {};

	if (low === 0x06) out.disabled = value === 0;
	else if (low === 0x07) out.freq = value;
	else if (low === 0x08) out.gain = value / 2.0;
	else if (low === 0x09) out.q = value / 10000.0;

	return out;
}

async function readFullFilter(device: HIDDevice, filterIndex: number): Promise<DeviceFilter> {
	const base = (0x90 + filterIndex) & 0xff;

	// Trigger echo of current band state
	await sendCmd(device, (base + 0x0a) & 0xff, 1);

	const want = [
		(base + 0x06) & 0xff,
		(base + 0x07) & 0xff,
		(base + 0x08) & 0xff,
		(base + 0x09) & 0xff
	];
	const echoes = await collectEchoes(device, want, 150);

	let freq = 1000;
	let gain = 0;
	let q = 1.0;
	let disabled = false;

	for (const [cmd, val] of echoes.entries()) {
		const partial = decodeFilterResponse(cmd, val);
		if (partial.freq != null) freq = partial.freq;
		if (partial.gain != null) gain = partial.gain;
		if (partial.q != null) q = partial.q;
		if (partial.disabled != null) disabled = partial.disabled;
	}

	return { type: 'PK', freq, q, gain, disabled };
}

// ── Pregain (16.16 fixed-point) ─────────────────────────────────────────────

const PREG_SET_A = 0x01; // 0x9C01 & 0xFF
const PREG_TRIG_A = 0x02;
const PREG_SET_B = 0x03;
const PREG_TRIG_B = 0x04;

function encPregainFixed(dB: number): number {
	const clamped = Math.max(-60, Math.min(20, dB));
	return Math.round(clamped * 65536) >>> 0;
}

function decPregainFixed(val: number): number {
	const signed = val & 0x80000000 ? val - 0x100000000 : val;
	return signed / 65536.0;
}

async function readPregain(device: HIDDevice): Promise<number> {
	await sendCmd(device, PREG_TRIG_A, 1);
	const want = [PREG_SET_A, PREG_SET_B];
	const echoes = await collectEchoes(device, want, 150);

	const vB = echoes.get(PREG_SET_B);
	const vA = echoes.get(PREG_SET_A);
	if (vB != null) return decPregainFixed(vB);
	if (vA != null) return decPregainFixed(vA);
	return 0;
}

async function writePregain(device: HIDDevice, dB: number): Promise<void> {
	const fixed = encPregainFixed(dB);
	await sendCmd(device, PREG_SET_A, fixed);
	await sendCmd(device, PREG_TRIG_A, 1);
	await sendCmd(device, PREG_SET_B, fixed);
	await sendCmd(device, PREG_TRIG_B, 1);
}

async function writeFilter(
	device: HIDDevice,
	filterIndex: number,
	filter: DeviceFilter
): Promise<void> {
	const base = bandBase(filterIndex);
	const enabled = filter.disabled ? 0 : 1;

	await sendCmd(device, (base + 0x06) & 0xff, enabled);

	if (Number.isFinite(filter.freq)) {
		await sendCmd(device, (base + 0x07) & 0xff, encFreq(filter.freq));
	}

	if (Number.isFinite(filter.gain)) {
		await sendCmd(device, (base + 0x08) & 0xff, encGainSteps(filter.gain));
	}

	if (Number.isFinite(filter.q)) {
		await sendCmd(device, (base + 0x09) & 0xff, encQ(filter.q));
	}

	// Apply/commit band
	await sendCmd(device, (base + 0x0a) & 0xff, 1);
}

// ── Exported handler ──────────────────────────────────────────────────────────

export const toppingUsbHidHandler: DeviceHandler = {
	async getCurrentSlot(_device: ConnectedDevice): Promise<number> {
		console.log('USB Device PEQ: Topping getCurrentSlot called - not implemented (default 0).');
		return 0;
	},

	async pullFromDevice(deviceDetails: ConnectedDevice): Promise<PullResult> {
		console.log('USB Device PEQ: Topping pullFromDevice.');
		const device = deviceDetails.rawDevice as HIDDevice;
		const filters: DeviceFilter[] = [];

		for (let i = 0; i < deviceDetails.modelConfig.maxFilters; i++) {
			filters.push(await readFullFilter(device, i));
		}

		const globalGain = await readPregain(device);
		return { filters, globalGain };
	},

	async pushToDevice(
		deviceDetails: ConnectedDevice,
		_slot: number,
		preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean> {
		console.log('USB Device PEQ: Topping pushToDevice.');
		const device = deviceDetails.rawDevice as HIDDevice;
		const max = Math.min(filters.length, deviceDetails.modelConfig.maxFilters || filters.length);

		for (let i = 0; i < max; i++) {
			await writeFilter(device, i, {
				type: filters[i].type ?? 'PK',
				freq: filters[i].freq,
				gain: filters[i].gain,
				q: filters[i].q,
				disabled: !!filters[i].disabled
			});
		}

		if (Number.isFinite(preamp)) {
			await writePregain(device, preamp);
		}

		return false;
	},

	async enablePEQ(): Promise<void> {
		console.log('USB Device PEQ: Topping enablePEQ - no separate global opcode observed.');
	}
};

// NOTE: This handler is intentionally not registered in registry.ts or any device config.
// The original devicePEQ project imports it but has no device entries referencing it.
// It is included for completeness and will be connected when Topping device support is finalized.
