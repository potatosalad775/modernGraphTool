import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { flushSync } from 'svelte';
import type { Control, Filter, Profile } from '@potatosalad775/eqcaps-core';
import { LinkPeqDevice, type LinkPort } from '#lib/device-peq/link.js';
import type { DeviceConnection, PeqCapabilities, PeqDevice } from '#lib/device-peq/types.js';
import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
import {
	DEVICE_CONSTRAINT_ID,
	eqConstraintsStore
} from '#lib/stores/eq-constraints-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { settingsStore } from '#lib/stores/settings-store.svelte.js';
import { toast } from '#lib/services/toast.js';
import type { EQFilter } from '#lib/utils/equalizer.js';
import { hardwareProfile } from '#lib/utils/__fixtures__/eq-profiles.js';
import { AUTO_WRITE_DELAY_MS, devicePeqService } from './device-peq-service.svelte.js';
import { volumeWarning } from './volume-warning.svelte.js';
import { eqCurve } from './eq-curve.svelte.js';

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

describe('devicePeqService on a device that drives its channels apart', () => {
	const APART_PROFILE: Profile = { ...PROFILE, channels: 'independent' };
	const f = (freq: number, gain = 1): Filter => ({ type: 'PK', freq, q: 1, gain });
	const perEar = (freq: number, gain: number, channel: 'L' | 'R'): EQFilter => ({
		...band(freq, gain),
		channel
	});
	/** The bands a written filter list actually sets: the rest are flat fillers. */
	const sounding = (filters: readonly Filter[] | undefined) =>
		(filters ?? []).filter((x) => x.gain !== 0).map((x) => x.freq);

	/** Connects through the service, as the connect button does. */
	async function connectVia(connection: DeviceConnection) {
		connectModule.connectHid.mockResolvedValue({ kind: 'connected', connection });
		await devicePeqService.connect('hid');
	}

	/** A device whose EQ has a set per channel and whose bridge can send the right one. */
	const apartConnection = (device: PeqDevice) => fakeConnection(device, { profile: APART_PROFILE });

	let warning: MockInstance<typeof toast.warning>;

	beforeEach(() => {
		warning = vi.spyOn(toast, 'warning').mockImplementation(() => '' as never);
		devicePeqStore.setDisconnected();
		eqStore.filters = FOUR;
		eqStore.preamp = -1;
		eqStore.channelScope = 'L';
		flushSync();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await devicePeqService.disconnect();
		devicePeqStore.setDisconnected();
		eqStore.channelScope = 'BOTH';
	});

	describe('connecting', () => {
		it('unlocks the channel scope', async () => {
			await connectVia(apartConnection(fakeDevice({ perChannel: true })));
			expect(devicePeqStore.perChannel).toBe(true);
			expect(eqConstraintsStore.activeId).toBe(DEVICE_CONSTRAINT_ID);
			expect(eqConstraintsStore.supportsPerChannel).toBe(true);
			expect(eqStore.channelScopeLocked).toBe(false);
			expect(eqStore.channelScope).toBe('L');
		});

		it('keeps it locked for an ordinary device', async () => {
			await connectVia(fakeConnection(fakeDevice()));
			expect(devicePeqStore.perChannel).toBe(false);
			expect(eqConstraintsStore.activeId).toBe(DEVICE_CONSTRAINT_ID);
			expect(eqConstraintsStore.supportsPerChannel).toBe(false);
			expect(eqStore.channelScopeLocked).toBe(true);
			expect(eqStore.channelScope).toBe('BOTH');
		});

		it('keeps it locked when the EQ has a set per channel but the bridge cannot send it', async () => {
			await connectVia(apartConnection(fakeDevice({ perChannel: false })));
			expect(devicePeqStore.perChannel).toBe(false);
			expect(eqConstraintsStore.supportsPerChannel).toBe(false);
			expect(eqStore.channelScopeLocked).toBe(true);
		});

		it('keeps it locked when the bridge could but the EQ is linked', async () => {
			await connectVia(fakeConnection(fakeDevice({ perChannel: true })));
			expect(devicePeqStore.perChannel).toBe(false);
			expect(eqConstraintsStore.supportsPerChannel).toBe(false);
			expect(eqStore.channelScopeLocked).toBe(true);
		});

		it('locks nothing once the device is gone', async () => {
			await connectVia(apartConnection(fakeDevice({ perChannel: true })));
			await devicePeqService.disconnect();
			expect(devicePeqStore.perChannel).toBe(false);
			expect(eqConstraintsStore.supportsPerChannel).toBe(true);
			expect(eqStore.channelScopeLocked).toBe(false);
		});
	});

	describe('reading', () => {
		const ears = (eq: EQFilter[]) => eq.map((b) => [b.freq, b.gain, b.channel]);

		it('makes the bands the two ears differ in per-ear bands, beside the shared ones', async () => {
			const device = fakeDevice({ perChannel: true });
			device.pull.mockResolvedValue({
				filters: [f(100), f(200, 2)],
				right: { filters: [f(100), f(250, -3)] }
			});
			await connectVia(apartConnection(device));

			await devicePeqService.read();

			expect(ears(eqStore.filters)).toEqual([
				[100, 1, undefined],
				[200, 2, 'L'],
				[250, -3, 'R']
			]);
			expect(devicePeqStore.synced?.filters).toBe(eqStore.filters);
			expect(devicePeqStore.statusMessage).toMatch(/^Read 3 bands/);
			expect(devicePeqStore.statusIsError).toBe(false);
		});

		it('makes every band shared when the right channel is the same as the left', async () => {
			const device = fakeDevice({ perChannel: true });
			device.pull.mockResolvedValue({
				filters: [f(100), f(200, 2)],
				right: { filters: [f(100), f(200, 2)] }
			});
			await connectVia(apartConnection(device));

			await devicePeqService.read();

			expect(ears(eqStore.filters)).toEqual([
				[100, 1, undefined],
				[200, 2, undefined]
			]);
		});

		it('warns of a band whose type the app has no row for, whichever ear holds it', async () => {
			const device = fakeDevice({ perChannel: true });
			device.pull.mockResolvedValue({
				filters: [f(100), { ...f(200), type: 'x-weird' as Filter['type'] }],
				right: { filters: [f(100), f(300)] }
			});
			await connectVia(apartConnection(device));

			await devicePeqService.read();

			expect(ears(eqStore.filters)).toEqual([
				[100, 1, undefined],
				[300, 1, 'R']
			]);
			expect(warning).toHaveBeenCalledOnce();
		});
	});

	describe('writing', () => {
		async function writeList(device: ReturnType<typeof fakeDevice>, filters: EQFilter[]) {
			await connectVia(apartConnection(device));
			eqStore.filters = filters;
			flushSync();
			const plan = await devicePeqService.prepare();
			expect(plan).not.toBeNull();
			expect(await devicePeqService.write(plan!)).toBe(true);
			expect(device.push).toHaveBeenCalledOnce();
			return { plan: plan!, request: device.push.mock.calls[0][0] };
		}

		it('sends the right channel with a band only the right ear has', async () => {
			const { plan, request } = await writeList(fakeDevice({ perChannel: true }), [
				band(100, 1),
				perEar(400, 2, 'R')
			]);

			expect(request.right).toBeDefined();
			expect(request.filters).toHaveLength(4);
			expect(request.right?.filters).toHaveLength(4);
			expect(sounding(request.filters)).toEqual([100]);
			expect(sounding(request.right?.filters)).toEqual([100, 400]);
			expect(request.preamp).toBe(-1);
			expect(request.slot).toBe(101);
			expect(plan.skippedChannel).toBe(0);
			expect(warning).not.toHaveBeenCalled();
			expect(devicePeqStore.inSync).toBe(true);
		});

		it('sends a band only the left ear has to the left alone', async () => {
			const { request } = await writeList(fakeDevice({ perChannel: true }), [
				band(100, 1),
				perEar(400, 2, 'L')
			]);
			expect(sounding(request.filters)).toEqual([100, 400]);
			expect(sounding(request.right?.filters)).toEqual([100]);
		});

		it('still sends the right channel, equal to the left, for a list of shared bands', async () => {
			const { request } = await writeList(fakeDevice({ perChannel: true }), FOUR);
			expect(request.right).toBeDefined();
			expect(request.right?.filters).toEqual(request.filters);
		});

		it('reads the preset once for both ears and keeps what it held in the right ear’s empty slots', async () => {
			const device = fakeDevice({ perChannel: true });
			device.pull.mockResolvedValue({
				filters: [f(31), f(62), f(125), f(250)],
				right: { filters: [f(41), f(82), f(164), f(328)] }
			});
			const { request } = await writeList(device, [band(1000, 3)]);

			expect(device.pull).toHaveBeenCalledOnce();
			expect(request.filters.map((x) => x.freq)).toEqual([1000, 62, 125, 250]);
			expect(request.right?.filters.map((x) => x.freq)).toEqual([1000, 82, 164, 328]);
			expect(devicePeqStore.layout?.hints?.right).toBeDefined();
		});

		it('sends no right channel to an ordinary device, and says its per-ear bands were left out', async () => {
			const device = fakeDevice();
			await connectVia(fakeConnection(device));
			eqStore.filters = [band(100, 1), perEar(400, 2, 'R'), perEar(800, 2, 'L')];
			flushSync();

			const plan = await devicePeqService.prepare();
			expect(plan?.skippedChannel).toBe(2);
			expect(plan?.right).toBeUndefined();
			expect(await devicePeqService.write(plan!)).toBe(true);

			expect(device.push.mock.calls[0][0]).not.toHaveProperty('right');
			expect(sounding(device.push.mock.calls[0][0].filters)).toEqual([100]);
			expect(warning).toHaveBeenCalledOnce();
		});

		it('sends no right channel when the EQ has a set per channel but the bridge cannot send it', async () => {
			const device = fakeDevice({ perChannel: false });
			await connectVia(apartConnection(device));
			eqStore.filters = [band(100, 1), perEar(400, 2, 'R')];
			flushSync();

			const plan = await devicePeqService.prepare();
			expect(plan?.skippedChannel).toBe(1);
			await devicePeqService.write(plan!);

			expect(device.push.mock.calls[0][0]).not.toHaveProperty('right');
			expect(warning).toHaveBeenCalledOnce();
		});
	});
});

