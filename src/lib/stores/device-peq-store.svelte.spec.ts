import { describe, it, expect, beforeEach, vi } from 'vitest';
import { devicePeqStore } from './device-peq-store.svelte.js';
import {
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID,
	DEVICE_CONSTRAINT_ID,
	eqConstraintsStore
} from './eq-constraints-store.svelte.js';
import type { DeviceConnection, PeqCapabilities } from '#lib/device-peq/types.js';
import { hardwareProfile } from '#lib/utils/__fixtures__/eq-profiles.js';

const CAPS: PeqCapabilities = {
	canRead: true,
	canWrite: true,
	readsPreamp: false,
	readsSlot: false,
	writesPreamp: true,
	writesSlot: false,
	readsCurrentSlot: true,
	readsEnabled: false,
	canEnable: true,
	slots: [
		{ id: 0, name: 'Jazz' },
		{ id: 160, name: 'USER1' },
		{ id: 240, name: 'BYPASS', bypass: true }
	],
	disconnectOnSave: false,
	experimental: false
};

function makeConnection(overrides: Partial<DeviceConnection> = {}): DeviceConnection {
	return {
		device: {
			capabilities: CAPS,
			pull: vi.fn(),
			push: vi.fn(),
			currentSlot: vi.fn(),
			eqEnabled: vi.fn(),
			setEnabled: vi.fn(),
			close: vi.fn()
		},
		connectionType: 'hid',
		name: 'FiiO KA17',
		profile: hardwareProfile('fiio-ka17', { bandCount: 10 }),
		profileSource: 'device',
		profileId: 'fiio-ka17',
		identity: {},
		...overrides
	};
}

