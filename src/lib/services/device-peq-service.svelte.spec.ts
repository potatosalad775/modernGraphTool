import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { DeviceConnection, PeqCapabilities, PeqDevice } from '#lib/device-peq/types.js';
import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { settingsStore } from '#lib/stores/settings-store.svelte.js';
import type { EQFilter } from '#lib/utils/equalizer.js';
import { hardwareProfile } from '#lib/utils/__fixtures__/eq-profiles.js';
import { AUTO_WRITE_DELAY_MS, devicePeqService } from './device-peq-service.svelte.js';
import { volumeWarning } from './volume-warning.svelte.js';
import { dataProvider } from './data-provider.svelte.js';

const connectModule = vi.hoisted(() => ({
	connectHid: vi.fn(),
	connectSerial: vi.fn(),
	connectBle: vi.fn(),
	warmUp: vi.fn()
}));
vi.mock('#lib/device-peq/connect.js', () => connectModule);

const CAPS: PeqCapabilities = {
	canRead: true,
	canWrite: true,
	readsPreamp: false,
	readsSlot: false,
	writesPreamp: true,
	writesSlot: true,
	readsCurrentSlot: true,
	readsEnabled: false,
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

function fakeDevice(caps: Partial<PeqCapabilities> = {}) {
	return {
		capabilities: { ...CAPS, ...caps },
		pull: vi.fn<PeqDevice['pull']>(async () => ({ filters: [] })),
		push: vi.fn<PeqDevice['push']>(async () => ({ reconnect: false })),
		currentSlot: vi.fn<PeqDevice['currentSlot']>(async () => 101),
		eqEnabled: vi.fn<PeqDevice['eqEnabled']>(async () => null),
		setEnabled: vi.fn<PeqDevice['setEnabled']>(async () => {}),
		close: vi.fn<PeqDevice['close']>(async () => {})
	};
}

function fakeConnection(
	device: PeqDevice,
	extra: Partial<DeviceConnection> = {}
): DeviceConnection {
	return {
		device,
		connectionType: 'hid',
		name: 'Dongle',
		profile: PROFILE,
		profileSource: 'device',
		profileId: 'dongle',
		identity: {},
		...extra
	};
}

function connect(caps: Partial<PeqCapabilities> = {}) {
	const device = fakeDevice(caps);
	devicePeqStore.setConnected(fakeConnection(device), 101);
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

// The volume warning has its own specs (volume-warning.svelte.spec.ts); here nothing waits on it.
beforeEach(() => settingsStore.setVolumeWarning(false));
afterEach(() => {
	settingsStore.setVolumeWarning(true);
	volumeWarning.reset();
});

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

describe('devicePeqService connecting', () => {
	/** Connects through the service, as the connect button does. */
	async function connectVia(connection: DeviceConnection) {
		connectModule.connectHid.mockResolvedValue({ kind: 'connected', connection });
		await devicePeqService.connect('hid');
	}

	beforeEach(() => {
		devicePeqStore.setDisconnected();
		eqStore.filters = FOUR;
		eqStore.preamp = -1;
		flushSync();
	});

	afterEach(async () => {
		await devicePeqService.disconnect();
		devicePeqStore.setDisconnected();
	});

	it('asks a device with its own EQ switch whether it is on', async () => {
		const device = fakeDevice({ readsEnabled: true });
		device.eqEnabled.mockResolvedValue(false);
		await connectVia(fakeConnection(device));
		expect(devicePeqStore.selection).toBe('off');
		expect(devicePeqStore.deviceSlot).toBe(101);
	});

	it('doesn’t ask a device whose protocol has no switch to read', async () => {
		const device = fakeDevice();
		await connectVia(fakeConnection(device));
		expect(device.eqEnabled).not.toHaveBeenCalled();
		expect(devicePeqStore.eqEnabled).toBe(true);
	});

	it('leaves the switch to the preset when reading it fails', async () => {
		const device = fakeDevice({ readsEnabled: true });
		device.eqEnabled.mockRejectedValue(new Error('no answer'));
		await connectVia(fakeConnection(device));
		expect(devicePeqStore.connection).not.toBeNull();
		expect(devicePeqStore.eqEnabled).toBe(true);
	});

	describe('a device that restarts to save', () => {
		const RESTARTS = { disconnectOnSave: true };

		async function save(device: ReturnType<typeof fakeDevice>) {
			device.push.mockResolvedValue({ reconnect: true });
			const plan = await devicePeqService.prepare();
			expect(await devicePeqService.write(plan!)).toBe(true);
		}

		it('reopens it, stays in sync, and can do so after the next save too', async () => {
			const third = fakeDevice(RESTARTS);
			const secondReopen = vi.fn(async () => fakeConnection(third));
			const second = fakeDevice(RESTARTS);
			const firstReopen = vi.fn(async () => fakeConnection(second, { reopen: secondReopen }));
			const first = fakeDevice(RESTARTS);
			await connectVia(fakeConnection(first, { reopen: firstReopen }));

			await save(first);
			expect(first.close).toHaveBeenCalled();
			expect(firstReopen).toHaveBeenCalledWith({ timeoutMs: 5000 });
			await vi.waitFor(() => expect(devicePeqStore.connection?.device).toBe(second));
			await vi.waitFor(() => expect(devicePeqStore.isConnecting).toBe(false));
			expect(devicePeqStore.needsReconnect).toBe(false);
			expect(devicePeqStore.inSync).toBe(true);
			expect(devicePeqStore.statusMessage).toBe(
				'Wrote 4 bands. The device restarted to save and is connected again.'
			);

			await save(second);
			await vi.waitFor(() => expect(devicePeqStore.connection?.device).toBe(third));
			expect(secondReopen).toHaveBeenCalledOnce();
		});

		it('doesn’t claim to be in sync when it comes back on another preset', async () => {
			const slots = [
				{ id: 101, name: 'Custom' },
				{ id: 102, name: 'Other' }
			];
			const second = fakeDevice({ ...RESTARTS, slots });
			second.currentSlot.mockResolvedValue(102);
			const first = fakeDevice({ ...RESTARTS, slots });
			await connectVia(
				fakeConnection(first, { reopen: vi.fn(async () => fakeConnection(second)) })
			);

			await save(first);
			await vi.waitFor(() => expect(devicePeqStore.connection?.device).toBe(second));
			await vi.waitFor(() => expect(devicePeqStore.isConnecting).toBe(false));
			expect(devicePeqStore.activeSlot).toBe(102);
			expect(devicePeqStore.inSync).toBeNull();
		});

		it('offers Reconnect when it doesn’t come back in time', async () => {
			const device = fakeDevice(RESTARTS);
			await connectVia(fakeConnection(device, { reopen: vi.fn(async () => null) }));

			await save(device);
			await vi.waitFor(() => expect(devicePeqStore.isConnecting).toBe(false));
			expect(devicePeqStore.needsReconnect).toBe(true);
			expect(devicePeqStore.connection?.device).toBe(device);
			expect(devicePeqStore.statusMessage).toMatch(/reconnect to carry on/);
		});

		it('offers Reconnect when there is no way to find it by itself', async () => {
			const device = fakeDevice(RESTARTS);
			await connectVia(fakeConnection(device));
			await save(device);
			expect(devicePeqStore.needsReconnect).toBe(true);
			expect(devicePeqStore.isConnecting).toBe(false);
		});

		it('closes what comes back if the user disconnected meanwhile', async () => {
			const second = fakeDevice(RESTARTS);
			let back = (_conn: DeviceConnection) => {};
			const reopen = vi.fn(() => new Promise<DeviceConnection>((resolve) => (back = resolve)));
			const first = fakeDevice(RESTARTS);
			await connectVia(fakeConnection(first, { reopen }));

			await save(first);
			await devicePeqService.disconnect();
			expect(devicePeqStore.isConnecting).toBe(false);
			back(fakeConnection(second));
			await vi.waitFor(() => expect(second.close).toHaveBeenCalled());
			expect(devicePeqStore.connection).toBeNull();
		});

		it('takes the device going during the save as the restart, not an unplug', async () => {
			let lost = () => {};
			const onLost = (listener: () => void) => {
				lost = listener;
				return () => {};
			};
			const second = fakeDevice(RESTARTS);
			const first = fakeDevice(RESTARTS);
			await connectVia(
				fakeConnection(first, { onLost, reopen: vi.fn(async () => fakeConnection(second)) })
			);

			first.push.mockImplementation(async () => {
				lost();
				return { reconnect: true };
			});
			const plan = await devicePeqService.prepare();
			await devicePeqService.write(plan!);
			await vi.waitFor(() => expect(devicePeqStore.connection?.device).toBe(second));
		});
	});

	it('sees a device reconnected by hand as still in sync on the same preset', async () => {
		const second = fakeDevice();
		const first = fakeDevice();
		await connectVia(fakeConnection(first, { reopen: vi.fn(async () => fakeConnection(second)) }));
		devicePeqStore.synced = { filters: eqStore.filters, preamp: eqStore.preamp };

		await devicePeqService.reconnect();
		expect(devicePeqStore.connection?.device).toBe(second);
		expect(devicePeqStore.inSync).toBe(true);
	});

	describe('a device that goes', () => {
		function watched(device: PeqDevice) {
			const off = vi.fn();
			const state = { lost: () => {}, off };
			const conn = fakeConnection(device, {
				onLost: (listener) => {
					state.lost = listener;
					return off;
				}
			});
			return { conn, state };
		}

		it('disconnects at once, and says so', async () => {
			const device = fakeDevice();
			const { conn, state } = watched(device);
			await connectVia(conn);

			state.lost();
			await vi.waitFor(() => expect(devicePeqStore.connection).toBeNull());
			expect(device.close).toHaveBeenCalled();
			expect(devicePeqStore.statusMessage).toBe('The device disconnected.');
		});

		it('stops watching when the user disconnects', async () => {
			const { conn, state } = watched(fakeDevice());
			await connectVia(conn);
			await devicePeqService.disconnect();
			expect(state.off).toHaveBeenCalled();
		});

		it('leaves a device waiting to be reconnected as it is', async () => {
			const { conn, state } = watched(fakeDevice());
			await connectVia(conn);
			devicePeqStore.needsReconnect = true;

			state.lost();
			await Promise.resolve();
			expect(devicePeqStore.connection).toBe(conn);
		});

		it('ignores a connection that has already been replaced', async () => {
			const { conn, state } = watched(fakeDevice());
			await connectVia(conn);
			const next = fakeConnection(fakeDevice());
			devicePeqStore.setConnected(next, 101);

			state.lost();
			await Promise.resolve();
			expect(devicePeqStore.connection).toBe(next);
		});
	});
});

describe('devicePeqService volume warning', () => {
	beforeEach(() => {
		settingsStore.setVolumeWarning(true);
		devicePeqStore.setDisconnected();
		eqStore.filters = FOUR;
		flushSync();
	});

	afterEach(() => {
		devicePeqService.setAutoWrite(false);
		devicePeqStore.setDisconnected();
	});

	it('holds auto-write until the user goes on, then writes', async () => {
		const device = connect();
		devicePeqService.setAutoWrite(true);
		await vi.waitFor(() => expect(volumeWarning.open).toBe(true));
		expect(device.push).not.toHaveBeenCalled();

		volumeWarning.answer(true);
		await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));
	});

	it('stops auto-write on this connection on Not now', async () => {
		const device = connect();
		devicePeqService.setAutoWrite(true);
		await vi.waitFor(() => expect(volumeWarning.open).toBe(true));
		volumeWarning.answer(false);
		expect(devicePeqService.autoWriteOn).toBe(false);
		expect(device.push).not.toHaveBeenCalled();
	});

	it('asks before switching presets, and switches once the user goes on', async () => {
		const device = connect();
		await devicePeqService.choose('off');
		expect(device.setEnabled).not.toHaveBeenCalled();
		volumeWarning.answer(true);
		await vi.waitFor(() => expect(device.setEnabled).toHaveBeenCalledWith(false));
	});
});

describe('devicePeqService preamp on a device grid', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		dataProvider.installEqCurveSync();
		devicePeqStore.setDisconnected();
		// On the band's 0.5 dB grid, so only the preamp could need a review.
		eqStore.filters = [band(1000, 6.5)];
		flushSync();
	});

	afterEach(() => {
		devicePeqService.setAutoWrite(false);
		devicePeqStore.setDisconnected();
		vi.useRealTimers();
	});

	it("rounds Auto down onto the device's grid, so auto-write sends it without a review", async () => {
		expect(eqStore.preamp).toBe(-6.5);
		const device = connect();
		const profile = {
			...PROFILE,
			preamp: { mode: 'manual' as const, gain: { min: -12, max: 0, step: 1 } }
		};
		devicePeqStore.connection = { ...devicePeqStore.connection!, profile };
		flushSync();
		expect(eqStore.preamp).toBe(-7);

		devicePeqService.setAutoWrite(true);
		await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));
		expect(device.push.mock.calls[0][0]).toMatchObject({ preamp: -7 });
		expect(devicePeqStore.autoPaused).toBe(false);

		devicePeqStore.setDisconnected();
		flushSync();
		expect(eqStore.preamp).toBe(-6.5);
	});
});
