/**
 * `DevicePeq` is the hardware-EQ panel: connect, pick a preset, read the device's EQ into
 * `eqStore` or write the band list out to it.
 *
 * The connect flows live in `device-peq/connect.ts` (and `network.ts`), reached through dynamic
 * `import()`s, so the spec mocks those modules and hands the component fake devices — a permission
 * prompt has no place in a test run. The `navigator.*` feature flags the component branches on
 * are stubbed per test so both the supported and the unsupported-browser layouts are exercised on
 * the same Chromium.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import DevicePeq from './DevicePeq.svelte';
import { devicePeqStore } from '$lib/stores/device-peq-store.svelte.js';
import { eqStore, type EQFilter } from '$lib/stores/eq-store.svelte.js';
import {
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID,
	DEVICE_CONSTRAINT_ID,
	eqConstraintsStore
} from '$lib/stores/eq-constraints-store.svelte.js';
import type { ConnectResult } from '$lib/device-peq/connect.js';
import type { DeviceConnection, PeqCapabilities, PeqDevice } from '$lib/device-peq/types.js';
import { hardwareProfile } from '$lib/utils/__fixtures__/eq-profiles.js';

const connect = vi.hoisted(() => ({
	connectHid: vi.fn(),
	connectSerial: vi.fn(),
	connectBle: vi.fn(),
	warmUp: vi.fn(async () => [])
}));
vi.mock('$lib/device-peq/connect.js', () => connect);

const network = vi.hoisted(() => ({ connectNetworkDevice: vi.fn() }));
vi.mock('$lib/device-peq/network.js', () => network);

const CAPS: PeqCapabilities = {
	canRead: true,
	canWrite: true,
	readsPreamp: false,
	readsSlot: true,
	writesPreamp: true,
	writesSlot: true,
	readsCurrentSlot: true,
	canEnable: true,
	slots: [
		{ id: 0, name: 'Slot A' },
		{ id: 1, name: 'Slot B' },
		{ id: 9, name: 'Off', bypass: true }
	],
	disconnectOnSave: false,
	experimental: false
};

/** Six PK bands, -12 to 12 dB on a 0.5 dB grid, preamp -12 to 0. */
const PROFILE = hardwareProfile('moondrop-dawn-pro', {
	bandCount: 6,
	band: {
		types: ['PK', 'LSC', 'HSC'],
		freq: { min: 20, max: 20000, step: 1 },
		q: { min: 0.1, max: 10, step: 0.01 },
		gain: { min: -12, max: 12, step: 0.5 }
	}
});

function makeConnection(
	overrides: Partial<DeviceConnection> = {},
	caps: Partial<PeqCapabilities> = {}
) {
	const device = {
		capabilities: { ...CAPS, ...caps },
		pull: vi.fn<PeqDevice['pull']>(async () => ({ filters: [] })),
		push: vi.fn<PeqDevice['push']>(async () => ({ reconnect: false })),
		currentSlot: vi.fn<PeqDevice['currentSlot']>(async () => 1),
		setEnabled: vi.fn<PeqDevice['setEnabled']>(async () => {}),
		close: vi.fn<PeqDevice['close']>(async () => {})
	};
	const connection: DeviceConnection = {
		device,
		connectionType: 'hid',
		name: 'Moondrop Dawn Pro',
		profile: PROFILE,
		profileSource: 'device',
		profileId: 'moondrop-dawn-pro',
		identity: {},
		...overrides
	};
	return { connection, device };
}

const connected = (connection: DeviceConnection): ConnectResult => ({
	kind: 'connected',
	connection
});

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

const band = (freq: number, gain: number, extra: Partial<EQFilter> = {}): EQFilter => ({
	enabled: true,
	type: 'PK',
	freq,
	q: 1,
	gain,
	...extra
});