describe('devicePeqStore', () => {
	beforeEach(() => {
		devicePeqStore.setDisconnected();
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
	});

	it('starts disconnected', () => {
		expect(devicePeqStore.isConnected).toBe(false);
		expect(devicePeqStore.deviceName).toBeNull();
		expect(devicePeqStore.slots).toEqual([]);
	});

	it('connecting makes the device’s profile the active constraint', () => {
		devicePeqStore.setConnected(makeConnection(), 160);
		expect(devicePeqStore.isConnected).toBe(true);
		expect(devicePeqStore.deviceName).toBe('FiiO KA17');
		expect(eqConstraintsStore.activeId).toBe(DEVICE_CONSTRAINT_ID);
		expect(eqConstraintsStore.active.label).toBe('FiiO KA17');
		expect(eqConstraintsStore.maxBands).toBe(10);
	});

	it('lists the EQ memories without the bypass preset', () => {
		devicePeqStore.setConnected(makeConnection(), 160);
		expect(devicePeqStore.slots.map((s) => s.name)).toEqual(['Jazz', 'USER1']);
		expect(devicePeqStore.activeSlot).toBe(160);
		expect(devicePeqStore.eqEnabled).toBe(true);
	});

	it('reads a device sitting on its bypass preset as EQ off, targeting the first memory', () => {
		devicePeqStore.setConnected(makeConnection(), 240);
		expect(devicePeqStore.eqEnabled).toBe(false);
		expect(devicePeqStore.activeSlot).toBe(0);
	});

	it('does not know whether EQ is on when the device can’t say', () => {
		devicePeqStore.setConnected(makeConnection(), null);
		expect(devicePeqStore.eqEnabled).toBeNull();
		expect(devicePeqStore.activeSlot).toBe(0);
	});

	it('shows a device on a preset it doesn’t list as on a built-in one, targeting the first memory', () => {
		devicePeqStore.setConnected(makeConnection(), 5);
		expect(devicePeqStore.selection).toBe('other');
		expect(devicePeqStore.deviceSlot).toBe(5);
		expect(devicePeqStore.activeSlot).toBe(0);
	});

	it('shows what the device plays: a memory, off, or unknown', () => {
		devicePeqStore.setConnected(makeConnection(), 160);
		expect(devicePeqStore.selection).toBe(160);
		devicePeqStore.setConnected(makeConnection(), 240);
		expect(devicePeqStore.selection).toBe('off');
		devicePeqStore.setConnected(makeConnection(), null);
		expect(devicePeqStore.selection).toBeNull();
	});

	describe('an EQ switch of its own', () => {
		it('shows Off on the preset the device stays on, and Read still reaches it', () => {
			devicePeqStore.setConnected(makeConnection(), 160, false);
			expect(devicePeqStore.selection).toBe('off');
			expect(devicePeqStore.eqEnabled).toBe(false);
			expect(devicePeqStore.deviceSlot).toBe(160);
			expect(devicePeqStore.activeSlot).toBe(160);
			expect(devicePeqStore.readTarget).toEqual({});
		});

		it('takes the switch over what the preset would say', () => {
			devicePeqStore.setConnected(makeConnection(), 240, true);
			expect(devicePeqStore.eqEnabled).toBe(true);
		});

		it('falls back on the preset when the switch is unknown', () => {
			devicePeqStore.setConnected(makeConnection(), 160, null);
			expect(devicePeqStore.eqEnabled).toBe(true);
			devicePeqStore.setConnected(makeConnection(), 240, null);
			expect(devicePeqStore.eqEnabled).toBe(false);
		});
	});

	describe('built-in presets', () => {
		const marked = (): DeviceConnection => {
			const connection = makeConnection();
			return {
				...connection,
				device: {
					...connection.device,
					capabilities: {
						...CAPS,
						writesSlot: true,
						slots: [
							{ id: 0, name: 'Jazz' },
							{ id: 160, name: 'USER1', writable: true },
							{ id: 161, name: 'USER2', writable: true },
							{ id: 240, name: 'BYPASS', bypass: true }
						]
					}
				}
			};
		};

		it('won’t write the built-in preset the device is on, but still reads it', () => {
			devicePeqStore.setConnected(marked(), 0);
			expect(devicePeqStore.activeSlot).toBe(0);
			expect(devicePeqStore.targetWritable).toBe(false);
			expect(devicePeqStore.writeTarget).toBeNull();
			expect(devicePeqStore.readTarget).toEqual({});
		});

		it('writes once the user picks one of their own', () => {
			devicePeqStore.setConnected(marked(), 0);
			devicePeqStore.target(161);
			expect(devicePeqStore.writeTarget).toEqual({ slot: 161 });
		});

		it('targets the first writable preset when the device is on none it lists', () => {
			devicePeqStore.setConnected(marked(), 240);
			expect(devicePeqStore.activeSlot).toBe(160);
			expect(devicePeqStore.writeTarget).toEqual({ slot: 160 });
		});

		it('treats every preset but the bypass as writable when the profile marks none', () => {
			devicePeqStore.setConnected(makeConnection(), 0);
			expect(devicePeqStore.writableSlots.map((s) => s.id)).toEqual([0, 160]);
			expect(devicePeqStore.targetWritable).toBe(true);
			expect(devicePeqStore.writeTarget).toEqual({});
		});
	});

	it('follows a switch, and forgets what it knew of the old preset', () => {
		devicePeqStore.setConnected(makeConnection(), 0);
		devicePeqStore.synced = { filters: [], preamp: 0 };
		devicePeqStore.played('off');
		expect(devicePeqStore.selection).toBe('off');
		expect(devicePeqStore.deviceSlot).toBe(240);
		expect(devicePeqStore.synced).not.toBeNull();
		devicePeqStore.played(160);
		expect(devicePeqStore.selection).toBe(160);
		expect(devicePeqStore.deviceSlot).toBe(160);
		expect(devicePeqStore.synced).toBeNull();
	});

	it('drops the last message when Read and Write move to another preset', () => {
		devicePeqStore.setConnected(makeConnection(), 0);
		devicePeqStore.setStatus('Wrote 6 band(s) to the device');
		devicePeqStore.target(0);
		expect(devicePeqStore.statusMessage).not.toBeNull();
		devicePeqStore.target(160);
		expect(devicePeqStore.statusMessage).toBeNull();
	});

	it('disconnecting clears everything and restores the user’s constraint', () => {
		eqConstraintsStore.activeId = 'generic-10-band';
		devicePeqStore.setConnected(makeConnection(), 0);
		devicePeqStore.isReading = true;
		devicePeqStore.needsReconnect = true;
		devicePeqStore.setStatus('busy');

		devicePeqStore.setDisconnected();
		expect(devicePeqStore.connection).toBeNull();
		expect(devicePeqStore.isReading).toBe(false);
		expect(devicePeqStore.needsReconnect).toBe(false);
		expect(devicePeqStore.statusMessage).toBeNull();
		expect(eqConstraintsStore.activeId).toBe('generic-10-band');
	});

	it('a fresh connection clears a pending reconnect', () => {
		devicePeqStore.setConnected(makeConnection(), 0);
		devicePeqStore.needsReconnect = true;
		devicePeqStore.setConnected(makeConnection(), 0);
		expect(devicePeqStore.needsReconnect).toBe(false);
	});

	it('is busy while connecting, reading or writing', () => {
		expect(devicePeqStore.isBusy).toBe(false);
		devicePeqStore.isWriting = true;
		expect(devicePeqStore.isBusy).toBe(true);
	});
});