describe('devicePeqService auto-write on a device that drives its channels apart', () => {
	const APART_PROFILE: Profile = { ...PROFILE, channels: 'independent' };
	const LEFT_ONE: EQFilter[] = [
		band(100, 1),
		band(400, 1),
		band(1600, 1),
		{ ...band(6400, 1), channel: 'L' }
	];

	/** Connects with auto-write on, and waits for the write that switching it on makes. */
	async function autoWriting(caps: Partial<PeqCapabilities>, profile: Profile) {
		const device = fakeDevice(caps);
		devicePeqStore.setConnected(fakeConnection(device, { profile }), 101);
		devicePeqService.install();
		flushSync();
		devicePeqService.setAutoWrite(true);
		await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));
		return device;
	}

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

	it('writes a left-only band instead of pausing for it', async () => {
		const device = await autoWriting({ perChannel: true }, APART_PROFILE);

		await edit(LEFT_ONE);
		await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(2));

		expect(devicePeqStore.autoPaused).toBe(false);
		const request = device.push.mock.calls[1][0];
		expect(request.filters.map((x) => x.freq)).toEqual([100, 400, 1600, 6400]);
		expect(request.right?.filters.some((x) => x.freq === 6400 && x.gain !== 0)).toBe(false);
		expect(request.right?.filters.filter((x) => x.gain !== 0)).toHaveLength(3);
	});

	it('still pauses for something the device cannot hold exactly', async () => {
		const device = await autoWriting({ perChannel: true }, APART_PROFILE);

		await edit([...FOUR.slice(1), { ...band(100, 15), channel: 'R' }]);
		await vi.waitFor(() => expect(devicePeqStore.autoPaused).toBe(true));
		expect(device.push).toHaveBeenCalledTimes(1);
	});

	it('pauses for the same list on an ordinary device, which cannot write the per-ear band', async () => {
		const device = await autoWriting({}, PROFILE);

		await edit(LEFT_ONE);
		await vi.waitFor(() => expect(devicePeqStore.autoPaused).toBe(true));
		expect(device.push).toHaveBeenCalledTimes(1);
	});

	it('pauses for it when the bridge cannot send a channel apart', async () => {
		const device = await autoWriting({ perChannel: false }, APART_PROFILE);

		await edit(LEFT_ONE);
		await vi.waitFor(() => expect(devicePeqStore.autoPaused).toBe(true));
		expect(device.push).toHaveBeenCalledTimes(1);
	});
});

