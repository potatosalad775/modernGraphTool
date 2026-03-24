//
// Copyright 2024 : Pragmatic Audio
//
// Nothing USB Serial handler — TypeScript port of the legacy nothingUsbSerialHandler.js
// Custom binary protocol with CRC16 checksum.
//

import type {
	ConnectedDevice,
	DeviceHandler,
	DeviceFilter,
	DeviceFilterType,
	PullResult
} from '../types.js';

// ── Protocol constants ────────────────────────────────────────────────────────

const PROTOCOL_HEADER = [0x55, 0x60, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00];

const READ_COMMANDS = {
	READ_EQ_MODE: 49183,
	READ_EQ_VALUES: 49229,
	READ_FIRMWARE: 49218
} as const;

const WRITE_COMMANDS = {
	SET_ADVANCE_CUSTOM_EQ_VALUE: 61520
} as const;

const RESPONSE_COMMANDS = {
	EQ_MODE: 16415,
	FIRMWARE: 16450,
	EQ_VALUES: 16461
} as const;

// ── CRC-16/MODBUS ─────────────────────────────────────────────────────────────

function crc16(buffer: number[]): number {
	let crc = 0xffff;

	for (let i = 0; i < buffer.length; i++) {
		crc ^= buffer[i];
		for (let j = 0; j < 8; j++) {
			if (crc & 1) {
				crc = (crc >> 1) ^ 0xa001;
			} else {
				crc = crc >> 1;
			}
		}
	}

	return crc;
}

// ── Float conversion helpers ──────────────────────────────────────────────────

function bytesToFloat(bytes: Uint8Array, offset: number): number {
	const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
	return view.getFloat32(0, true); // little-endian
}

function floatToBytes(value: number): number[] {
	const buffer = new ArrayBuffer(4);
	const view = new DataView(buffer);
	view.setFloat32(0, value, true); // little-endian
	return [
		view.getUint8(0),
		view.getUint8(1),
		view.getUint8(2),
		view.getUint8(3)
	];
}

// ── Serial communication ──────────────────────────────────────────────────────

async function sendCommand(
	device: ConnectedDevice,
	command: number,
	payload: number[],
	_operation: string
): Promise<void> {
	if (!device.writable) {
		throw new Error('Nothing: Device writable stream not available');
	}

	const header = [...PROTOCOL_HEADER];
	// Set command bytes (little-endian 16-bit)
	header[2] = command & 0xff;
	header[3] = (command >> 8) & 0xff;

	// Set payload length
	const payloadLength = payload.length;
	header[6] = payloadLength & 0xff;
	header[7] = (payloadLength >> 8) & 0xff;

	const fullPacket = [...header, ...payload];
	const checksum = crc16(fullPacket);
	fullPacket.push(checksum & 0xff);
	fullPacket.push((checksum >> 8) & 0xff);

	const data = new Uint8Array(fullPacket);
	console.log(`Nothing: sendCommand ${_operation} (0x${command.toString(16)})`, data);
	await device.writable.write(data);
}

interface ParsedResponse {
	command: number;
	payload: Uint8Array;
}

async function readResponse(device: ConnectedDevice): Promise<ParsedResponse> {
	if (!device.readable) {
		throw new Error('Nothing: Device readable stream not available');
	}

	const startTime = Date.now();
	const timeout = 10000;
	let buffer = new Uint8Array(0);

	while (Date.now() - startTime < timeout) {
		const result = await device.readable.read();
		if (result.done) break;

		if (result.value) {
			// Concatenate buffers
			const newBuffer = new Uint8Array(buffer.length + result.value.length);
			newBuffer.set(buffer);
			newBuffer.set(result.value, buffer.length);
			buffer = newBuffer;
		}

		// Need at least the header (8 bytes) + CRC (2 bytes)
		if (buffer.length >= 10) {
			// Verify header marker
			if (buffer[0] !== 0x55 || buffer[1] !== 0x60) {
				throw new Error('Nothing: Invalid response header');
			}

			// Parse command from header
			const command = buffer[2] | (buffer[3] << 8);

			// Parse payload length
			const payloadLength = buffer[6] | (buffer[7] << 8);
			const totalLength = 8 + payloadLength + 2; // header + payload + CRC

			if (buffer.length >= totalLength) {
				const payload = buffer.slice(8, 8 + payloadLength);
				console.log(`Nothing: readResponse command=0x${command.toString(16)}`, payload);
				return { command, payload };
			}
		}
	}

	throw new Error('Nothing: Timeout waiting for response');
}

// ── EQ data packet builder ────────────────────────────────────────────────────

