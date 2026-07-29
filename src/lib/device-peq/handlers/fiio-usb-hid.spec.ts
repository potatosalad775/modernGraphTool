import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fiioUsbHidHandler } from './fiio-usb-hid.js';
import { FakeHidDevice, connectedDevice, type SentReport } from './__fixtures__/fake-device.js';
import {
	PEQ_FILTER_PARAMS,
	PEQ_PRESET_SWITCH,
	PEQ_GLOBAL_GAIN,
	PEQ_FILTER_COUNT,
	PEQ_SAVE_TO_DEVICE,
	SET_HEADER1,
	SET_HEADER2,
	GET_HEADER1,
	GET_HEADER2,
	END_HEADERS,
	splitUnsignedValue,
	fiioGainBytesFromValue
} from '../utils/fiio-protocol.js';
import type { ConnectedDevice, DeviceFilter } from '../types.js';

const DEFAULT_REPORT_ID = 7;
const MAX_FILTERS = 5;
const MAX_GAIN = 12;

let hid: FakeHidDevice;
let device: ConnectedDevice;

function isSet(command: number) {
	return (r: SentReport) =>
		r.data[0] === SET_HEADER1 && r.data[1] === SET_HEADER2 && r.data[4] === command;
}
function isGet(command: number) {
	return (r: SentReport) =>
		r.data[0] === GET_HEADER1 && r.data[1] === GET_HEADER2 && r.data[4] === command;
}

/** A GET response frame the handler's oninputreport will accept. */
function response(command: number, payload: number[]): Uint8Array {
	return new Uint8Array([GET_HEADER1, GET_HEADER2, 0, 0, command, payload.length, ...payload]);
}

/** Encode a filter the way the device reports it back. */
function filterResponse(index: number, f: DeviceFilter, typeCode: number): Uint8Array {
	const [gainHi, gainLo] = fiioGainBytesFromValue(f.gain);
	const [freqHi, freqLo] = splitUnsignedValue(f.freq);
	const [qHi, qLo] = splitUnsignedValue(Math.round(f.q * 100));
	return response(PEQ_FILTER_PARAMS, [index, gainHi, gainLo, freqHi, freqLo, qHi, qLo, typeCode]);
}

/**
 * The handler resolves through a 100 ms poll interval, so every call is driven
 * with fake timers rather than waited on in real time.
 */
async function settleWith<T>(promise: Promise<T>): Promise<T> {
	await vi.advanceTimersByTimeAsync(300);
	return promise;
}

