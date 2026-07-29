/**
 * `DevicePeq` is the hardware-EQ bridge panel: connect over HID/Serial/BLE/network,
 * pick a slot, pull the device's filters into `eqStore` or push the current stack
 * out to it.
 *
 * Every connector is loaded through a dynamic `import()`, so the spec mocks the
 * four connector modules and the registry rather than touching WebHID/WebSerial —
 * a permission prompt has no place in a test run. The `navigator.*` feature flags
 * the component branches on are stubbed per test so both the supported and the
 * unsupported-browser layouts are exercised on the same Chromium.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import DevicePeq from './DevicePeq.svelte';
import { devicePeqStore } from '$lib/stores/device-peq-store.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { eqCommands } from '$lib/services/eq-commands.js';
import { eqConstraintsStore } from '$lib/stores/eq-constraints-store.svelte.js';
import { DEVICE_PEQ_CONSTRAINT_ID } from '$lib/device-peq/derive-constraint.js';
import type { ConnectedDevice, DeviceSlot } from '$lib/device-peq/types.js';

/** Each connector module needs its own mock set — sharing them would make an
 *  assertion about "which transport was used" pass for the wrong one. */
function makeConnectorMocks() {
	return {
		getDeviceConnected: vi.fn(),
		getAvailableSlots: vi.fn(),
		getCurrentSlot: vi.fn(),
		pullFromDevice: vi.fn(),
		pushToDevice: vi.fn(),
		disconnectDevice: vi.fn(),
		enablePEQ: vi.fn()
	};
}
const hid = makeConnectorMocks();
const serial = makeConnectorMocks();
const ble = makeConnectorMocks();
const network = makeConnectorMocks();

vi.mock('$lib/device-peq/connectors/usb-hid-connector.js', () => hid);
vi.mock('$lib/device-peq/connectors/usb-serial-connector.js', () => serial);
vi.mock('$lib/device-peq/connectors/bluetooth-ble-connector.js', () => ble);
vi.mock('$lib/device-peq/connectors/network-connector.js', () => network);
vi.mock('$lib/device-peq/registry.js', () => ({
	getHidConfig: vi.fn(async () => ({})),
	getSerialConfig: vi.fn(async () => ({})),
	getBleConfig: vi.fn(async () => ({}))
}));

const SLOTS: DeviceSlot[] = [
	{ id: 0, name: 'Slot A' },
	{ id: 1, name: 'Slot B' }
];

function makeDevice(overrides: Partial<ConnectedDevice> = {}): ConnectedDevice {
	return {
		rawDevice: null,
		manufacturer: 'Moondrop',
		model: 'Dawn Pro',
		handler: {} as ConnectedDevice['handler'],
		connectionType: 'hid',
		modelConfig: {
			minGain: -12,
			maxGain: 12,
			maxFilters: 6,
			firstWritableEQSlot: 0,
			maxWritableEQSlots: 2,
			disconnectOnSave: false,
			disabledPresetId: -1,
			experimental: false,
			supportsLSHSFilters: true,
			availableSlots: SLOTS
		},
		...overrides
	} as ConnectedDevice;
}

/**
 * Toggle the `navigator` feature flags the component reads at setup time.
 *
 * The component tests with `'hid' in navigator`, and `in` walks the prototype
 * chain — so hiding a transport means removing the accessor from
 * `Navigator.prototype`, not shadowing it with `undefined` on the instance.
 * Whichever of the three this Chromium actually ships varies, so both
 * directions save the previous descriptor and restore it afterwards.
 */
type ApiName = 'hid' | 'serial' | 'bluetooth';
const saved = new Map<ApiName, PropertyDescriptor | undefined>();

function remember(name: ApiName) {
	if (!saved.has(name)) {
		saved.set(name, Object.getOwnPropertyDescriptor(Navigator.prototype, name));
	}
}

function stubApis(...names: ApiName[]) {
	for (const name of names) {
		remember(name);
		Object.defineProperty(Navigator.prototype, name, { value: {}, configurable: true });
	}
}

function hideApis(...names: ApiName[]) {
	for (const name of names) {
		remember(name);
		Reflect.deleteProperty(Navigator.prototype, name);
		Reflect.deleteProperty(navigator, name);
	}
}

function restoreApis() {
	for (const [name, descriptor] of saved) {
		Reflect.deleteProperty(Navigator.prototype, name);
		if (descriptor) Object.defineProperty(Navigator.prototype, name, descriptor);
	}
	saved.clear();
}

