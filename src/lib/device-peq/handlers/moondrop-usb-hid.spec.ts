import { describe, it, expect, beforeEach } from 'vitest';
import { moondropUsbHidHandler } from './moondrop-usb-hid.js';
import { FakeHidDevice, connectedDevice, type SentReport } from './__fixtures__/fake-device.js';
import type { DeviceFilter } from '../types.js';

const REPORT_ID = 0x4b;
const WRITE = 1;
const READ = 128;
const CMD_UPDATE_EQ = 9;
const CMD_UPDATE_EQ_COEFF_TO_REG = 10;
const CMD_SAVE_EQ_TO_FLASH = 1;
const CMD_SET_DAC_OFFSET = 3;

const MAX_FILTERS = 4;

let hid: FakeHidDevice;
let device: ReturnType<typeof connectedDevice>;

function isFilterWrite(r: SentReport) {
	return r.data[0] === WRITE && r.data[1] === CMD_UPDATE_EQ;
}
function isEnable(r: SentReport) {
	return r.data[0] === WRITE && r.data[1] === CMD_UPDATE_EQ_COEFF_TO_REG;
}

/**
 * Answer reads out of whatever the handler last wrote, turning push→pull into a
 * genuine round-trip through the device's own byte layout: the read response
 * differs from the write packet only in its command byte.
 */
function respondFromWrites(written: Map<number, Uint8Array>, pregain = 0) {
	return (report: SentReport): Uint8Array | null => {
		const [cmd, sub] = report.data;

		if (cmd === WRITE && sub === CMD_UPDATE_EQ) {
			written.set(report.data[4], new Uint8Array(report.data));
			return null;
		}

		if (cmd === READ && sub === CMD_UPDATE_EQ) {
			const index = report.data[4];
			const stored = written.get(index);
			// Unwritten slots reply with an all-zero packet, which decodes as invalid.
			const packet = stored ? new Uint8Array(stored) : new Uint8Array(63);
			packet[0] = READ;
			packet[1] = CMD_UPDATE_EQ;
			return packet;
		}

		if (cmd === READ && sub === CMD_SET_DAC_OFFSET) {
			const packet = new Uint8Array(8);
			packet[0] = READ;
			packet[1] = CMD_SET_DAC_OFFSET;
			packet[4] = pregain;
			return packet;
		}

		return null;
	};
}

