import { describe, it, expect, beforeEach } from 'vitest';
import { devicePeqStore } from './device-peq-store.svelte.js';
import type { ConnectedDevice, DeviceSlot } from '$lib/device-peq/types.js';

const SLOTS: DeviceSlot[] = [
	{ id: 0, name: 'Slot 1' },
	{ id: 1, name: 'Slot 2' }
];

function fakeDevice(overrides: Partial<ConnectedDevice> = {}): ConnectedDevice {
	return {
		rawDevice: null,
		manufacturer: 'FiiO',
		model: 'BTR7',
		connectionType: 'hid',
		handler: {} as ConnectedDevice['handler'],
		modelConfig: {} as ConnectedDevice['modelConfig'],
		...overrides
	} as ConnectedDevice;
}

describe('DevicePeqStore', () => {
	beforeEach(() => {
		devicePeqStore.setDisconnected();
	});

	it('starts disconnected with no device metadata', () => {
		expect(devicePeqStore.isConnected).toBe(false);
		expect(devicePeqStore.device).toBeNull();
		expect(devicePeqStore.deviceName).toBeNull();
		expect(devicePeqStore.slots).toEqual([]);
	});

	describe('setConnected', () => {
		it('mirrors the device metadata onto the store', () => {
			const device = fakeDevice();
			devicePeqStore.setConnected(device, SLOTS, 1);

			expect(devicePeqStore.isConnected).toBe(true);
			// `$state` deep-proxies what it stores, so compare by value, not identity.
			expect(devicePeqStore.device).toEqual(device);
			expect(devicePeqStore.deviceName).toBe('BTR7');
			expect(devicePeqStore.manufacturer).toBe('FiiO');
			expect(devicePeqStore.connectionType).toBe('hid');
			expect(devicePeqStore.slots).toEqual(SLOTS);
			expect(devicePeqStore.activeSlot).toBe(1);
		});

		it('clears the connecting flag and reports the model in the status line', () => {
			devicePeqStore.isConnecting = true;
			devicePeqStore.setConnected(fakeDevice({ model: 'Qudelix 5K' }), SLOTS, 0);

			expect(devicePeqStore.isConnecting).toBe(false);
			expect(devicePeqStore.statusMessage).toBe('Connected: Qudelix 5K');
		});

		it('accepts slot 0 as an active slot rather than treating it as unset', () => {
			devicePeqStore.setConnected(fakeDevice(), SLOTS, 0);
			expect(devicePeqStore.activeSlot).toBe(0);
		});
	});

	describe('setDisconnected', () => {
		it('clears every field, including in-flight read/write flags', () => {
			devicePeqStore.setConnected(fakeDevice(), SLOTS, 1);
			devicePeqStore.isReading = true;
			devicePeqStore.isWriting = true;

			devicePeqStore.setDisconnected();

			expect(devicePeqStore.isConnected).toBe(false);
			expect(devicePeqStore.isConnecting).toBe(false);
			expect(devicePeqStore.device).toBeNull();
			expect(devicePeqStore.deviceName).toBeNull();
			expect(devicePeqStore.manufacturer).toBeNull();
			expect(devicePeqStore.connectionType).toBeNull();
			expect(devicePeqStore.activeSlot).toBeNull();
			expect(devicePeqStore.slots).toEqual([]);
			expect(devicePeqStore.isReading).toBe(false);
			expect(devicePeqStore.isWriting).toBe(false);
			expect(devicePeqStore.statusMessage).toBeNull();
		});

		it('is safe to call when already disconnected', () => {
			devicePeqStore.setDisconnected();
			devicePeqStore.setDisconnected();
			expect(devicePeqStore.isConnected).toBe(false);
		});
	});

	describe('setStatus', () => {
		it('replaces the status message without touching connection state', () => {
			devicePeqStore.setConnected(fakeDevice(), SLOTS, 0);
			devicePeqStore.setStatus('Reading slot 1…');

			expect(devicePeqStore.statusMessage).toBe('Reading slot 1…');
			expect(devicePeqStore.isConnected).toBe(true);
		});
	});
});