describe('devicePeqService preamp on a device grid', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		eqCurve.installSync();
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

describe('devicePeqService device settings', () => {
	const GAIN: Control = {
		id: 'gain',
		name: 'Gain',
		kind: 'range',
		role: 'output-gain',
		unit: 'dB',
		range: { min: -12, max: 0, step: 6 }
	};
	const USB: Control = {
		id: 'usb',
		name: 'USB',
		kind: 'choice',
		role: 'usb-mode',
		reconnect: true,
		values: [
			{ value: 0, name: 'UAC 1.0' },
			{ value: 1, name: 'UAC 2.0' }
		]
	};
	const FEED: Control = { id: 'feed', name: 'Feed', kind: 'toggle', eq: true };
	const CONTROLS = [GAIN, USB, FEED];

	/** What a device holds for its settings, and the ids whose write reports a restart. */
	function settingsDevice(
		held: Record<string, number | null>,
		{ restarts = [], caps = {} }: { restarts?: string[]; caps?: Partial<PeqCapabilities> } = {}
	) {
		return {
			...fakeDevice({ controls: CONTROLS, ...caps }),
			readControls: vi.fn<NonNullable<PeqDevice['readControls']>>(async () => ({ ...held })),
			writeControl: vi.fn<NonNullable<PeqDevice['writeControl']>>(async (id, value) => {
				held[id] = value;
				return { reconnect: restarts.includes(id) };
			})
		};
	}

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
		vi.restoreAllMocks();
		await devicePeqService.disconnect();
		devicePeqStore.setDisconnected();
	});

	describe('reading', () => {
		it('reads them on connect, and offers the ones the device answered', async () => {
			const device = settingsDevice({ gain: -6, usb: null, feed: 1 });
			await connectVia(fakeConnection(device));

			expect(device.readControls).toHaveBeenCalledOnce();
			expect(devicePeqStore.controlValues).toEqual({ gain: -6, usb: null, feed: 1 });
			expect(devicePeqStore.controls.map((c) => c.id)).toEqual(['gain', 'feed']);
			expect(devicePeqStore.deviceControls.map((c) => c.id)).toEqual(['gain']);
			expect(devicePeqStore.eqControls.map((c) => c.id)).toEqual(['feed']);
		});

		it('doesn’t ask a device that has no way to read them', async () => {
			const device = fakeDevice({ controls: CONTROLS });
			await connectVia(fakeConnection(device));

			expect(devicePeqStore.connection?.device).toBe(device);
			expect(devicePeqStore.controlValues).toEqual({});
			expect(devicePeqStore.controls).toEqual([]);
		});

		it('doesn’t ask a device that has none, or an empty list', async () => {
			const none = settingsDevice({}, { caps: { controls: undefined } });
			await connectVia(fakeConnection(none));
			expect(none.readControls).not.toHaveBeenCalled();
			await devicePeqService.disconnect();

			const empty = settingsDevice({}, { caps: { controls: [] } });
			await connectVia(fakeConnection(empty));
			expect(empty.readControls).not.toHaveBeenCalled();
			expect(devicePeqStore.controlValues).toEqual({});
		});

		it('keeps the connection, with no values, when reading them fails', async () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const device = settingsDevice({ gain: 0 });
			device.readControls.mockRejectedValue(new Error('no answer'));
			await connectVia(fakeConnection(device));

			expect(devicePeqStore.connection?.device).toBe(device);
			expect(devicePeqStore.controlValues).toEqual({});
			expect(devicePeqStore.controls).toEqual([]);
			expect(devicePeqStore.statusIsError).toBe(false);
			expect(warn).toHaveBeenCalled();
		});
	});

	describe('setControl', () => {
		it('writes the value, reads them again and says what was set', async () => {
			const device = settingsDevice({ gain: 0, usb: 0, feed: 0 });
			await connectVia(fakeConnection(device));

			await devicePeqService.setControl('gain', -6);

			expect(device.writeControl).toHaveBeenCalledExactlyOnceWith('gain', -6);
			expect(device.readControls).toHaveBeenCalledTimes(2);
			expect(devicePeqStore.controlValues.gain).toBe(-6);
			expect(devicePeqStore.statusMessage).toBe('Set Output gain to -6 dB.');
			expect(devicePeqStore.statusIsError).toBe(false);
			expect(devicePeqStore.isSettingControl).toBe(false);
		});

		it('names a choice by the device’s own words', async () => {
			const device = settingsDevice({ gain: 0, usb: 0, feed: 0 });
			await connectVia(fakeConnection(device));

			await devicePeqService.setControl('feed', 1);
			expect(devicePeqStore.statusMessage).toBe('Set Feed to On.');
		});

		it('writes nothing for an id the device doesn’t list', async () => {
			const device = settingsDevice({ gain: 0 });
			await connectVia(fakeConnection(device));
			devicePeqStore.setStatus('before');

			await devicePeqService.setControl('nope', 1);

			expect(device.writeControl).not.toHaveBeenCalled();
			expect(device.readControls).toHaveBeenCalledOnce();
			expect(devicePeqStore.statusMessage).toBe('before');
		});

		it('writes nothing, not even the known ones, when any id in the run is unknown', async () => {
			const device = settingsDevice({ gain: 0 });
			await connectVia(fakeConnection(device));

			await devicePeqService.setControls([
				['gain', -6],
				['nope', 1]
			]);

			expect(device.writeControl).not.toHaveBeenCalled();
		});

		it('writes nothing for an empty run', async () => {
			const device = settingsDevice({ gain: 0 });
			await connectVia(fakeConnection(device));

			await devicePeqService.setControls([]);
			expect(device.writeControl).not.toHaveBeenCalled();
		});

		it('writes nothing to a device that can’t, or while another operation runs', async () => {
			const plain = fakeDevice({ controls: CONTROLS });
			await connectVia(fakeConnection(plain));
			await devicePeqService.setControl('gain', -6);
			await devicePeqService.disconnect();

			const device = settingsDevice({ gain: 0 });
			await connectVia(fakeConnection(device));
			devicePeqStore.isReading = true;
			await devicePeqService.setControl('gain', -6);
			expect(device.writeControl).not.toHaveBeenCalled();
		});

		it('writes nothing with no device connected', async () => {
			await expect(devicePeqService.setControl('gain', -6)).resolves.toBeUndefined();
			expect(devicePeqStore.statusMessage).toBeNull();
		});

		it('reports a refused write as a failure, and reads them again', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const device = settingsDevice({ gain: 0, usb: 0, feed: 0 });
			await connectVia(fakeConnection(device));
			device.writeControl.mockRejectedValue(new Error('refused'));

			await devicePeqService.setControl('gain', -6);

			expect(devicePeqStore.statusIsError).toBe(true);
			expect(devicePeqStore.statusMessage).toMatch(/Something went wrong/);
			expect(device.readControls).toHaveBeenCalledTimes(2);
			expect(devicePeqStore.controlValues.gain).toBe(0);
			expect(devicePeqStore.isSettingControl).toBe(false);
			expect(devicePeqStore.needsReconnect).toBe(false);
		});

		it('is busy while it writes', async () => {
			const device = settingsDevice({ gain: 0, usb: 0, feed: 0 });
			await connectVia(fakeConnection(device));
			let done = () => {};
			device.writeControl.mockImplementation(
				() => new Promise((resolve) => (done = () => resolve({ reconnect: false })))
			);

			const pending = devicePeqService.setControl('gain', -6);
			expect(devicePeqStore.isSettingControl).toBe(true);
			expect(devicePeqStore.isBusy).toBe(true);
			// A second change waits for the first to be over rather than interleaving with it.
			await devicePeqService.setControl('gain', -12);
			expect(device.writeControl).toHaveBeenCalledTimes(1);

			done();
			await pending;
			expect(devicePeqStore.isSettingControl).toBe(false);
		});

		it('holds the write behind the volume warning, and goes on once answered', async () => {
			const device = settingsDevice({ gain: 0, usb: 0, feed: 0 });
			await connectVia(fakeConnection(device));
			settingsStore.setVolumeWarning(true);

			await devicePeqService.setControl('gain', -6);
			expect(volumeWarning.open).toBe(true);
			expect(device.writeControl).not.toHaveBeenCalled();

			volumeWarning.answer(true);
			await vi.waitFor(() => expect(device.writeControl).toHaveBeenCalledWith('gain', -6));
		});
	});

	describe('a setting that restarts the device', () => {
		it('closes it and reopens it by itself, reading the settings again', async () => {
			const second = settingsDevice({ gain: 0, usb: 1, feed: 0 });
			const first = settingsDevice({ gain: 0, usb: 0, feed: 0 }, { restarts: ['usb'] });
			const reopen = vi.fn(async () => fakeConnection(second));
			await connectVia(fakeConnection(first, { reopen }));

			await devicePeqService.setControl('usb', 1);

			expect(first.close).toHaveBeenCalled();
			expect(first.readControls).toHaveBeenCalledOnce();
			expect(reopen).toHaveBeenCalledWith({ timeoutMs: 5000 });
			await vi.waitFor(() => expect(devicePeqStore.connection?.device).toBe(second));
			await vi.waitFor(() => expect(devicePeqStore.isConnecting).toBe(false));
			expect(devicePeqStore.needsReconnect).toBe(false);
			expect(second.readControls).toHaveBeenCalledOnce();
			expect(devicePeqStore.controlValues).toEqual({ gain: 0, usb: 1, feed: 0 });
			expect(devicePeqStore.statusMessage).toBe(
				'Changed USB mode. The device restarted and is connected again.'
			);
		});

		it('says it is waiting for the device while it restarts', async () => {
			let back = (_conn: DeviceConnection | null) => {};
			const first = settingsDevice({ gain: 0, usb: 0, feed: 0 }, { restarts: ['usb'] });
			const reopen = vi.fn(
				() => new Promise<DeviceConnection | null>((resolve) => (back = resolve))
			);
			await connectVia(fakeConnection(first, { reopen }));

			await devicePeqService.setControl('usb', 1);

			expect(devicePeqStore.needsReconnect).toBe(true);
			expect(devicePeqStore.isConnecting).toBe(true);
			expect(devicePeqStore.statusMessage).toBe(
				'Changed USB mode. The device restarts; reconnecting…'
			);
			back(null);
			await vi.waitFor(() => expect(devicePeqStore.isConnecting).toBe(false));
		});

		it('offers Reconnect when there is no way to find it by itself', async () => {
			const device = settingsDevice({ gain: 0, usb: 0, feed: 0 }, { restarts: ['usb'] });
			await connectVia(fakeConnection(device));

			await devicePeqService.setControl('usb', 1);

			expect(device.close).toHaveBeenCalled();
			expect(devicePeqStore.needsReconnect).toBe(true);
			expect(devicePeqStore.isConnecting).toBe(false);
			expect(devicePeqStore.connection?.device).toBe(device);
			expect(devicePeqStore.statusMessage).toBe(
				'Changed USB mode. The device restarted; reconnect to carry on.'
			);
			// Not read again: the device is gone until it is reconnected.
			expect(device.readControls).toHaveBeenCalledOnce();
		});

		it('offers Reconnect when it doesn’t come back in time', async () => {
			const device = settingsDevice({ gain: 0, usb: 0, feed: 0 }, { restarts: ['usb'] });
			await connectVia(fakeConnection(device, { reopen: vi.fn(async () => null) }));

			await devicePeqService.setControl('usb', 1);

			await vi.waitFor(() => expect(devicePeqStore.isConnecting).toBe(false));
			expect(devicePeqStore.needsReconnect).toBe(true);
			expect(devicePeqStore.statusMessage).toMatch(/reconnect to carry on/);
		});

		it('stops at the first write that restarts it', async () => {
			const device = settingsDevice({ gain: 0, usb: 0, feed: 0 }, { restarts: ['usb'] });
			await connectVia(fakeConnection(device));

			await devicePeqService.setControls([
				['gain', -6],
				['usb', 1],
				['feed', 1]
			]);

			expect(device.writeControl.mock.calls).toEqual([
				['gain', -6],
				['usb', 1]
			]);
			expect(devicePeqStore.needsReconnect).toBe(true);
			expect(devicePeqStore.statusMessage).toMatch(/Changed USB mode/);
		});
	});

	describe('a run of settings', () => {
		it('writes them in order, reads them once afterwards, and says the last', async () => {
			const device = settingsDevice({ gain: 0, usb: 0, feed: 0 });
			await connectVia(fakeConnection(device));

			await devicePeqService.setControls([
				['gain', -12],
				['feed', 1]
			]);

			expect(device.writeControl.mock.calls).toEqual([
				['gain', -12],
				['feed', 1]
			]);
			expect(device.readControls).toHaveBeenCalledTimes(2);
			expect(devicePeqStore.statusMessage).toBe('Set Feed to On.');
		});

		it('stops at the first refused write, leaving the rest unwritten', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const device = settingsDevice({ gain: 0, usb: 0, feed: 0 });
			await connectVia(fakeConnection(device));
			device.writeControl.mockRejectedValueOnce(new Error('refused'));

			await devicePeqService.setControls([
				['gain', -12],
				['feed', 1]
			]);

			expect(device.writeControl).toHaveBeenCalledTimes(1);
			expect(devicePeqStore.statusIsError).toBe(true);
		});
	});

	describe('after the EQ moves', () => {
		const TWO_SLOTS = {
			slots: [
				{ id: 0, name: 'A' },
				{ id: 1, name: 'B' }
			]
		};

		it('reads them again after switching preset when one belongs to an EQ', async () => {
			const device = settingsDevice({ gain: 0, usb: 0, feed: 0 }, { caps: TWO_SLOTS });
			await connectVia(fakeConnection(device));
			expect(device.readControls).toHaveBeenCalledTimes(1);

			await devicePeqService.choose('p1');

			expect(device.setEnabled).toHaveBeenCalledWith(true, 1);
			expect(device.readControls).toHaveBeenCalledTimes(2);
		});

		it('leaves them as read after switching preset when none belongs to an EQ', async () => {
			const device = settingsDevice(
				{ gain: 0, usb: 0 },
				{ caps: { ...TWO_SLOTS, controls: [GAIN, USB] } }
			);
			await connectVia(fakeConnection(device));

			await devicePeqService.choose('p1');

			expect(device.setEnabled).toHaveBeenCalledWith(true, 1);
			expect(device.readControls).toHaveBeenCalledTimes(1);
		});

		it('reads them again after a Read when one belongs to an EQ, and not otherwise', async () => {
			const withEq = settingsDevice({ gain: 0, usb: 0, feed: 0 });
			await connectVia(fakeConnection(withEq));
			await devicePeqService.read();
			expect(withEq.pull).toHaveBeenCalledOnce();
			expect(withEq.readControls).toHaveBeenCalledTimes(2);
			await devicePeqService.disconnect();

			const without = settingsDevice({ gain: 0, usb: 0 }, { caps: { controls: [GAIN, USB] } });
			await connectVia(fakeConnection(without));
			await devicePeqService.read();
			expect(without.pull).toHaveBeenCalledOnce();
			expect(without.readControls).toHaveBeenCalledTimes(1);
		});
	});
});