describe('DevicePeq', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		devicePeqStore.setDisconnected();
		eqStore.filters = [];
		eqStore.preamp = 0;
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
	});

	afterEach(() => {
		restoreApis();
		devicePeqStore.setDisconnected();
	});

	// ── Feature detection ────────────────────────────────────────────────────

	describe('browser support', () => {
		it('leads with USB and keeps the other connections one step back', async () => {
			stubApis('hid', 'serial', 'bluetooth');
			render(DevicePeq);

			await expect
				.element(page.getByRole('button', { name: 'Connect USB device' }))
				.toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'USB serial' })).toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'Bluetooth' })).toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'Network' })).toBeInTheDocument();
		});

		it('hides the transports the browser lacks', async () => {
			stubApis('hid');
			hideApis('serial', 'bluetooth');
			render(DevicePeq);

			await expect
				.element(page.getByRole('button', { name: 'Connect USB device' }))
				.toBeInTheDocument();
			expect(await page.getByRole('button', { name: 'USB serial' }).all()).toHaveLength(0);
			expect(await page.getByRole('button', { name: 'Bluetooth' }).all()).toHaveLength(0);
		});

		it('promotes serial when there is no WebHID', async () => {
			stubApis('serial');
			hideApis('hid', 'bluetooth');
			render(DevicePeq);
			await expect.element(page.getByRole('button', { name: 'USB serial' })).toBeInTheDocument();
			expect(await page.getByRole('button', { name: 'Connect USB device' }).all()).toHaveLength(0);
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

		it('connects, names the device and its limits, and takes its current preset', async () => {
			connect.connectHid.mockResolvedValue(connected(makeConnection().connection));
			render(DevicePeq);

			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await expect
				.element(page.getByText('Moondrop Dawn Pro', { exact: true }))
				.toBeInTheDocument();
			await expect.element(page.getByText('6 bands · -12 to 12 dB')).toBeInTheDocument();

			expect(devicePeqStore.isConnected).toBe(true);
			expect(devicePeqStore.activeSlot).toBe(1);
			expect(devicePeqStore.slots.map((s) => s.name)).toEqual(['Slot A', 'Slot B']);
		});

		it('makes the device the active constraint without touching the bands', async () => {
			eqStore.filters = [band(1000, 15)];
			connect.connectHid.mockResolvedValue(connected(makeConnection().connection));
			render(DevicePeq);

			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
			expect(eqConstraintsStore.activeId).toBe(DEVICE_CONSTRAINT_ID);
			expect(eqStore.filters[0].gain).toBe(15);
			expect(eqConstraintsStore.violationCount).toBe(1);
		});

		it('uses the serial flow for the serial button', async () => {
			connect.connectSerial.mockResolvedValue(
				connected(makeConnection({ connectionType: 'serial' }).connection)
			);
			render(DevicePeq);

			await page.getByRole('button', { name: 'USB serial' }).click();
			await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
			expect(connect.connectSerial).toHaveBeenCalledTimes(1);
			expect(connect.connectHid).not.toHaveBeenCalled();
		});

		it('clears the connecting flag when the user dismisses the chooser', async () => {
			connect.connectHid.mockResolvedValue({ kind: 'cancelled' });
			render(DevicePeq);

			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await vi.waitFor(() => expect(devicePeqStore.isConnecting).toBe(false));
			expect(devicePeqStore.isConnected).toBe(false);
		});

		it('asks which device it is when several fit, then connects the pick', async () => {
			const { connection } = makeConnection({ name: 'Model B' });
			const finish = vi.fn(async () => connected(connection));
			connect.connectHid.mockResolvedValue({
				kind: 'choose',
				candidates: [
					{ id: 'model-a', label: 'Model A' },
					{ id: 'model-b', label: 'Model B' }
				],
				finish,
				cancel: vi.fn(async () => {})
			});
			render(DevicePeq);

			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await page.getByRole('combobox').selectOptions('model-b');
			await page.getByRole('button', { name: 'Connect', exact: true }).click();
			await expect.element(page.getByText('Model B', { exact: true })).toBeInTheDocument();
			expect(finish).toHaveBeenCalledWith('model-b');
		});

		it('points an unsupported device at the database', async () => {
			connect.connectHid.mockResolvedValue({ kind: 'unsupported', identity: {} });
			render(DevicePeq);

			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await expect
				.element(page.getByText("This device isn't in the EQ database yet."))
				.toBeInTheDocument();
			await expect.element(page.getByRole('link', { name: 'Help add it' })).toBeInTheDocument();
		});

		it('reports a failed connection instead of throwing', async () => {
			const error = Object.assign(new Error('gone'), { name: 'BridgeError', code: 'timeout' });
			connect.connectHid.mockRejectedValue(error);
			render(DevicePeq);

			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await expect
				.element(page.getByRole('status'))
				.toHaveTextContent("The device didn't answer. Check the cable and try again.");
			expect(devicePeqStore.isConnecting).toBe(false);
		});

		it('warns that a guessed device runs on borrowed limits', async () => {
			connect.connectHid.mockResolvedValue(
				connected(makeConnection({ profileSource: 'guess', profileId: null }).connection)
			);
			render(DevicePeq);
			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await expect.element(page.getByText(/Not in the EQ database/)).toBeInTheDocument();
		});

		it('offers a wrong-limits report for a draft profile', async () => {
			const { connection } = makeConnection({
				profile: hardwareProfile('moondrop-dawn-pro', { bandCount: 6, status: 'draft' })
			});
			connect.connectHid.mockResolvedValue(connected(connection));
			render(DevicePeq);
			await page.getByRole('button', { name: 'Connect USB device' }).click();
			const link = page.getByRole('link', { name: 'Report wrong limits' });
			await expect.element(link).toBeInTheDocument();
			expect(link.element().getAttribute('href')).toContain('profile=moondrop-dawn-pro');
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

		it('connects with the typed address and the chosen device type', async () => {
			network.connectNetworkDevice.mockReturnValue(
				makeConnection({ connectionType: 'network', name: 'Luxsin X9' }).connection
			);
			render(DevicePeq);

			await page.getByRole('button', { name: 'Network' }).click();
			await page.getByRole('combobox', { name: 'Network device type' }).selectOptions('LuxsinX9');
			await page.getByPlaceholder('Device IP').fill('192.168.1.20');
			await page.getByRole('button', { name: 'Connect', exact: true }).click();

			await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
			await expect.element(page.getByText('Luxsin X9', { exact: true })).toBeInTheDocument();
			expect(network.connectNetworkDevice).toHaveBeenCalledWith('192.168.1.20', 'LuxsinX9');
		});
	});

	// ── Connected ────────────────────────────────────────────────────────────

	describe('while connected', () => {
		beforeEach(() => stubApis('hid', 'serial', 'bluetooth'));

		async function mountConnected(caps: Partial<PeqCapabilities> = {}, current: number | null = 1) {
			const made = makeConnection({}, caps);
			made.device.currentSlot.mockResolvedValue(current);
			connect.connectHid.mockResolvedValue(connected(made.connection));
			render(DevicePeq);
			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
			return made.device;
		}

		it('reads the device’s bands from the chosen preset into the band list', async () => {
			const device = await mountConnected();
			device.pull.mockResolvedValue({
				filters: [
					{ type: 'LSC', freq: 100, q: 0.7, gain: 3 },
					null,
					{ type: 'PK', freq: 2000, q: 2, gain: -2 }
				]
			});

			await page
				.getByRole('button', { name: "Replace the band list with the device's EQ" })
				.click();
			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(2));
			expect(device.pull).toHaveBeenCalledWith({ slot: 1 });
			expect(eqStore.filters[0]).toMatchObject({ type: 'LSQ', freq: 100, gain: 3 });
			expect(eqStore.isEnabled).toBe(true);
		});

		it('writes straight away when the device can hold the EQ exactly', async () => {
			const device = await mountConnected();
			eqStore.filters = [band(1000, 3)];
			eqStore.preamp = -3;

			await page.getByRole('button', { name: 'Send the band list to the device' }).click();
			await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));
			const request = device.push.mock.calls[0][0];
			expect(request.filters).toHaveLength(6);
			expect(request.filters[0]).toEqual({ type: 'PK', freq: 1000, q: 1, gain: 3 });
			expect(request.preamp).toBe(-3);
			expect(request.slot).toBe(1);
		});

		it('keeps the preset’s own bands, flat, where the list leaves them empty', async () => {
			const device = await mountConnected();
			device.pull.mockResolvedValue({
				filters: [31, 62, 125, 250, 500, 1000].map((freq) => ({
					type: 'PK',
					freq,
					q: 0.75,
					gain: 2
				}))
			});
			eqStore.filters = [band(4000, 3)];
			eqStore.preamp = -3;

			await page.getByRole('button', { name: 'Send the band list to the device' }).click();
			await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));
			expect(device.pull).toHaveBeenCalledWith({ slot: 1 });
			expect(device.push.mock.calls[0][0].filters.map((f) => [f.freq, f.q, f.gain])).toEqual([
				[4000, 1, 3],
				[62, 0.75, 0],
				[125, 0.75, 0],
				[250, 0.75, 0],
				[500, 0.75, 0],
				[1000, 0.75, 0]
			]);
		});

		it('reads nothing before writing a list that fills every band', async () => {
			const device = await mountConnected();
			eqStore.filters = [100, 200, 400, 800, 1600, 3200].map((f) => band(f, 1));
			eqStore.preamp = -1;
			await page.getByRole('button', { name: 'Send the band list to the device' }).click();
			await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));
			expect(device.pull).not.toHaveBeenCalled();
		});

		it('shows what will change before writing an EQ the device can’t hold', async () => {
			const device = await mountConnected();
			eqStore.filters = [band(1000, 15)];
			eqStore.preamp = -15;

			await page.getByRole('button', { name: 'Send the band list to the device' }).click();
			await expect.element(page.getByText('Band 1 · Gain: 15 dB → 12 dB')).toBeInTheDocument();
			expect(device.push).not.toHaveBeenCalled();

			await page.getByRole('button', { name: 'Write', exact: true }).click();
			await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));
			expect(device.push.mock.calls[0][0].filters[0].gain).toBe(12);
		});

		it('writes nothing when the review is cancelled', async () => {
			const device = await mountConnected();
			eqStore.filters = [band(1000, 15)];
			await page.getByRole('button', { name: 'Send the band list to the device' }).click();
			await page.getByRole('button', { name: 'Cancel' }).click();
			expect(device.push).not.toHaveBeenCalled();
		});

		it('offers to reconnect after a device that restarts to save', async () => {
			const device = await mountConnected();
			device.push.mockResolvedValue({ reconnect: true });
			eqStore.filters = [band(1000, 3)];
			eqStore.preamp = -3;

			await page.getByRole('button', { name: 'Send the band list to the device' }).click();
			await expect.element(page.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
			expect(device.close).toHaveBeenCalled();
		});

		it('hides Read on a write-only device and says why', async () => {
			await mountConnected({ canRead: false });
			expect(
				await page.getByRole('button', { name: "Replace the band list with the device's EQ" }).all()
			).toHaveLength(0);
			await expect
				.element(page.getByText('This device can be written to but not read back.'))
				.toBeInTheDocument();
		});

		it('switches the device to the preset picked under Device EQ, or off', async () => {
			const device = await mountConnected();
			const control = page.getByRole('combobox', { name: 'Device EQ' });
			await expect.element(control).toHaveValue('p1');

			await control.selectOptions('Slot A');
			await vi.waitFor(() => expect(device.setEnabled).toHaveBeenCalledWith(true, 0));
			expect(devicePeqStore.activeSlot).toBe(0);

			await control.selectOptions('Off (EQ bypassed)');
			await vi.waitFor(() => expect(device.setEnabled).toHaveBeenCalledWith(false));
			await expect.element(control).toHaveValue('off');
		});

		it('shows the switch as it was when the device refuses it', async () => {
			const device = await mountConnected();
			device.setEnabled.mockRejectedValue(new Error('nope'));
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const control = page.getByRole('combobox', { name: 'Device EQ' });
			await control.selectOptions('Slot A');
			await vi.waitFor(() => expect(device.setEnabled).toHaveBeenCalled());
			await expect.element(control).toHaveValue('p1');
			expect(devicePeqStore.activeSlot).toBe(1);
		});

		it('only reads and writes the preset the device plays, where it can’t name one', async () => {
			const device = await mountConnected({ readsSlot: false, writesSlot: false });
			eqStore.filters = [100, 200, 400, 800, 1600, 3200].map((f) => band(f, 1));
			eqStore.preamp = -1;
			await page.getByRole('button', { name: 'Send the band list to the device' }).click();
			await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));
			expect(device.push.mock.calls[0][0].slot).toBeUndefined();

			// Off sits on the bypass preset: writing now would overwrite it.
			await page.getByRole('combobox', { name: 'Device EQ' }).selectOptions('Off (EQ bypassed)');
			await expect.element(page.getByText('Write to device', { exact: true })).toBeDisabled();
			await expect
				.element(
					page.getByText('This device can only read and write the preset it is playing.', {
						exact: false
					})
				)
				.toBeInTheDocument();
		});

		it('writes a device on a built-in preset to its first memory, and switches to it', async () => {
			const device = await mountConnected({}, 5);
			const control = page.getByRole('combobox', { name: 'Device EQ' });
			await expect.element(control).toHaveValue('other');
			eqStore.filters = [100, 200, 400, 800, 1600, 3200].map((f) => band(f, 1));
			eqStore.preamp = -1;

			await page.getByRole('button', { name: 'Send the band list to the device' }).click();
			await vi.waitFor(() => expect(device.setEnabled).toHaveBeenCalledWith(true, 0));
			expect(device.push.mock.calls[0][0].slot).toBe(0);
			await expect.element(control).toHaveValue('p0');
		});

		it('gives a device with one memory an on/off switch, not a preset picker', async () => {
			const device = await mountConnected({ slots: [{ id: 101, name: 'Custom' }] }, 101);
			expect(await page.getByRole('combobox').all()).toHaveLength(0);
			const toggle = page.getByRole('switch', { name: 'Device EQ' });
			await expect.element(toggle).toBeChecked();
			await toggle.click();
			await vi.waitFor(() => expect(device.setEnabled).toHaveBeenCalledWith(false));
			await expect.element(toggle).not.toBeChecked();
			await toggle.click();
			await vi.waitFor(() => expect(device.setEnabled).toHaveBeenCalledWith(true, 101));
		});

		it('says whether the device still has the list', async () => {
			await mountConnected();
			eqStore.filters = [100, 200, 400, 800, 1600, 3200].map((f) => band(f, 1));
			eqStore.preamp = -1;
			await page.getByRole('button', { name: 'Send the band list to the device' }).click();
			await expect.element(page.getByText('The device has this EQ')).toBeInTheDocument();

			eqStore.filters = [band(1000, 3)];
			await expect
				.element(page.getByText('The list has changed since the last read or write'))
				.toBeInTheDocument();
		});

		it('drops the connection and the device constraint on Disconnect', async () => {
			const device = await mountConnected();
			await page.getByRole('button', { name: 'Disconnect' }).click();
			await vi.waitFor(() => expect(devicePeqStore.isConnected).toBe(false));
			expect(device.close).toHaveBeenCalled();
			expect(eqConstraintsStore.activeId).toBe(DEFAULT_CONSTRAINT_ID);
		});
	});
});