describe('fiio-usb-hid handler', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		hid = new FakeHidDevice();
		device = connectedDevice(hid, {
			maxFilters: MAX_FILTERS,
			maxGain: MAX_GAIN,
			disabledPresetId: 4
		});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe('report ID selection', () => {
		it('defaults to 7', async () => {
			hid.respond = () => response(PEQ_PRESET_SWITCH, [1]);
			await settleWith(fiioUsbHidHandler.getCurrentSlot(device));

			expect(hid.sent.every((r) => r.reportId === DEFAULT_REPORT_ID)).toBe(true);
		});

		it('honours a reportId from the model config', async () => {
			const custom = connectedDevice(hid, { maxFilters: MAX_FILTERS, reportId: 3 });
			hid.respond = () => response(PEQ_PRESET_SWITCH, [1]);
			await settleWith(fiioUsbHidHandler.getCurrentSlot(custom));

			expect(hid.sent.every((r) => r.reportId === 3)).toBe(true);
		});

		it('treats reportId 0 as a real value, not a missing one', async () => {
			const zero = connectedDevice(hid, { maxFilters: MAX_FILTERS, reportId: 0 });
			hid.respond = () => response(PEQ_PRESET_SWITCH, [1]);
			await settleWith(fiioUsbHidHandler.getCurrentSlot(zero));

			expect(hid.sent.every((r) => r.reportId === 0)).toBe(true);
		});
	});

	describe('getCurrentSlot', () => {
		it('asks for the preset and returns the slot it reports', async () => {
			hid.respond = (r) => (isGet(PEQ_PRESET_SWITCH)(r) ? response(PEQ_PRESET_SWITCH, [2]) : null);

			await expect(settleWith(fiioUsbHidHandler.getCurrentSlot(device))).resolves.toBe(2);
			expect(hid.reportsMatching(isGet(PEQ_PRESET_SWITCH))).toHaveLength(1);
		});

		it('maps the configured disabled preset to -1', async () => {
			// With JA11 the last slot means "EQ off", not "slot 4".
			hid.respond = () => response(PEQ_PRESET_SWITCH, [4]);
			await expect(settleWith(fiioUsbHidHandler.getCurrentSlot(device))).resolves.toBe(-1);
		});

		it('ignores frames that are not GET responses', async () => {
			hid.respond = () => [
				new Uint8Array([SET_HEADER1, SET_HEADER2, 0, 0, PEQ_PRESET_SWITCH, 1, 9]),
				response(PEQ_PRESET_SWITCH, [3])
			];
			await expect(settleWith(fiioUsbHidHandler.getCurrentSlot(device))).resolves.toBe(3);
		});
	});

	describe('pushToDevice', () => {
		const filters: DeviceFilter[] = [
			{ type: 'PK', freq: 1000, q: 1.4, gain: 3.5 },
			{ type: 'LSQ', freq: 105, q: 0.7, gain: -4.5 }
		];

		it('sends global gain, filter count, each filter, then a save', async () => {
			await settleWith(fiioUsbHidHandler.pushToDevice(device, 1, 0, filters));

			expect(hid.reportsMatching(isSet(PEQ_GLOBAL_GAIN))).toHaveLength(1);
			expect(hid.reportsMatching(isSet(PEQ_FILTER_COUNT))).toHaveLength(1);
			expect(hid.reportsMatching(isSet(PEQ_FILTER_PARAMS))).toHaveLength(2);
			expect(hid.reportsMatching(isSet(PEQ_SAVE_TO_DEVICE))).toHaveLength(1);
		});

		it('offsets the preamp by maxGain, because the device cuts SPL by that much', async () => {
			await settleWith(fiioUsbHidHandler.pushToDevice(device, 0, -5, filters));

			const packet = hid.reportsMatching(isSet(PEQ_GLOBAL_GAIN))[0].data;
			// (maxGain + preamp) * 10, sent high byte first.
			const encoded = (packet[6] << 8) | packet[7];
			expect(encoded).toBe((MAX_GAIN - 5) * 10);
		});

		it('caps the filter count at maxFilters', async () => {
			const many: DeviceFilter[] = Array.from({ length: MAX_FILTERS + 4 }, (_, i) => ({
				type: 'PK',
				freq: 100 * (i + 1),
				q: 1,
				gain: 1
			}));
			await settleWith(fiioUsbHidHandler.pushToDevice(device, 0, 0, many));

			expect(hid.reportsMatching(isSet(PEQ_FILTER_COUNT))[0].data[6]).toBe(MAX_FILTERS);
			expect(hid.reportsMatching(isSet(PEQ_FILTER_PARAMS))).toHaveLength(MAX_FILTERS);
		});

		it('writes a disabled filter with zero gain rather than skipping it', async () => {
			// Skipping would leave the previous gain live on the device.
			await settleWith(
				fiioUsbHidHandler.pushToDevice(device, 0, 0, [
					{ type: 'PK', freq: 2000, q: 1, gain: 6, disabled: true }
				])
			);

			const packet = hid.reportsMatching(isSet(PEQ_FILTER_PARAMS))[0].data;
			expect([packet[7], packet[8]]).toEqual([0, 0]);
			// The frequency is still written, so the band keeps its place.
			expect([packet[9], packet[10]]).toEqual([...splitUnsignedValue(2000)]);
		});

		it('encodes frequency, Q and filter index into the documented byte positions', async () => {
			await settleWith(fiioUsbHidHandler.pushToDevice(device, 0, 0, filters));

			const packet = hid.reportsMatching(isSet(PEQ_FILTER_PARAMS))[0].data;
			expect(packet[6]).toBe(0);
			expect([packet[9], packet[10]]).toEqual([...splitUnsignedValue(1000)]);
			expect([packet[11], packet[12]]).toEqual([...splitUnsignedValue(140)]);
			expect(packet[15]).toBe(END_HEADERS);
		});

		it('saves to the requested slot', async () => {
			await settleWith(fiioUsbHidHandler.pushToDevice(device, 3, 0, filters));
			expect(hid.reportsMatching(isSet(PEQ_SAVE_TO_DEVICE))[0].data[6]).toBe(3);
		});

		it('reports whether the device drops off the bus after saving', async () => {
			await expect(settleWith(fiioUsbHidHandler.pushToDevice(device, 0, 0, filters))).resolves.toBe(
				false
			);

			const reconnecting = connectedDevice(hid, {
				maxFilters: MAX_FILTERS,
				maxGain: MAX_GAIN,
				disconnectOnSave: true
			});
			await expect(
				settleWith(fiioUsbHidHandler.pushToDevice(reconnecting, 0, 0, filters))
			).resolves.toBe(true);
		});
	});

	describe('pullFromDevice', () => {
		const stored: Array<[DeviceFilter, number]> = [
			[{ type: 'PK', freq: 1000, q: 1.4, gain: 3.5 }, 0],
			[{ type: 'LSQ', freq: 105, q: 0.7, gain: -4.5 }, 1]
		];

		function respondFullDevice(count = stored.length, globalGainDb = 6) {
			hid.respond = (r): Uint8Array | Uint8Array[] | null => {
				if (isGet(PEQ_PRESET_SWITCH)(r)) return response(PEQ_PRESET_SWITCH, [1]);
				if (isGet(PEQ_FILTER_COUNT)(r)) return response(PEQ_FILTER_COUNT, [count]);
				if (isGet(PEQ_GLOBAL_GAIN)(r)) {
					const [hi, lo] = fiioGainBytesFromValue(globalGainDb);
					return response(PEQ_GLOBAL_GAIN, [hi, lo]);
				}
				if (isGet(PEQ_FILTER_PARAMS)(r)) {
					const index = r.data[6];
					const entry = stored[index];
					if (!entry) return null;
					const typeCode = entry[0].type === 'PK' ? 0 : entry[0].type === 'LSQ' ? 1 : 2;
					return filterResponse(index, entry[0], typeCode);
				}
				return null;
			};
		}

		it('recovers the stored filters and the global gain', async () => {
			respondFullDevice();
			const result = await settleWith(fiioUsbHidHandler.pullFromDevice(device, 0));

			expect(result.globalGain).toBeCloseTo(6, 1);
			expect(result.filters).toHaveLength(2);
			expect(result.filters[0].freq).toBe(1000);
			expect(result.filters[0].q).toBeCloseTo(1.4, 2);
			expect(result.filters[0].gain).toBeCloseTo(3.5, 1);
			expect(result.filters[1].gain).toBeCloseTo(-4.5, 1);
		});

		it('requests one filter per reported band', async () => {
			respondFullDevice();
			await settleWith(fiioUsbHidHandler.pullFromDevice(device, 0));

			expect(hid.reportsMatching(isGet(PEQ_FILTER_PARAMS)).map((r) => r.data[6])).toEqual([0, 1]);
		});

		it('requests no filters when the device reports a count of zero', async () => {
			hid.respond = (r) => (isGet(PEQ_FILTER_COUNT)(r) ? response(PEQ_FILTER_COUNT, [0]) : null);

			const result = await settleWith(fiioUsbHidHandler.pullFromDevice(device, 0));
			expect(result.filters).toEqual([]);
			expect(hid.reportsMatching(isGet(PEQ_FILTER_PARAMS))).toHaveLength(0);
		});

		it('never reports a pulled band as disabled', async () => {
			// The `disabled` flag is computed as `gain || freq || q ? false : true`,
			// but `q` is itself read as `combineBytes(...) / 100 || 1` — so it is
			// never falsy and the disabled branch is unreachable. Pinning the actual
			// behaviour here: an all-zero band still comes back enabled.
			hid.respond = (r): Uint8Array | null => {
				if (isGet(PEQ_FILTER_COUNT)(r)) return response(PEQ_FILTER_COUNT, [1]);
				if (isGet(PEQ_FILTER_PARAMS)(r))
					return response(PEQ_FILTER_PARAMS, [0, 0, 0, 0, 0, 0, 0, 0]);
				return null;
			};

			const result = await settleWith(fiioUsbHidHandler.pullFromDevice(device, 0));
			expect(result.filters[0].disabled).toBe(false);
			expect(result.filters[0].q).toBe(1);
		});

		it('defaults Q to 1 when the device reports zero', async () => {
			hid.respond = (r): Uint8Array | null => {
				if (isGet(PEQ_FILTER_COUNT)(r)) return response(PEQ_FILTER_COUNT, [1]);
				if (isGet(PEQ_FILTER_PARAMS)(r))
					return response(PEQ_FILTER_PARAMS, [0, 0, 10, ...splitUnsignedValue(500), 0, 0, 0]);
				return null;
			};

			const result = await settleWith(fiioUsbHidHandler.pullFromDevice(device, 0));
			expect(result.filters[0].q).toBe(1);
		});

		it('ignores an unknown command in the response stream', async () => {
			respondFullDevice();
			const base = hid.respond;
			hid.respond = (r) => {
				const reply = base(r);
				if (isGet(PEQ_PRESET_SWITCH)(r)) return [response(0x7f, [1, 2, 3]), reply as Uint8Array];
				return reply;
			};

			const result = await settleWith(fiioUsbHidHandler.pullFromDevice(device, 0));
			expect(result.filters).toHaveLength(2);
		});
	});

	describe('enablePEQ', () => {
		it('switches to the requested slot when enabling', async () => {
			await fiioUsbHidHandler.enablePEQ(device, true, 2);

			const packet = hid.reportsMatching(isSet(PEQ_PRESET_SWITCH))[0].data;
			expect(packet[6]).toBe(2);
		});

		it('switches to the off preset when disabling', async () => {
			await fiioUsbHidHandler.enablePEQ(device, false, 2);

			const packet = hid.reportsMatching(isSet(PEQ_PRESET_SWITCH))[0].data;
			expect(packet[6]).toBe(MAX_FILTERS);
		});
	});
});
