import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { jdsLabsUsbSerialHandler } from './jds-labs-usb-serial.js';
import { FakeSerialPort, connectedDevice } from './__fixtures__/fake-device.js';
import type { ConnectedDevice, DeviceFilter } from '../types.js';

type Band = { Frequency: number; Gain: number; Q: number };

let port: FakeSerialPort;
let device: ConnectedDevice;

function describeResponse(overrides: Record<string, unknown> = {}) {
	return {
		Product: 'JDS Labs Element IV',
		General: { 'Input Mode': { Current: 'USB' } },
		DSP: {
			Headphone: {
				Preamp: { Current: -3 },
				'Lowshelf 1': { Frequency: 105, Gain: 4, Q: 0.7 },
				'Peaking 1': { Frequency: 1000, Gain: -2, Q: 1.4 },
				'Highshelf 2': { Frequency: 9000, Gain: 1.5, Q: 0.7 }
			}
		},
		...overrides
	};
}

function sentHeadphone(index = 0): Record<string, Band | number> {
	const payload = port.writtenJson(index) as {
		DSP: { Headphone: Record<string, Band | number> };
	};
	return payload.DSP.Headphone;
}

describe('jds-labs-usb-serial handler', () => {
	beforeEach(() => {
		port = new FakeSerialPort();
		device = connectedDevice(null, { disconnectOnSave: false }, {
			connectionType: 'serial',
			readable: port.readable,
			writable: port.writable
		} as Partial<ConnectedDevice>);
		// The handler narrates every exchange to the console.
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('transport', () => {
		it('null-terminates the JSON it writes', async () => {
			port.queueJson(describeResponse());
			await jdsLabsUsbSerialHandler.getCurrentSlot(device);

			const raw = new TextDecoder().decode(port.written[0]);
			expect(raw.endsWith('\0')).toBe(true);
			expect(JSON.parse(raw.slice(0, -1))).toEqual({
				Product: 'JDS Labs Element IV',
				Action: 'Describe'
			});
		});

		it('reassembles a response split across reads', async () => {
			const doc = JSON.stringify(describeResponse()) + '\0';
			const bytes = new TextEncoder().encode(doc);
			port.queue(bytes.slice(0, 20), bytes.slice(20, 60), bytes.slice(60));

			await expect(jdsLabsUsbSerialHandler.getCurrentSlot(device)).resolves.toBe(0);
		});

		it('throws when the stream ends before a terminator arrives', async () => {
			port.queue(new TextEncoder().encode('{"partial":'));
			await expect(jdsLabsUsbSerialHandler.getCurrentSlot(device)).rejects.toThrow(/Timeout/);
		});

		it('throws when the device exposes no writable stream', async () => {
			const noWrite = connectedDevice(null, {}, {
				readable: port.readable
			} as Partial<ConnectedDevice>);
			await expect(jdsLabsUsbSerialHandler.getCurrentSlot(noWrite)).rejects.toThrow(/writable/);
		});

		it('throws when the device exposes no readable stream', async () => {
			const noRead = connectedDevice(null, {}, {
				writable: port.writable
			} as Partial<ConnectedDevice>);
			await expect(jdsLabsUsbSerialHandler.getCurrentSlot(noRead)).rejects.toThrow(/readable/);
		});
	});

	describe('getCurrentSlot', () => {
		it('maps USB input mode to slot 0 and anything else to slot 1', async () => {
			port.queueJson(describeResponse());
			await expect(jdsLabsUsbSerialHandler.getCurrentSlot(device)).resolves.toBe(0);

			port.queueJson(describeResponse({ General: { 'Input Mode': { Current: 'SPDIF' } } }));
			await expect(jdsLabsUsbSerialHandler.getCurrentSlot(device)).resolves.toBe(0 + 1);
		});

		it('defaults to slot 0 when the response has no General section', async () => {
			port.queueJson(describeResponse({ General: undefined }));
			await expect(jdsLabsUsbSerialHandler.getCurrentSlot(device)).resolves.toBe(0);
		});
	});

	describe('pullFromDevice', () => {
		it('reads the preamp and every populated band', async () => {
			port.queueJson(describeResponse());
			const result = await jdsLabsUsbSerialHandler.pullFromDevice(device, 0);

			expect(result.globalGain).toBe(-3);
			expect(result.filters).toHaveLength(3);
		});

		it('derives the filter type from the band name', async () => {
			port.queueJson(describeResponse());
			const { filters } = await jdsLabsUsbSerialHandler.pullFromDevice(device, 0);

			// Bands come back in the handler's fixed 12-band order, not response order.
			expect(filters.map((f) => f.type)).toEqual(['LSQ', 'PK', 'HSQ']);
			expect(filters.map((f) => f.freq)).toEqual([105, 1000, 9000]);
			expect(filters.map((f) => f.q)).toEqual([0.7, 1.4, 0.7]);
			expect(filters.map((f) => f.gain)).toEqual([4, -2, 1.5]);
		});

		it('marks a zero-gain band as disabled', async () => {
			port.queueJson(
				describeResponse({
					DSP: { Headphone: { 'Peaking 1': { Frequency: 1000, Gain: 0, Q: 1 } } }
				})
			);
			const { filters } = await jdsLabsUsbSerialHandler.pullFromDevice(device, 0);
			expect(filters[0].disabled).toBe(true);
		});

		it('returns empty results when the response carries no DSP section', async () => {
			port.queueJson(describeResponse({ DSP: undefined }));
			const result = await jdsLabsUsbSerialHandler.pullFromDevice(device, 0);
			expect(result).toEqual({ filters: [], globalGain: 0 });
		});

		it('returns empty results when the DSP section has no Headphone config', async () => {
			port.queueJson(describeResponse({ DSP: {} }));
			const result = await jdsLabsUsbSerialHandler.pullFromDevice(device, 0);
			expect(result).toEqual({ filters: [], globalGain: 0 });
		});
	});

	describe('pushToDevice', () => {
		const filters: DeviceFilter[] = [
			{ type: 'LSQ', freq: 105, q: 0.7, gain: 4 },
			{ type: 'PK', freq: 1000, q: 1.4, gain: -2 },
			{ type: 'HSQ', freq: 9000, q: 0.7, gain: 1.5 }
		];

		beforeEach(() => {
			port.queueJson({ Status: true });
		});

		it('always sends all twelve bands plus the preamp', async () => {
			await jdsLabsUsbSerialHandler.pushToDevice(device, 0, -3, filters);

			const headphone = sentHeadphone();
			expect(headphone.Preamp).toBe(-3);
			expect(Object.keys(headphone)).toHaveLength(13);
			for (let i = 1; i <= 8; i++) expect(headphone[`Peaking ${i}`]).toBeDefined();
			for (let i = 1; i <= 2; i++) {
				expect(headphone[`Lowshelf ${i}`]).toBeDefined();
				expect(headphone[`Highshelf ${i}`]).toBeDefined();
			}
		});

		it('routes each filter into the band group matching its type', async () => {
			await jdsLabsUsbSerialHandler.pushToDevice(device, 0, 0, filters);

			const headphone = sentHeadphone();
			expect(headphone['Lowshelf 1']).toEqual({ Frequency: 105, Gain: 4, Q: 0.7 });
			expect(headphone['Peaking 1']).toEqual({ Frequency: 1000, Gain: -2, Q: 1.4 });
			expect(headphone['Highshelf 1']).toEqual({ Frequency: 9000, Gain: 1.5, Q: 0.7 });
		});

		it('fills unused bands with per-type neutral defaults', async () => {
			await jdsLabsUsbSerialHandler.pushToDevice(device, 0, 0, filters);

			const headphone = sentHeadphone();
			expect(headphone['Lowshelf 2']).toEqual({ Frequency: 100, Gain: 0, Q: 0.707 });
			expect(headphone['Peaking 8']).toEqual({ Frequency: 1000, Gain: 0, Q: 1.0 });
			expect(headphone['Highshelf 2']).toEqual({ Frequency: 10000, Gain: 0, Q: 0.707 });
		});

		it('neutralises a disabled filter rather than writing it', async () => {
			await jdsLabsUsbSerialHandler.pushToDevice(device, 0, 0, [
				{ type: 'PK', freq: 3000, q: 2, gain: 5, disabled: true }
			]);

			expect(sentHeadphone()['Peaking 1']).toEqual({ Frequency: 1000, Gain: 0, Q: 1.0 });
		});

		it('drops filters beyond each group capacity', async () => {
			const many: DeviceFilter[] = [
				...Array.from({ length: 10 }, (_, i) => ({
					type: 'PK' as const,
					freq: 100 * (i + 1),
					q: 1,
					gain: 1
				})),
				...Array.from({ length: 4 }, () => ({
					type: 'LSQ' as const,
					freq: 80,
					q: 0.7,
					gain: 2
				}))
			];
			await jdsLabsUsbSerialHandler.pushToDevice(device, 0, 0, many);

			const headphone = sentHeadphone();
			// 8 peaking slots take the first 8; the 9th and 10th are dropped, not
			// wrapped into another band.
			expect((headphone['Peaking 8'] as Band).Frequency).toBe(800);
			expect(Object.keys(headphone).filter((k) => k.startsWith('Peaking'))).toHaveLength(8);
			expect(Object.keys(headphone).filter((k) => k.startsWith('Lowshelf'))).toHaveLength(2);
		});

		it('round-trips through pullFromDevice', async () => {
			await jdsLabsUsbSerialHandler.pushToDevice(device, 0, -3, filters);

			// Feed the pushed configuration back as a Describe response.
			const headphone = sentHeadphone();
			port.queueJson({
				DSP: { Headphone: { ...headphone, Preamp: { Current: headphone.Preamp } } }
			});
			const result = await jdsLabsUsbSerialHandler.pullFromDevice(device, 0);

			expect(result.globalGain).toBe(-3);
			const active = result.filters.filter((f) => !f.disabled);
			expect(active).toEqual(
				expect.arrayContaining(filters.map((f) => expect.objectContaining({ ...f })))
			);
		});

		it('reports whether the device drops off the bus after a save', async () => {
			await expect(jdsLabsUsbSerialHandler.pushToDevice(device, 0, 0, filters)).resolves.toBe(
				false
			);

			const reconnecting = connectedDevice(null, { disconnectOnSave: true }, {
				readable: port.readable,
				writable: port.writable
			} as Partial<ConnectedDevice>);
			port.queueJson({ Status: true });
			await expect(jdsLabsUsbSerialHandler.pushToDevice(reconnecting, 0, 0, filters)).resolves.toBe(
				true
			);
		});
	});

	describe('enablePEQ', () => {
		it('is a no-op — the Element IV has no PEQ enable', async () => {
			await jdsLabsUsbSerialHandler.enablePEQ(device, true, 0);
			expect(port.written).toHaveLength(0);
		});
	});
});