describe('moondrop-usb-hid handler', () => {
	beforeEach(() => {
		hid = new FakeHidDevice();
		device = connectedDevice(hid, { maxFilters: MAX_FILTERS });
	});

	describe('getCurrentSlot', () => {
		it('reads the slot out of byte 3 of the 0x80 0x0f response', () => {
			hid.respond = (r) =>
				r.data[0] === 0x80 && r.data[1] === 0x0f ? new Uint8Array([0x80, 0x0f, 0x00, 2]) : null;

			return expect(moondropUsbHidHandler.getCurrentSlot(device)).resolves.toBe(2);
		});

		it('ignores unrelated input reports', async () => {
			let seenUnrelated = false;
			hid.respond = (r) => {
				if (r.data[0] !== 0x80 || r.data[1] !== 0x0f) return null;
				seenUnrelated = true;
				// A report for a different command must not resolve the promise.
				return [new Uint8Array([0x80, 0x99, 0x00, 7]), new Uint8Array([0x80, 0x0f, 0x00, 1])];
			};

			await expect(moondropUsbHidHandler.getCurrentSlot(device)).resolves.toBe(1);
			expect(seenUnrelated).toBe(true);
		});

		it('detaches its listener once resolved', async () => {
			hid.respond = () => new Uint8Array([0x80, 0x0f, 0x00, 0]);
			await moondropUsbHidHandler.getCurrentSlot(device);
			expect(hid.listenerCount).toBe(0);
		});
	});

	describe('pushToDevice', () => {
		const filters: DeviceFilter[] = [
			{ type: 'PK', freq: 1000, q: 1.4, gain: 3.5 },
			{ type: 'LSQ', freq: 105, q: 0.7, gain: -4.5 }
		];

		it('writes one filter packet plus one enable packet per filter, then saves', async () => {
			await moondropUsbHidHandler.pushToDevice(device, 0, 0, filters);

			expect(hid.reportsMatching(isFilterWrite)).toHaveLength(2);
			expect(hid.reportsMatching(isEnable)).toHaveLength(2);

			const last = hid.sent[hid.sent.length - 1];
			expect([...last.data.slice(0, 2)]).toEqual([WRITE, CMD_SAVE_EQ_TO_FLASH]);
		});

		it('uses the documented report ID for every packet', async () => {
			await moondropUsbHidHandler.pushToDevice(device, 0, 0, filters);
			expect(hid.sent.every((r) => r.reportId === REPORT_ID)).toBe(true);
		});

		it('indexes the filter packets from zero', async () => {
			await moondropUsbHidHandler.pushToDevice(device, 0, 0, filters);
			expect(hid.reportsMatching(isFilterWrite).map((r) => r.data[4])).toEqual([0, 1]);
		});

		it('respects maxFilters', async () => {
			const many = Array.from({ length: MAX_FILTERS + 3 }, (_, i) => ({
				type: 'PK' as const,
				freq: 100 * (i + 1),
				q: 1,
				gain: 1
			}));
			await moondropUsbHidHandler.pushToDevice(device, 0, 0, many);

			expect(hid.reportsMatching(isFilterWrite)).toHaveLength(MAX_FILTERS);
		});

		it('writes the global gain before saving', async () => {
			await moondropUsbHidHandler.pushToDevice(device, 0, 7, filters);

			const pregain = hid.sent.find((r) => r.data[0] === WRITE && r.data[1] === CMD_SET_DAC_OFFSET);
			expect(pregain).toBeDefined();
			expect(pregain!.data[4]).toBe(7);
		});

		it('reports that the device stays connected after a save', () => {
			return expect(moondropUsbHidHandler.pushToDevice(device, 0, 0, filters)).resolves.toBe(false);
		});
	});

	describe('push → pull round-trip', () => {
		it('recovers the filters it wrote, within the device quantization', async () => {
			// freq is a 16-bit integer; q and gain are stored as whole + n/256, and
			// gain is floored to 0.1 dB on read.
			const filters: DeviceFilter[] = [
				{ type: 'PK', freq: 1000, q: 1.5, gain: 3.5 },
				{ type: 'LSQ', freq: 105, q: 0.7, gain: -4.5 },
				{ type: 'HSQ', freq: 8000, q: 1.0, gain: 6.0 }
			];
			const written = new Map<number, Uint8Array>();
			hid.respond = respondFromWrites(written, 4);

			await moondropUsbHidHandler.pushToDevice(device, 0, 4, filters);
			const result = await moondropUsbHidHandler.pullFromDevice(device, 0);

			expect(result.globalGain).toBe(4);
			expect(result.filters).toHaveLength(MAX_FILTERS);

			for (let i = 0; i < filters.length; i++) {
				expect(result.filters[i].type).toBe(filters[i].type);
				expect(result.filters[i].freq).toBe(filters[i].freq);
				expect(result.filters[i].q).toBeCloseTo(filters[i].q, 2);
				expect(result.filters[i].gain).toBeCloseTo(filters[i].gain, 1);
				expect(result.filters[i].disabled).toBe(false);
			}
		});

		it('marks slots that were never written as disabled', async () => {
			const written = new Map<number, Uint8Array>();
			hid.respond = respondFromWrites(written);

			await moondropUsbHidHandler.pushToDevice(device, 0, 0, [
				{ type: 'PK', freq: 1000, q: 1, gain: 2 }
			]);
			const result = await moondropUsbHidHandler.pullFromDevice(device, 0);

			expect(result.filters[0].disabled).toBe(false);
			for (let i = 1; i < MAX_FILTERS; i++) {
				expect(result.filters[i].disabled).toBe(true);
				expect(result.filters[i].freq).toBe(0);
				expect(result.filters[i].q).toBe(1.0);
				expect(result.filters[i].gain).toBe(0.0);
			}
		});

		it('rejects out-of-band frequencies as invalid', async () => {
			const written = new Map<number, Uint8Array>();
			hid.respond = respondFromWrites(written);

			// 5 Hz is below the handler's 10 Hz validity floor.
			await moondropUsbHidHandler.pushToDevice(device, 0, 0, [
				{ type: 'PK', freq: 5, q: 1, gain: 2 }
			]);
			const result = await moondropUsbHidHandler.pullFromDevice(device, 0);

			expect(result.filters[0].disabled).toBe(true);
		});

		it('reads exactly maxFilters slots', async () => {
			const written = new Map<number, Uint8Array>();
			hid.respond = respondFromWrites(written);

			await moondropUsbHidHandler.pullFromDevice(device, 0);
			const reads = hid.reportsMatching((r) => r.data[0] === READ && r.data[1] === CMD_UPDATE_EQ);
			expect(reads.map((r) => r.data[4])).toEqual([0, 1, 2, 3]);
		});

		it('leaves no listeners attached after a full pull', async () => {
			const written = new Map<number, Uint8Array>();
			hid.respond = respondFromWrites(written);

			await moondropUsbHidHandler.pullFromDevice(device, 0);
			expect(hid.listenerCount).toBe(0);
		});
	});

	describe('enablePEQ', () => {
		it('is a no-op that sends nothing', async () => {
			await moondropUsbHidHandler.enablePEQ(device, true, 0);
			expect(hid.sent).toHaveLength(0);
		});
	});
});
