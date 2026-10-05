import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { DeviceConnection, PeqCapabilities, PeqDevice } from '$lib/device-peq/types.js';
import { devicePeqStore } from '$lib/stores/device-peq-store.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { settingsStore } from '$lib/stores/settings-store.svelte.js';
import type { EQFilter } from '$lib/utils/equalizer.js';
import { hardwareProfile } from '$lib/utils/__fixtures__/eq-profiles.js';
import { AUTO_WRITE_DELAY_MS, devicePeqService } from './device-peq-service.svelte.js';

const CAPS: PeqCapabilities = {
	canRead: true,
	canWrite: true,
	readsPreamp: false,
	readsSlot: false,
	writesPreamp: true,
	writesSlot: true,
	readsCurrentSlot: true,
	canEnable: true,
	slots: [{ id: 101, name: 'Custom' }],
	disconnectOnSave: false,
	experimental: false
};

const PROFILE = hardwareProfile('dongle', {
	bandCount: 4,
	band: {
		types: ['PK'],
		freq: { min: 20, max: 20000, step: 1 },
		q: { min: 0.1, max: 10, step: 0.01 },
		gain: { min: -12, max: 12, step: 0.5 }
	}
});

const band = (freq: number, gain: number): EQFilter => ({
	enabled: true,
	type: 'PK',
	freq,
	q: 1,
	gain
});
const FOUR = [100, 400, 1600, 6400].map((f) => band(f, 1));

function connect(caps: Partial<PeqCapabilities> = {}) {
	const device = {
		capabilities: { ...CAPS, ...caps },
		pull: vi.fn<PeqDevice['pull']>(async () => ({ filters: [] })),
		push: vi.fn<PeqDevice['push']>(async () => ({ reconnect: false })),
		currentSlot: vi.fn<PeqDevice['currentSlot']>(async () => 101),
		setEnabled: vi.fn<PeqDevice['setEnabled']>(async () => {}),
		close: vi.fn<PeqDevice['close']>(async () => {})
	};
	const connection: DeviceConnection = {
		device,
		connectionType: 'hid',
		name: 'Dongle',
		profile: PROFILE,
		profileSource: 'device',
		profileId: 'dongle',
		identity: {}
	};
	devicePeqStore.setConnected(connection, 101);
	devicePeqService.install();
	flushSync();
	return device;
}

/** An edit, then the debounce. */
async function edit(filters: EQFilter[]) {
	eqStore.filters = filters;
	flushSync();
	await vi.advanceTimersByTimeAsync(AUTO_WRITE_DELAY_MS);
}

describe('devicePeqService auto-write', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		devicePeqService.setAutoWrite(false);
		devicePeqStore.setDisconnected();
		eqStore.filters = FOUR;
		eqStore.preamp = -1;
		flushSync();
	});

	afterEach(() => {
		devicePeqService.setAutoWrite(false);
		devicePeqStore.setDisconnected();
		vi.useRealTimers();
	});

	it('writes the list once when switched on, then nothing until it changes', async () => {
		const device = connect();
		devicePeqService.setAutoWrite(true);
		await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));
		expect(devicePeqStore.inSync).toBe(true);
		await vi.advanceTimersByTimeAsync(AUTO_WRITE_DELAY_MS * 2);
		expect(device.push).toHaveBeenCalledTimes(1);
	});

	it('writes a burst of edits once, after the last one settles', async () => {
		const device = connect();
		devicePeqService.setAutoWrite(true);
		await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));

		for (const gain of [2, 3, 4]) {
			eqStore.filters = [band(100, gain), ...FOUR.slice(1)];
			flushSync();
			await vi.advanceTimersByTimeAsync(AUTO_WRITE_DELAY_MS / 2);
		}
		expect(device.push).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(AUTO_WRITE_DELAY_MS);
		expect(device.push).toHaveBeenCalledTimes(2);
		expect(device.push.mock.calls[1][0].filters[0].gain).toBe(4);
	});

	it('never writes because a device connected, only because the list changed', async () => {
		settingsStore.setDevicePeqAutoWrite(true);
		const device = connect();
		await vi.advanceTimersByTimeAsync(AUTO_WRITE_DELAY_MS * 2);
		expect(device.push).not.toHaveBeenCalled();

		await edit([band(100, 2), ...FOUR.slice(1)]);
		await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));
	});

	it('pauses rather than write something different from the list', async () => {
		const device = connect();
		devicePeqService.setAutoWrite(true);
		await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));

		await edit([band(100, 15), ...FOUR.slice(1)]);
		await vi.waitFor(() => expect(devicePeqStore.autoPaused).toBe(true));
		expect(device.push).toHaveBeenCalledTimes(1);

		// Back inside the device's range: auto-write carries on by itself.
		await edit([band(100, 5), ...FOUR.slice(1)]);
		await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(2));
		expect(devicePeqStore.autoPaused).toBe(false);
	});

	it('turns itself off when a write fails, but only on this connection', async () => {
		const device = connect();
		device.push.mockRejectedValue(new Error('gone'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		devicePeqService.setAutoWrite(true);
		await vi.waitFor(() => expect(devicePeqService.autoWriteOn).toBe(false));
		await edit([band(100, 2), ...FOUR.slice(1)]);
		expect(device.push).toHaveBeenCalledTimes(1);

		// The saved setting stays on: the next connection auto-writes again.
		expect(settingsStore.devicePeqAutoWrite).toBe(true);
		connect();
		expect(devicePeqService.autoWriteOn).toBe(true);
	});

	it('resumes when switched back on after a failed write', async () => {
		const device = connect();
		device.push.mockRejectedValueOnce(new Error('gone'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		devicePeqService.setAutoWrite(true);
		await vi.waitFor(() => expect(devicePeqService.autoWriteOn).toBe(false));

		devicePeqService.setAutoWrite(true);
		await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(2));
		expect(devicePeqStore.inSync).toBe(true);
	});

	it('drops an edit still waiting when the device switches preset', async () => {
		const device = connect({
			slots: [
				{ id: 0, name: 'A' },
				{ id: 1, name: 'B' }
			]
		});
		devicePeqService.setAutoWrite(true);
		await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));

		eqStore.filters = [band(100, 2), ...FOUR.slice(1)];
		flushSync();
		await devicePeqService.choose('p1');
		await vi.advanceTimersByTimeAsync(AUTO_WRITE_DELAY_MS * 2);
		expect(device.push).toHaveBeenCalledTimes(1);
	});

	it('is not offered to a device that restarts after every save', () => {
		connect({ disconnectOnSave: true });
		settingsStore.setDevicePeqAutoWrite(true);
		expect(devicePeqService.autoWriting).toBe(false);
	});
});