describe('devicePeqService with more than one EQ', () => {
	const unsupported = () =>
		Object.assign(new Error('x'), { name: 'BridgeError', code: 'unsupported' });

	const GONE = "SPK EQ isn't available in the device's current mode, so this is USR EQ.";

	/** The headphone EQ a Qudelix lists next to its user EQ. */
	const SPK = {
		id: 'spk',
		name: 'SPK EQ',
		bandCount: 6,
		slots: [
			{ id: 201, name: 'Spk A' },
			{ id: 202, name: 'Spk B' }
		],
		perChannel: false
	};

	const TWO_PROFILE: Profile = {
		...hardwareProfile('qudelix', { bandCount: 4, band: PROFILE.band }),
		engine: 'USR EQ',
		device: { brand: 'Qudelix', model: '5K' },
		protocol: {
			handler: 'qudelix-5k',
			presets: [{ id: 101, name: 'Custom' }],
			eqs: [{ id: 'spk', name: 'SPK EQ', bandCount: 6, presets: [{ id: 201, name: 'Spk A' }] }]
		}
	};

	const SIX = [100, 300, 900, 2700, 5400, 10800].map((f) => band(f, 1));

	const FEED: Control = { id: 'feed', name: 'Feed', kind: 'toggle', eq: true };
	const SPK_FEED: Control = { id: 'spkfeed', name: 'Spk feed', kind: 'toggle', eq: 'spk' };
	const OUT: Control = {
		id: 'out',
		name: 'Out',
		kind: 'range',
		role: 'output-gain',
		unit: 'dB',
		range: { min: -12, max: 0, step: 6 }
	};

	interface TwoEqOptions {
		/** The band count the device reports for its own EQ, and for the headphone EQ. */
		reported?: number;
		spkReported?: number;
		controls?: Control[];
	}

	/** A device with two EQs: the base, and the view `eq('spk')` hands back, with its own slots. */
	function twoEqDevice({ reported, spkReported, controls }: TwoEqOptions = {}) {
		const readsBandCount = reported !== undefined || spkReported !== undefined;
		const held = { feed: 0, spkfeed: 0, out: 0 };
		const settings = controls
			? {
					readControls: vi.fn<NonNullable<PeqDevice['readControls']>>(async () => ({ ...held }))
				}
			: {};
		const base = {
			...fakeDevice({ eqs: [SPK], readsBandCount, controls }),
			...settings,
			bandCount: vi.fn<NonNullable<PeqDevice['bandCount']>>(async () => reported ?? null),
			eq: vi.fn<NonNullable<PeqDevice['eq']>>()
		};
		const spk = {
			...fakeDevice({ slots: SPK.slots, controls }),
			...settings,
			// The device is one connection: closing any view closes it.
			close: base.close,
			bandCount: vi.fn<NonNullable<PeqDevice['bandCount']>>(async () => spkReported ?? null)
		};
		spk.currentSlot.mockResolvedValue(201);
		base.eq.mockImplementation(() => spk);
		return { base, spk };
	}

	type TwoEq = ReturnType<typeof twoEqDevice>;

	function twoConnection(device: PeqDevice, extra: Partial<DeviceConnection> = {}) {
		return fakeConnection(device, { profile: TWO_PROFILE, name: 'Qudelix 5K · USR EQ', ...extra });
	}

	/** Connects through the service, as the connect button does. */
	async function connectTwo({ base }: TwoEq, extra: Partial<DeviceConnection> = {}) {
		const connection = twoConnection(base, extra);
		connectModule.connectHid.mockResolvedValue({ kind: 'connected', connection });
		await devicePeqService.connect('hid');
		return connection;
	}

	/** The EQ is being viewed: the store's connection is the device as that EQ. */
	async function viewSpk(two: TwoEq, extra: Partial<DeviceConnection> = {}) {
		const connection = await connectTwo(two, extra);
		await devicePeqService.selectEq('spk');
		expect(devicePeqStore.eq).toBe('spk');
		return connection;
	}

	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		devicePeqStore.setDisconnected();
		eqStore.filters = FOUR;
		eqStore.preamp = -1;
		flushSync();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await devicePeqService.disconnect();
		devicePeqStore.setDisconnected();
	});

	describe('on connect', () => {
		it('lists both EQs, the profile’s own first, and starts on the own one', async () => {
			const two = twoEqDevice();
			const conn = await connectTwo(two);

			expect(devicePeqStore.eqs).toEqual([
				{ id: undefined, name: 'USR EQ', present: true },
				{ id: 'spk', name: 'SPK EQ', present: true }
			]);
			expect(devicePeqStore.eq).toBeUndefined();
			expect(devicePeqStore.connection).toBe(conn);
			expect(devicePeqStore.opened).toBe(conn);
			expect(devicePeqStore.slots.map((s) => s.id)).toEqual([101]);
		});

		it('lists one EQ for a device with a single one', async () => {
			const device = fakeDevice();
			connectModule.connectHid.mockResolvedValue({
				kind: 'connected',
				connection: fakeConnection(device)
			});
			await devicePeqService.connect('hid');
			expect(devicePeqStore.eqs).toHaveLength(1);
		});

		it('lists an EQ the device’s mode lacks as not present, and keeps the others', async () => {
			const two = twoEqDevice();
			two.spk.currentSlot.mockRejectedValue(unsupported());
			await connectTwo(two);

			expect(devicePeqStore.eqs.map((e) => e.present)).toEqual([true, false]);
			expect(devicePeqStore.eq).toBeUndefined();
			expect(devicePeqStore.connection?.device).toBe(two.base);
		});

		it('keeps an EQ listed when it fails to answer for any other reason', async () => {
			const two = twoEqDevice();
			two.spk.currentSlot.mockRejectedValue(new Error('no answer'));
			await connectTwo(two);

			expect(devicePeqStore.eqs.map((e) => e.present)).toEqual([true, true]);
			expect(devicePeqStore.connection).not.toBeNull();
		});

		it('makes the band count the device reports the profile’s, and the active limit', async () => {
			const two = twoEqDevice({ reported: 20 });
			const conn = await connectTwo(two);

			expect(devicePeqStore.connection?.profile.bandCount).toBe(20);
			expect(eqConstraintsStore.activeId).toBe(DEVICE_CONSTRAINT_ID);
			expect(eqConstraintsStore.profile.bandCount).toBe(20);
			// The connection as it was opened is what reopening and losing the device are of.
			expect(devicePeqStore.opened).toBe(conn);
			expect(conn.profile.bandCount).toBe(4);
		});

		it('keeps the profile as it is when the device reports the same count, or none', async () => {
			const same = twoEqDevice({ reported: 4 });
			const conn = await connectTwo(same);
			expect(devicePeqStore.connection).toBe(conn);
			await devicePeqService.disconnect();

			const none = twoEqDevice();
			const next = await connectTwo(none);
			expect(none.base.bandCount).not.toHaveBeenCalled();
			expect(devicePeqStore.connection).toBe(next);
			expect(eqConstraintsStore.profile.bandCount).toBe(4);
		});
	});

	describe('picking another EQ', () => {
		it('reads nothing, leaves the bands, and starts that EQ over', async () => {
			const two = twoEqDevice();
			await connectTwo(two);
			devicePeqStore.synced = { filters: eqStore.filters, preamp: eqStore.preamp };
			const filters = eqStore.filters;

			await devicePeqService.selectEq('spk');

			expect(two.base.pull).not.toHaveBeenCalled();
			expect(two.spk.pull).not.toHaveBeenCalled();
			expect(eqStore.filters).toBe(filters);
			expect(devicePeqStore.synced).toBeNull();
			expect(devicePeqStore.eq).toBe('spk');
			expect(devicePeqStore.connection?.device).toBe(two.spk);
			expect(devicePeqStore.opened?.device).toBe(two.base);
			expect(devicePeqStore.statusMessage).toBe('Read and Write now use SPK EQ.');
			expect(devicePeqStore.statusIsError).toBe(false);
			expect(devicePeqStore.isSwitching).toBe(false);
		});

		it('makes that EQ’s profile the active limit, and its presets the ones offered', async () => {
			const two = twoEqDevice();
			await connectTwo(two);
			expect(eqConstraintsStore.profile.bandCount).toBe(4);

			await devicePeqService.selectEq('spk');

			expect(eqConstraintsStore.activeId).toBe(DEVICE_CONSTRAINT_ID);
			expect(eqConstraintsStore.active.label).toBe('Qudelix 5K · SPK EQ');
			expect(eqConstraintsStore.profile.bandCount).toBe(6);
			expect(eqConstraintsStore.profile.engine).toBe('SPK EQ');
			expect(devicePeqStore.slots.map((s) => s.id)).toEqual([201, 202]);
			expect(devicePeqStore.activeSlot).toBe(201);
			expect(devicePeqStore.deviceSlot).toBe(201);
		});

		it('takes the band count the device reports for that EQ', async () => {
			const two = twoEqDevice({ reported: 20, spkReported: 12 });
			await connectTwo(two);
			expect(eqConstraintsStore.profile.bandCount).toBe(20);

			await devicePeqService.selectEq('spk');
			expect(eqConstraintsStore.profile.bandCount).toBe(12);

			await devicePeqService.selectEq(undefined);
			expect(eqConstraintsStore.profile.bandCount).toBe(20);
		});

		it('goes back to the profile’s own EQ with its presets and limits', async () => {
			const two = twoEqDevice();
			await viewSpk(two);

			await devicePeqService.selectEq(undefined);

			expect(devicePeqStore.eq).toBeUndefined();
			expect(devicePeqStore.connection?.device).toBe(two.base);
			expect(devicePeqStore.slots.map((s) => s.id)).toEqual([101]);
			expect(eqConstraintsStore.profile.bandCount).toBe(4);
			expect(devicePeqStore.statusMessage).toBe('Read and Write now use USR EQ.');
		});

		it('sends Read to that EQ, not the device’s own', async () => {
			const two = twoEqDevice();
			await viewSpk(two);

			await devicePeqService.read();

			expect(two.spk.pull).toHaveBeenCalledOnce();
			expect(two.base.pull).not.toHaveBeenCalled();
			expect(devicePeqStore.synced).not.toBeNull();
		});

		it('sends Write to that EQ, fitted to its limits', async () => {
			const two = twoEqDevice();
			await viewSpk(two);
			eqStore.filters = SIX;
			flushSync();

			const plan = await devicePeqService.prepare();
			expect(plan).not.toBeNull();
			expect(await devicePeqService.write(plan!)).toBe(true);

			expect(two.spk.push).toHaveBeenCalledOnce();
			expect(two.spk.push.mock.calls[0][0]).toMatchObject({ slot: 201 });
			expect(two.spk.push.mock.calls[0][0].filters).toHaveLength(6);
			expect(two.base.push).not.toHaveBeenCalled();
		});

		it('sends Device EQ to that EQ’s own switch', async () => {
			const two = twoEqDevice();
			await viewSpk(two);

			await devicePeqService.choose('p202');
			expect(two.spk.setEnabled).toHaveBeenCalledExactlyOnceWith(true, 202);
			expect(devicePeqStore.activeSlot).toBe(202);

			await devicePeqService.choose('off');
			expect(two.spk.setEnabled).toHaveBeenLastCalledWith(false);
			expect(devicePeqStore.eqEnabled).toBe(false);
			expect(two.base.setEnabled).not.toHaveBeenCalled();
		});

		it('shows the settings of the EQ viewed, and the device’s own throughout', async () => {
			const two = twoEqDevice({ controls: [OUT, FEED, SPK_FEED] });
			await connectTwo(two);
			expect(devicePeqStore.eqControls.map((c) => c.id)).toEqual(['feed']);
			expect(devicePeqStore.deviceControls.map((c) => c.id)).toEqual(['out']);

			await devicePeqService.selectEq('spk');
			expect(devicePeqStore.eqControls.map((c) => c.id)).toEqual(['spkfeed']);
			expect(devicePeqStore.deviceControls.map((c) => c.id)).toEqual(['out']);

			await devicePeqService.selectEq(undefined);
			expect(devicePeqStore.eqControls.map((c) => c.id)).toEqual(['feed']);
		});

		it('says the EQ is gone, and opens the own one, when the mode changed since the list', async () => {
			const two = twoEqDevice();
			await connectTwo(two);
			two.spk.currentSlot.mockRejectedValue(unsupported());

			await devicePeqService.selectEq('spk');

			expect(devicePeqStore.eq).toBeUndefined();
			expect(devicePeqStore.connection?.device).toBe(two.base);
			expect(devicePeqStore.eqs.map((e) => e.present)).toEqual([true, false]);
			expect(devicePeqStore.statusMessage).toBe(GONE);
			expect(eqConstraintsStore.profile.bandCount).toBe(4);
		});

		describe('is refused', () => {
			async function expectRefused(two: TwoEq, id: string | undefined) {
				const asked = two.spk.currentSlot.mock.calls.length;
				const own = two.base.currentSlot.mock.calls.length;
				const status = devicePeqStore.statusMessage;
				await devicePeqService.selectEq(id);
				expect(devicePeqStore.eq).toBeUndefined();
				expect(devicePeqStore.connection?.device).toBe(two.base);
				expect(two.spk.currentSlot.mock.calls).toHaveLength(asked);
				expect(two.base.currentSlot.mock.calls).toHaveLength(own);
				expect(devicePeqStore.statusMessage).toBe(status);
			}

			it('while the device is busy', async () => {
				const two = twoEqDevice();
				await connectTwo(two);
				devicePeqStore.isReading = true;
				await expectRefused(two, 'spk');
			});

			it('while it has to be reconnected', async () => {
				const two = twoEqDevice();
				await connectTwo(two);
				devicePeqStore.needsReconnect = true;
				await expectRefused(two, 'spk');
			});

			it('for a device uniPEQ holds', async () => {
				const link = new LinkPeqDevice(
					{ status: null, command: vi.fn(), unlink: vi.fn() } as unknown as LinkPort,
					{ ...CAPS, eqs: [SPK] }
				);
				connectModule.connectHid.mockResolvedValue({
					kind: 'connected',
					connection: fakeConnection(link, {
						profile: TWO_PROFILE,
						connectionType: 'link',
						name: 'Qudelix 5K · USR EQ'
					})
				});
				await devicePeqService.connect('hid');
				expect(devicePeqStore.eqs.map((e) => e.present)).toEqual([true, true]);

				await devicePeqService.selectEq('spk');
				expect(devicePeqStore.eq).toBeUndefined();
				expect(devicePeqStore.connection?.device).toBe(link);
			});

			it('for the EQ already viewed', async () => {
				const two = twoEqDevice();
				await connectTwo(two);
				await expectRefused(two, undefined);

				await devicePeqService.selectEq('spk');
				two.spk.currentSlot.mockClear();
				two.base.currentSlot.mockClear();
				const status = devicePeqStore.statusMessage;
				await devicePeqService.selectEq('spk');
				expect(devicePeqStore.eq).toBe('spk');
				expect(two.spk.currentSlot).not.toHaveBeenCalled();
				expect(devicePeqStore.statusMessage).toBe(status);
			});

			it('for an EQ the device’s mode lacks', async () => {
				const two = twoEqDevice();
				two.spk.currentSlot.mockRejectedValue(unsupported());
				await connectTwo(two);
				await expectRefused(two, 'spk');
			});

			it('for an EQ the device doesn’t list', async () => {
				const two = twoEqDevice();
				await connectTwo(two);
				await expectRefused(two, 'nope');
			});
		});
	});

	describe('an EQ that goes while it is viewed', () => {
		it('opens the own EQ when an operation is refused as unsupported and the EQ is gone', async () => {
			const two = twoEqDevice();
			await viewSpk(two);
			two.spk.pull.mockRejectedValue(unsupported());
			two.spk.currentSlot.mockRejectedValue(unsupported());

			await devicePeqService.read();

			await vi.waitFor(() => expect(devicePeqStore.eq).toBeUndefined());
			await vi.waitFor(() => expect(devicePeqStore.statusMessage).toBe(GONE));
			expect(devicePeqStore.connection?.device).toBe(two.base);
			expect(devicePeqStore.eqs.map((e) => e.present)).toEqual([true, false]);
			expect(devicePeqStore.statusIsError).toBe(false);
			expect(devicePeqStore.isSwitching).toBe(false);
			expect(eqConstraintsStore.profile.bandCount).toBe(4);
		});

		it('lets the failure stand when the EQ still answers', async () => {
			const two = twoEqDevice();
			await viewSpk(two);
			two.spk.pull.mockRejectedValue(unsupported());
			two.spk.currentSlot.mockClear();

			await devicePeqService.read();

			// It asked whether the EQ is still there, and it is.
			await vi.waitFor(() => expect(two.spk.currentSlot).toHaveBeenCalled());
			expect(devicePeqStore.eq).toBe('spk');
			expect(devicePeqStore.statusIsError).toBe(true);
			expect(devicePeqStore.statusMessage).toMatch(/doesn't support/);
		});

		it('does not look for another EQ when the own one fails', async () => {
			const two = twoEqDevice();
			await connectTwo(two);
			two.base.pull.mockRejectedValue(unsupported());
			two.spk.currentSlot.mockClear();

			await devicePeqService.read();

			expect(devicePeqStore.statusIsError).toBe(true);
			expect(two.spk.currentSlot).not.toHaveBeenCalled();
		});
	});

	describe('a device reopened after a restart', () => {
		it('comes back viewing the EQ that was viewed, still in sync', async () => {
			const second = twoEqDevice();
			const first = twoEqDevice();
			const reopened = twoConnection(second.base);
			await viewSpk(first, { reopen: vi.fn(async () => reopened) });
			const synced = { filters: eqStore.filters, preamp: eqStore.preamp };
			devicePeqStore.synced = synced;

			await devicePeqService.reconnect();

			expect(devicePeqStore.eq).toBe('spk');
			expect(devicePeqStore.connection?.device).toBe(second.spk);
			expect(devicePeqStore.opened).toBe(reopened);
			expect(devicePeqStore.synced).toBe(synced);
			expect(devicePeqStore.inSync).toBe(true);
			expect(eqConstraintsStore.profile.bandCount).toBe(6);
		});

		it('comes back on the own EQ when the EQ is no longer there', async () => {
			const second = twoEqDevice();
			second.spk.currentSlot.mockRejectedValue(unsupported());
			const first = twoEqDevice();
			await viewSpk(first, { reopen: vi.fn(async () => twoConnection(second.base)) });
			devicePeqStore.synced = { filters: eqStore.filters, preamp: eqStore.preamp };

			await devicePeqService.reconnect();

			expect(devicePeqStore.eq).toBeUndefined();
			expect(devicePeqStore.connection?.device).toBe(second.base);
			expect(devicePeqStore.eqs.map((e) => e.present)).toEqual([true, false]);
			// The list is not claimed to be on an EQ it was never read from.
			expect(devicePeqStore.synced).toBeNull();
		});
	});

	describe('a device that goes while an EQ is viewed', () => {
		it('is disconnected, by the listener on the connection as it was opened', async () => {
			const two = twoEqDevice();
			let lost = () => {};
			const off = vi.fn();
			const onLost = vi.fn((listener: () => void) => {
				lost = listener;
				return off;
			});
			await viewSpk(two, { onLost });
			expect(onLost).toHaveBeenCalledOnce();

			lost();

			await vi.waitFor(() => expect(devicePeqStore.connection).toBeNull());
			expect(two.base.close).toHaveBeenCalled();
			expect(devicePeqStore.eqs).toEqual([]);
			expect(devicePeqStore.statusMessage).toBe('The device disconnected.');
		});

		it('is left alone while it waits to be reconnected', async () => {
			const two = twoEqDevice();
			let lost = () => {};
			const onLost = vi.fn((listener: () => void) => {
				lost = listener;
				return () => {};
			});
			await viewSpk(two, { onLost });
			devicePeqStore.needsReconnect = true;

			lost();
			await Promise.resolve();
			expect(devicePeqStore.connection).not.toBeNull();
		});
	});
});