describe('DevicePeq', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		devicePeqStore.setDisconnected();
		eqStore.filters = [];
		eqConstraintsStore.setActive('default');
		hid.getAvailableSlots.mockReturnValue(SLOTS);
		hid.getCurrentSlot.mockResolvedValue(1);
		serial.getAvailableSlots.mockReturnValue(SLOTS);
		serial.getCurrentSlot.mockResolvedValue(0);
		ble.getAvailableSlots.mockReturnValue(SLOTS);
		ble.getCurrentSlot.mockResolvedValue(0);
		network.getCurrentSlot.mockResolvedValue(0);
	});

	afterEach(() => {
		restoreApis();
		devicePeqStore.setDisconnected();
		vi.restoreAllMocks();
	});

	// ── Feature detection ────────────────────────────────────────────────────

	describe('browser support', () => {
		it('offers a button per supported transport, plus Network', async () => {
			stubApis('hid', 'serial', 'bluetooth');
			render(DevicePeq);

			await expect.element(page.getByRole('button', { name: 'USB (HID)' })).toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'USB (Serial)' })).toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'Bluetooth' })).toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'Network' })).toBeInTheDocument();
		});

		it('hides the transports the browser lacks', async () => {
			stubApis('hid');
			hideApis('serial', 'bluetooth');
			render(DevicePeq);

			await expect.element(page.getByRole('button', { name: 'USB (HID)' })).toBeInTheDocument();
			expect(await page.getByRole('button', { name: 'USB (Serial)' }).all()).toHaveLength(0);
			expect(await page.getByRole('button', { name: 'Bluetooth' }).all()).toHaveLength(0);
		});

		it('shows the incompatible-browser notice when no device API exists at all', async () => {
			hideApis('hid', 'serial', 'bluetooth');
			render(DevicePeq);

			expect(await page.getByRole('button', { name: 'Network' }).all()).toHaveLength(0);
			// The info trigger is the only button left in this branch.
			expect(await page.getByRole('button').all()).toHaveLength(1);
		});
	});

	// ── Connecting ───────────────────────────────────────────────────────────

	describe('connecting', () => {
		beforeEach(() => stubApis('hid', 'serial', 'bluetooth'));

		it('stores the device, its slots and the slot it reports as current', async () => {
			const device = makeDevice();
			hid.getDeviceConnected.mockResolvedValue(device);
			render(DevicePeq);

			await page.getByRole('button', { name: 'USB (HID)' }).click();
			await expect.element(page.getByText('Dawn Pro', { exact: true })).toBeInTheDocument();

			expect(devicePeqStore.isConnected).toBe(true);
			expect(devicePeqStore.slots).toEqual(SLOTS);
			expect(devicePeqStore.activeSlot).toBe(1);
		});

		it('goes through the serial connector for the serial button', async () => {
			serial.getDeviceConnected.mockResolvedValue(makeDevice({ connectionType: 'serial' }));
			render(DevicePeq);

			await page.getByRole('button', { name: 'USB (Serial)' }).click();
			await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();

			expect(serial.getDeviceConnected).toHaveBeenCalledTimes(1);
			expect(hid.getDeviceConnected).not.toHaveBeenCalled();
		});

		it('goes through the BLE connector for the Bluetooth button', async () => {
			ble.getDeviceConnected.mockResolvedValue(makeDevice({ connectionType: 'ble' }));
			render(DevicePeq);

			await page.getByRole('button', { name: 'Bluetooth' }).click();
			await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();

			expect(ble.getDeviceConnected).toHaveBeenCalledTimes(1);
		});

		it('clears the connecting flag when the user dismisses the picker', async () => {
			hid.getDeviceConnected.mockResolvedValue(null);
			render(DevicePeq);

			await page.getByRole('button', { name: 'USB (HID)' }).click();
			await vi.waitFor(() => expect(devicePeqStore.isConnecting).toBe(false));
			expect(devicePeqStore.isConnected).toBe(false);
		});

		it('reports a failed connection instead of throwing', async () => {
			hid.getDeviceConnected.mockRejectedValue(new Error('no permission'));
			vi.spyOn(console, 'error').mockImplementation(() => {});
			render(DevicePeq);

			await page.getByRole('button', { name: 'USB (HID)' }).click();
			await expect.element(page.getByText('Connection failed')).toBeInTheDocument();
			expect(devicePeqStore.isConnecting).toBe(false);
		});
	});

	describe('network connection', () => {
		beforeEach(() => stubApis('hid', 'serial', 'bluetooth'));

		it('reveals the address form only after Network is pressed', async () => {
			render(DevicePeq);
			expect(await page.getByPlaceholder('Device IP').all()).toHaveLength(0);

			await page.getByRole('button', { name: 'Network' }).click();
			await expect.element(page.getByPlaceholder('Device IP')).toBeInTheDocument();
		});

		it('does nothing while the address field is blank', async () => {
			render(DevicePeq);
			await page.getByRole('button', { name: 'Network' }).click();
			await page.getByRole('button', { name: 'Connect' }).click();

			expect(network.getDeviceConnected).not.toHaveBeenCalled();
		});

		it('connects with the typed address and the chosen device type', async () => {
			network.getDeviceConnected.mockResolvedValue(
				makeDevice({ connectionType: 'network', ip: '192.168.1.5' })
			);
			render(DevicePeq);

			await page.getByRole('button', { name: 'Network' }).click();
			await page.getByPlaceholder('Device IP').fill('192.168.1.5');
			await page.getByRole('button', { name: 'Connect' }).click();
			await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();

			expect(network.getDeviceConnected).toHaveBeenCalledWith('192.168.1.5', 'WiiM');
		});

		it('takes the slot list from the device config rather than a connector call', async () => {
			network.getDeviceConnected.mockResolvedValue(makeDevice({ connectionType: 'network' }));
			render(DevicePeq);

			await page.getByRole('button', { name: 'Network' }).click();
			await page.getByPlaceholder('Device IP').fill('10.0.0.2');
			await page.getByRole('button', { name: 'Connect' }).click();
			await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();

			expect(devicePeqStore.slots).toEqual(SLOTS);
		});
	});

	// ── Connected state ──────────────────────────────────────────────────────

	describe('while connected', () => {
		beforeEach(async () => {
			stubApis('hid', 'serial', 'bluetooth');
			devicePeqStore.setConnected(makeDevice(), SLOTS, 0);
		});

		it('names the device and offers a slot per available preset', async () => {
			render(DevicePeq);

			await expect.element(page.getByText('Dawn Pro', { exact: true })).toBeInTheDocument();
			expect(await page.getByRole('option').all()).toHaveLength(2);
		});

		it('pulls the device filters into the EQ stack', async () => {
			hid.pullFromDevice.mockResolvedValue({
				filters: [
					{ type: 'PK', freq: 1000, q: 1, gain: 3, disabled: false },
					{ type: 'LSQ', freq: 100, q: 0.7, gain: -2, disabled: true }
				]
			});
			const replace = vi.spyOn(eqCommands, 'replaceFilters').mockImplementation(() => {});
			render(DevicePeq);

			await page.getByRole('button', { name: 'Pull from Device' }).click();
			await expect.element(page.getByText(/Read 2 filters/)).toBeInTheDocument();

			expect(replace).toHaveBeenCalledWith([
				{ enabled: true, type: 'PK', freq: 1000, q: 1, gain: 3 },
				{ enabled: false, type: 'LSQ', freq: 100, q: 0.7, gain: -2 }
			]);
		});

		it('reports a failed read without clearing the connection', async () => {
			hid.pullFromDevice.mockRejectedValue(new Error('timeout'));
			vi.spyOn(console, 'error').mockImplementation(() => {});
			render(DevicePeq);

			await page.getByRole('button', { name: 'Pull from Device' }).click();
			await expect.element(page.getByText('Read failed')).toBeInTheDocument();
			expect(devicePeqStore.isReading).toBe(false);
			expect(devicePeqStore.isConnected).toBe(true);
		});

		it('pushes the current stack with a preamp that cancels the largest boost', async () => {
			hid.pushToDevice.mockResolvedValue(false);
			eqStore.filters = [
				{ enabled: true, type: 'PK', freq: 1000, q: 1, gain: 4 },
				{ enabled: false, type: 'PK', freq: 3000, q: 2, gain: 6 }
			];
			render(DevicePeq);

			await page.getByRole('button', { name: 'Push to Device' }).click();
			await expect.element(page.getByText(/Wrote 2 filters/)).toBeInTheDocument();

			const [, slot, preamp, filters] = hid.pushToDevice.mock.calls[0];
			expect(slot).toBe(0);
			expect(preamp).toBe(-6);
			expect(filters).toEqual([
				{ type: 'PK', freq: 1000, q: 1, gain: 4, disabled: false },
				{ type: 'PK', freq: 3000, q: 2, gain: 6, disabled: true }
			]);
		});

		it('skips filters that are missing freq, q or gain', async () => {
			hid.pushToDevice.mockResolvedValue(false);
			eqStore.filters = [
				{ enabled: true, type: 'PK', freq: 1000, q: 1, gain: 3 },
				{ enabled: true, type: 'PK', freq: null, q: 1, gain: 3 }
			];
			render(DevicePeq);

			await page.getByRole('button', { name: 'Push to Device' }).click();
			await expect.element(page.getByText(/Wrote 1 filters/)).toBeInTheDocument();
		});

		it('disconnects afterwards when the device demands it', async () => {
			hid.pushToDevice.mockResolvedValue(true);
			eqStore.filters = [{ enabled: true, type: 'PK', freq: 1000, q: 1, gain: 3 }];
			render(DevicePeq);

			await page.getByRole('button', { name: 'Push to Device' }).click();
			await vi.waitFor(() => expect(devicePeqStore.isConnected).toBe(false));
			expect(hid.disconnectDevice).toHaveBeenCalled();
		});

		it('reports a failed write', async () => {
			hid.pushToDevice.mockRejectedValue(new Error('nack'));
			vi.spyOn(console, 'error').mockImplementation(() => {});
			render(DevicePeq);

			await page.getByRole('button', { name: 'Push to Device' }).click();
			await expect.element(page.getByText('Write failed')).toBeInTheDocument();
			expect(devicePeqStore.isWriting).toBe(false);
		});

		it('enables the newly picked slot on the device', async () => {
			render(DevicePeq);

			await page.getByRole('combobox').selectOptions('1');
			await vi.waitFor(() => expect(hid.enablePEQ).toHaveBeenCalled());

			expect(devicePeqStore.activeSlot).toBe(1);
			expect(hid.enablePEQ.mock.calls[0].slice(1)).toEqual([true, 1]);
		});

		it('keeps the slot selected even if the device rejects the change', async () => {
			hid.enablePEQ.mockRejectedValue(new Error('busy'));
			vi.spyOn(console, 'error').mockImplementation(() => {});
			render(DevicePeq);

			await page.getByRole('combobox').selectOptions('1');
			await vi.waitFor(() => expect(hid.enablePEQ).toHaveBeenCalled());

			expect(devicePeqStore.activeSlot).toBe(1);
		});

		it('drops the connection on Disconnect', async () => {
			render(DevicePeq);

			await page.getByRole('button', { name: 'Disconnect' }).click();
			await vi.waitFor(() => expect(devicePeqStore.isConnected).toBe(false));

			expect(hid.disconnectDevice).toHaveBeenCalled();
			expect(devicePeqStore.device).toBeNull();
		});

		it('disconnects locally even when the connector throws', async () => {
			hid.disconnectDevice.mockRejectedValue(new Error('gone'));
			vi.spyOn(console, 'error').mockImplementation(() => {});
			render(DevicePeq);

			await page.getByRole('button', { name: 'Disconnect' }).click();
			await vi.waitFor(() => expect(devicePeqStore.isConnected).toBe(false));
		});
	});

	// ── Constraint sync ──────────────────────────────────────────────────────

	describe('constraint sync', () => {
		beforeEach(() => stubApis('hid'));

		it('installs and selects the device constraint while connected', async () => {
			devicePeqStore.setConnected(makeDevice(), SLOTS, 0);
			render(DevicePeq);

			await vi.waitFor(() => expect(eqConstraintsStore.active?.id).toBe(DEVICE_PEQ_CONSTRAINT_ID));
			expect(eqConstraintsStore.active?.maxBands).toBe(6);
			expect(eqConstraintsStore.active?.gainMin).toBe(-12);
		});

		it('drops the device constraint again on disconnect', async () => {
			devicePeqStore.setConnected(makeDevice(), SLOTS, 0);
			render(DevicePeq);
			await vi.waitFor(() => expect(eqConstraintsStore.active?.id).toBe(DEVICE_PEQ_CONSTRAINT_ID));

			devicePeqStore.setDisconnected();

			await vi.waitFor(() =>
				expect(eqConstraintsStore.active?.id).not.toBe(DEVICE_PEQ_CONSTRAINT_ID)
			);
		});
	});
});