function createEQDataPacket(
	profileIndex: number,
	eqBands: DeviceFilter[],
	totalGain: number
): number[] {
	const data: number[] = [];

	// Profile index byte
	data.push(profileIndex);

	// Number of bands
	data.push(eqBands.length);

	// Total gain as float
	data.push(...floatToBytes(totalGain));

	// Each band: type (1 byte) + gain (4 bytes float) + freq (4 bytes float) + q (4 bytes float)
	for (const band of eqBands) {
		const typeCode = convertFromFilterType(band.type);
		data.push(typeCode);
		data.push(...floatToBytes(band.disabled ? 0 : band.gain));
		data.push(...floatToBytes(band.freq));
		data.push(...floatToBytes(band.q));
	}

	return data;
}

// ── Filter-type converters ────────────────────────────────────────────────────

function convertToFilterType(code: number): DeviceFilterType {
	switch (code) {
		case 1:
			return 'LSQ';
		case 3:
			return 'HSQ';
		case 2:
		default:
			return 'PK';
	}
}

function convertFromFilterType(filterType: DeviceFilterType): number {
	const mapping: Record<DeviceFilterType, number> = { PK: 2, LSQ: 1, HSQ: 3 };
	return mapping[filterType] ?? 2;
}

// ── Read helpers ──────────────────────────────────────────────────────────────

async function readEQMode(device: ConnectedDevice): Promise<number> {
	await sendCommand(device, READ_COMMANDS.READ_EQ_MODE, [], 'readEQMode');
	const response = await readResponse(device);

	if (response.command !== RESPONSE_COMMANDS.EQ_MODE) {
		throw new Error(
			`Nothing: Unexpected response command 0x${response.command.toString(16)} (expected EQ_MODE)`
		);
	}

	return response.payload[0];
}

async function readEQValues(device: ConnectedDevice): Promise<DeviceFilter[]> {
	await sendCommand(device, READ_COMMANDS.READ_EQ_VALUES, [], 'readEQValues');
	const response = await readResponse(device);

	if (response.command !== RESPONSE_COMMANDS.EQ_VALUES) {
		throw new Error(
			`Nothing: Unexpected response command 0x${response.command.toString(16)} (expected EQ_VALUES)`
		);
	}

	const filters: DeviceFilter[] = [];
	const payload = response.payload;

	// Each band is 13 bytes: type (1) + gain_float (4) + freq_float (4) + q_float (4)
	const bandSize = 13;
	const numBands = Math.floor(payload.length / bandSize);

	for (let i = 0; i < numBands; i++) {
		const offset = i * bandSize;
		const typeCode = payload[offset];
		const gain = bytesToFloat(payload, offset + 1);
		const freq = bytesToFloat(payload, offset + 5);
		const q = bytesToFloat(payload, offset + 9);
		const type = convertToFilterType(typeCode);

		filters.push({
			type,
			freq: Math.round(freq),
			q: Math.round(q * 100) / 100,
			gain: Math.round(gain * 10) / 10,
			disabled: gain === 0
		});
	}

	return filters;
}

// ── Exported handler ──────────────────────────────────────────────────────────

export const nothingUsbSerialHandler: DeviceHandler = {
	async getCurrentSlot(deviceDetails: ConnectedDevice): Promise<number> {
		return await readEQMode(deviceDetails);
	},

	async pullFromDevice(deviceDetails: ConnectedDevice, _slot: number): Promise<PullResult> {
		const currentSlot = await readEQMode(deviceDetails);
		const firstWritableSlot = deviceDetails.modelConfig.firstWritableEQSlot;

		// For non-writable slots, return empty filters
		if (currentSlot < firstWritableSlot) {
			console.log(
				`Nothing: Current slot ${currentSlot} is not writable (first writable: ${firstWritableSlot}), returning empty`
			);
			return { filters: [], globalGain: 0 };
		}

		// For custom/writable slots, read the EQ values
		const filters = await readEQValues(deviceDetails);
		return { filters, globalGain: 0 };
	},

	async pushToDevice(
		deviceDetails: ConnectedDevice,
		_slot: number,
		preamp: number,
		filters: DeviceFilter[]
	): Promise<boolean> {
		const firstWritableSlot = deviceDetails.modelConfig.firstWritableEQSlot;

		// Build the EQ data packet
		const eqData = createEQDataPacket(firstWritableSlot, filters, preamp);

		await sendCommand(
			deviceDetails,
			WRITE_COMMANDS.SET_ADVANCE_CUSTOM_EQ_VALUE,
			eqData,
			'pushToDevice'
		);

		// Wait for acknowledgment
		const response = await readResponse(deviceDetails);
		console.log('Nothing: Push response command:', response.command);

		return deviceDetails.modelConfig.disconnectOnSave;
	},

	async enablePEQ(
		_deviceDetails: ConnectedDevice,
		_enabled: boolean,
		_slotId: number
	): Promise<void> {
		// Nothing devices do not support enable/disable PEQ — no-op
	}
};
