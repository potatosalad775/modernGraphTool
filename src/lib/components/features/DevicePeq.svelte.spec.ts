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
import { page, userEvent } from 'vitest/browser';
import DevicePeq from './DevicePeq.svelte';
import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
import { linkStore } from '#lib/stores/link-store.svelte.js';
import { devicePeqService } from '#lib/services/device-peq-service.svelte.js';
import { eqStore, type EQFilter } from '#lib/stores/eq-store.svelte.js';
import {
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID,
	DEVICE_CONSTRAINT_ID,
	eqConstraintsStore
} from '#lib/stores/eq-constraints-store.svelte.js';
import type { Profile } from '@potatosalad775/eqcaps-core';
import type { ConnectResult } from '#lib/device-peq/connect.js';
import type { DeviceConnection, PeqCapabilities, PeqDevice } from '#lib/device-peq/types.js';
import { linkConnection, type LinkPort } from '#lib/device-peq/link.js';
import { OWN_EQ, type ListedEq } from '#lib/device-peq/device-eqs.js';
import type { CommandResult, LinkStatus } from 'peq-link/client';
import { settingsStore } from '#lib/stores/settings-store.svelte.js';
import { hardwareProfile } from '#lib/utils/__fixtures__/eq-profiles.js';
import { volumeWarning } from '#lib/services/volume-warning.svelte.js';

const PROFILE_NOTES = "About this device's profile";

const connect = vi.hoisted(() => ({
	connectHid: vi.fn(),
	connectSerial: vi.fn(),
	connectBle: vi.fn(),
	warmUp: vi.fn(async () => [])
}));
vi.mock('#lib/device-peq/connect.js', () => connect);

const network = vi.hoisted(() => ({ connectNetworkDevice: vi.fn() }));
vi.mock('#lib/device-peq/network.js', () => network);

const CAPS: PeqCapabilities = {
	canRead: true,
	canWrite: true,
	readsPreamp: false,
	readsSlot: true,
	writesPreamp: true,
	writesSlot: true,
	readsCurrentSlot: true,
	readsEnabled: false,
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
		eqEnabled: vi.fn<PeqDevice['eqEnabled']>(async () => null),
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

// The volume warning has its own specs (volume-warning.svelte.spec.ts); here nothing waits on it.
beforeEach(() => settingsStore.setVolumeWarning(false));
afterEach(() => {
	settingsStore.setVolumeWarning(true);
	volumeWarning.reset();
});

describe('DevicePeq', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		devicePeqStore.setDisconnected();
		eqStore.filters = [];
		eqStore.preamp = 0;
		settingsStore.devicePeqAutoWrite = false;
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
	});

	afterEach(() => {
		restoreApis();
		devicePeqStore.setDisconnected();
		linkStore.reset();
	});

	// ── Feature detection ────────────────────────────────────────────────────

	describe('browser support', () => {
		it('leads with USB and keeps the other connections one step back', async () => {
			stubApis('hid', 'serial', 'bluetooth');
			await render(DevicePeq);

			await expect
				.element(page.getByRole('button', { name: 'Connect USB device' }))
				.toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'USB serial' })).toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'Bluetooth' })).toBeInTheDocument();
			await expect.element(page.getByRole('button', { name: 'Network' })).toBeInTheDocument();
		});

		it('explains the connections and links to the supported devices', async () => {
			stubApis('hid', 'serial', 'bluetooth');
			await render(DevicePeq);

			await page.getByRole('button', { name: 'About connection types' }).click();
			await expect.element(page.getByText(/including Bluetooth serial ports/)).toBeInTheDocument();
			await expect
				.element(page.getByRole('link', { name: 'Supported devices' }))
				.toHaveAttribute('href', 'https://potatosalad775.github.io/eqcaps/?kind=hardware');
		});

		it('hides the transports the browser lacks', async () => {
			stubApis('hid');
			hideApis('serial', 'bluetooth');
			await render(DevicePeq);

			await expect
				.element(page.getByRole('button', { name: 'Connect USB device' }))
				.toBeInTheDocument();
			expect(page.getByRole('button', { name: 'USB serial' }).all()).toHaveLength(0);
			expect(page.getByRole('button', { name: 'Bluetooth' }).all()).toHaveLength(0);
		});

		it('promotes serial when there is no WebHID', async () => {
			stubApis('serial');
			hideApis('hid', 'bluetooth');
			await render(DevicePeq);
			await expect.element(page.getByRole('button', { name: 'USB serial' })).toBeInTheDocument();
			expect(page.getByRole('button', { name: 'Connect USB device' }).all()).toHaveLength(0);
		});

		it('shows the incompatible-browser notice when no device API exists at all', async () => {
			hideApis('hid', 'serial', 'bluetooth');
			await render(DevicePeq);

			await expect
				.element(page.getByText(/does not support the necessary APIs/))
				.toBeInTheDocument();
			expect(page.getByRole('button', { name: /Connect/ }).all()).toHaveLength(0);
			// uniPEQ reaches the device instead: the link needs none of the browser's device APIs.
			await expect
				.element(page.getByRole('button', { name: 'Link with uniPEQ' }))
				.toBeInTheDocument();
			// Whether the device would work in another browser is still worth knowing.
			await expect
				.element(page.getByRole('link', { name: 'Supported devices' }))
				.toBeInTheDocument();
		});
	});

	// ── Connecting ───────────────────────────────────────────────────────────

	describe('connecting', () => {
		beforeEach(() => stubApis('hid', 'serial', 'bluetooth'));

		it('connects, names the device and its limits, and takes its current preset', async () => {
			connect.connectHid.mockResolvedValue(connected(makeConnection().connection));
			await render(DevicePeq);

			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await expect
				.element(page.getByText('Moondrop Dawn Pro', { exact: true }))
				.toBeInTheDocument();
			await expect.element(page.getByText('6 bands · -12 to +12 dB')).toBeInTheDocument();

			expect(devicePeqStore.isConnected).toBe(true);
			expect(devicePeqStore.activeSlot).toBe(1);
			expect(devicePeqStore.slots.map((s) => s.name)).toEqual(['Slot A', 'Slot B']);
		});

		it('makes the device the active constraint without touching the bands', async () => {
			eqStore.filters = [band(1000, 15)];
			connect.connectHid.mockResolvedValue(connected(makeConnection().connection));
			await render(DevicePeq);

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
			await render(DevicePeq);

			await page.getByRole('button', { name: 'USB serial' }).click();
			await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
			expect(connect.connectSerial).toHaveBeenCalledTimes(1);
			expect(connect.connectHid).not.toHaveBeenCalled();
		});

		it('clears the connecting flag when the user dismisses the chooser', async () => {
			connect.connectHid.mockResolvedValue({ kind: 'cancelled' });
			await render(DevicePeq);

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
			await render(DevicePeq);

			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await page.getByRole('combobox').selectOptions('model-b');
			await page.getByRole('button', { name: 'Connect', exact: true }).click();
			await expect.element(page.getByText('Model B', { exact: true })).toBeInTheDocument();
			expect(finish).toHaveBeenCalledWith('model-b');
		});

		it('points an unsupported device at the database', async () => {
			connect.connectHid.mockResolvedValue({ kind: 'unsupported', identity: {} });
			await render(DevicePeq);

			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await expect
				.element(page.getByText("This device isn't in the EQ database."))
				.toBeInTheDocument();
			await expect.element(page.getByRole('link', { name: 'Help add it' })).toBeInTheDocument();
		});

		it('reports a failed connection instead of throwing', async () => {
			const error = Object.assign(new Error('gone'), { name: 'BridgeError', code: 'timeout' });
			connect.connectHid.mockRejectedValue(error);
			await render(DevicePeq);

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
			await render(DevicePeq);
			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await page.getByRole('button', { name: PROFILE_NOTES }).click();
			await expect.element(page.getByText(/experimental compatible protocol/)).toBeInTheDocument();
		});

		it('has nothing to flag about an exact, checked profile', async () => {
			connect.connectHid.mockResolvedValue(connected(makeConnection().connection));
			await render(DevicePeq);
			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
			expect(page.getByRole('button', { name: PROFILE_NOTES }).all()).toHaveLength(0);
		});

		it('offers a wrong-limits report for a draft profile', async () => {
			const { connection } = makeConnection({
				profile: hardwareProfile('moondrop-dawn-pro', { bandCount: 6, status: 'draft' })
			});
			connect.connectHid.mockResolvedValue(connected(connection));
			await render(DevicePeq);
			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await page.getByRole('button', { name: PROFILE_NOTES }).click();
			const link = page.getByRole('link', { name: 'Report wrong limits' });
			await expect.element(link).toBeInTheDocument();
			expect(link.element().getAttribute('href')).toContain('profile=moondrop-dawn-pro');
		});
	});

	describe('network connection', () => {
		beforeEach(() => stubApis('hid', 'serial', 'bluetooth'));

		it('reveals the address form only after Network is pressed', async () => {
			await render(DevicePeq);
			expect(page.getByPlaceholder('Device IP').all()).toHaveLength(0);
			await page.getByRole('button', { name: 'Network' }).click();
			await expect.element(page.getByPlaceholder('Device IP')).toBeInTheDocument();
		});

		it('connects with the typed address and the chosen device type', async () => {
			network.connectNetworkDevice.mockReturnValue(
				makeConnection({ connectionType: 'network', name: 'Luxsin X9' }).connection
			);
			await render(DevicePeq);

			await page.getByRole('button', { name: 'Network' }).click();
			await page.getByRole('combobox', { name: 'Network device type' }).selectOptions('LuxsinX9');
			await page.getByPlaceholder('Device IP').fill('192.168.1.20');
			await page.getByRole('button', { name: 'Connect', exact: true }).click();

			await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
			await expect.element(page.getByText('Luxsin X9', { exact: true })).toBeInTheDocument();
			expect(network.connectNetworkDevice).toHaveBeenCalledWith('192.168.1.20', 'LuxsinX9');
		});

		it('connects on Enter, and gives the field its keyboard hints', async () => {
			network.connectNetworkDevice.mockReturnValue(
				makeConnection({ connectionType: 'network', name: 'WiiM' }).connection
			);
			await render(DevicePeq);

			await page.getByRole('button', { name: 'Network' }).click();
			const field = page.getByRole('textbox', { name: 'Device IP' });
			await expect.element(field).toHaveAttribute('autocomplete', 'off');
			await expect.element(field).toHaveAttribute('autocapitalize', 'none');
			await expect.element(field).toHaveAttribute('spellcheck', 'false');
			await expect.element(field).toHaveAttribute('enterkeyhint', 'go');

			await field.fill('wiim.local');
			await userEvent.keyboard('{Enter}');
			await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
			expect(network.connectNetworkDevice).toHaveBeenCalledWith('wiim.local', 'WiiM');
		});

		it('refuses an address that is not a device, beside the field and before connecting', async () => {
			await render(DevicePeq);

			await page.getByRole('button', { name: 'Network' }).click();
			const field = page.getByRole('textbox', { name: 'Device IP' });
			await field.fill('https://example.com/x');
			await userEvent.keyboard('{Enter}');

			await expect.element(page.getByRole('alert')).toBeVisible();
			await expect
				.poll(() => page.getByRole('alert').element().textContent)
				.toContain('IP address');
			await expect.element(field).toHaveAttribute('aria-invalid', 'true');
			await expect.element(field).toHaveAccessibleDescription(/Enter only the device's IP address/);
			expect(network.connectNetworkDevice).not.toHaveBeenCalled();

			await field.fill('example.com');
			await userEvent.keyboard('{Enter}');
			await expect.element(page.getByRole('alert')).toBeVisible();
			await expect
				.poll(() => page.getByRole('alert').element().textContent)
				.toContain('public hostname');

			// Typing again clears the message.
			await field.fill('192.168.1.20');
			await expect.element(field).not.toHaveAttribute('aria-invalid');
		});

		it('keeps the form open and says why when the connection fails', async () => {
			network.connectNetworkDevice.mockImplementationOnce(() => {
				throw Object.assign(new Error('x'), { name: 'NetworkAccessError' });
			});
			await render(DevicePeq);

			await page.getByRole('button', { name: 'Network' }).click();
			const field = page.getByRole('textbox', { name: 'Device IP' });
			await field.fill('192.168.1.20');
			await page.getByRole('button', { name: 'Connect', exact: true }).click();

			await expect.element(page.getByRole('alert')).toBeVisible();
			await expect
				.poll(() => page.getByRole('alert').element().textContent)
				.toContain("couldn't reach the device");
			await expect.element(field).toBeInTheDocument();
			await expect.element(field).toHaveAttribute('aria-invalid', 'true');
		});
	});

	// ── Connected ────────────────────────────────────────────────────────────

	describe('while connected', () => {
		beforeEach(() => stubApis('hid', 'serial', 'bluetooth'));

		async function mountConnected(caps: Partial<PeqCapabilities> = {}, current: number | null = 1) {
			const made = makeConnection({}, caps);
			made.device.currentSlot.mockResolvedValue(current);
			connect.connectHid.mockResolvedValue(connected(made.connection));
			await render(DevicePeq);
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

			await page.getByRole('button', { name: 'Read from device' }).click();
			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(2));
			expect(device.pull).toHaveBeenCalledWith({ slot: 1 });
			expect(eqStore.filters[0]).toMatchObject({ type: 'LSQ', freq: 100, gain: 3 });
			expect(eqStore.isEnabled).toBe(true);
		});

		it('writes straight away when the device can hold the EQ exactly', async () => {
			const device = await mountConnected();
			eqStore.filters = [band(1000, 3)];
			eqStore.preamp = -3;

			await page.getByRole('button', { name: 'Write to device' }).click();
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

			await page.getByRole('button', { name: 'Write to device' }).click();
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
			await page.getByRole('button', { name: 'Write to device' }).click();
			await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));
			expect(device.pull).not.toHaveBeenCalled();
		});

		it('shows what will change before writing an EQ the device can’t hold', async () => {
			const device = await mountConnected();
			eqStore.filters = [band(1000, 15)];
			eqStore.preamp = -15;

			await page.getByRole('button', { name: 'Write to device' }).click();
			await expect.element(page.getByText('Band 1 · Gain: 15 dB → 12 dB')).toBeInTheDocument();
			expect(device.push).not.toHaveBeenCalled();

			await page.getByRole('button', { name: 'Write', exact: true }).click();
			await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));
			expect(device.push.mock.calls[0][0].filters[0].gain).toBe(12);
		});

		it('reviews again, writing nothing yet, when Write reaches another preset by then', async () => {
			const device = await mountConnected();
			eqStore.filters = [band(1000, 15)];
			eqStore.preamp = -15;

			await page.getByRole('button', { name: 'Write to device' }).click();
			await expect.element(page.getByText('Band 1 · Gain: 15 dB → 12 dB')).toBeInTheDocument();
			// Write goes elsewhere while the review is open.
			devicePeqStore.target(0);
			await page.getByRole('button', { name: 'Write', exact: true }).click();

			await vi.waitFor(() => expect(device.pull).toHaveBeenCalledWith({ slot: 0 }));
			await expect.element(page.getByText('Band 1 · Gain: 15 dB → 12 dB')).toBeInTheDocument();
			expect(device.push).not.toHaveBeenCalled();
			await page.getByRole('button', { name: 'Write', exact: true }).click();
			await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));
			expect(device.push.mock.calls[0][0].slot).toBe(0);
		});

		it('writes nothing when the review is cancelled', async () => {
			const device = await mountConnected();
			eqStore.filters = [band(1000, 15)];
			await page.getByRole('button', { name: 'Write to device' }).click();
			await page.getByRole('button', { name: 'Cancel' }).click();
			expect(device.push).not.toHaveBeenCalled();
		});

		it('offers to reconnect after a device that restarts to save', async () => {
			const device = await mountConnected();
			device.push.mockResolvedValue({ reconnect: true });
			eqStore.filters = [band(1000, 3)];
			eqStore.preamp = -3;

			await page.getByRole('button', { name: 'Write to device' }).click();
			await expect.element(page.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
			expect(device.close).toHaveBeenCalled();
		});

		it('hides Read on a write-only device and says why', async () => {
			await mountConnected({ canRead: false });
			expect(page.getByRole('button', { name: 'Read from device' }).all()).toHaveLength(0);
			await page.getByRole('button', { name: PROFILE_NOTES }).click();
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

		describe('while the device is busy', () => {
			const readButton = () => page.getByRole('button', { name: 'Read from device' });
			const writeButton = () => page.getByRole('button', { name: 'Write to device' });

			it('keeps focus on Read while it reads, and takes no press of Read or Write meanwhile', async () => {
				const device = await mountConnected();
				let finish = () => {};
				device.pull.mockImplementation(
					() => new Promise((resolve) => (finish = () => resolve({ filters: [] })))
				);
				// The label reads "Reading…" meanwhile, so the button is held by its element.
				const read = readButton().element() as HTMLButtonElement;
				const write = writeButton().element() as HTMLButtonElement;
				read.focus();

				await userEvent.keyboard('{Enter}');
				await vi.waitFor(() => expect(device.pull).toHaveBeenCalledOnce());
				await vi.waitFor(() => expect(read.getAttribute('aria-disabled')).toBe('true'));
				expect(write.getAttribute('aria-disabled')).toBe('true');
				expect(read.disabled).toBe(false);
				expect(write.disabled).toBe(false);
				expect(document.activeElement).toBe(read);

				await userEvent.keyboard('{Enter}');
				write.focus();
				await userEvent.keyboard('{Enter}');
				expect(device.pull).toHaveBeenCalledOnce();
				expect(device.push).not.toHaveBeenCalled();

				finish();
				await vi.waitFor(() => expect(read.getAttribute('aria-disabled')).toBeNull());
				expect(document.activeElement).toBe(write);
			});

			it('keeps Device EQ focusable, and puts a pick made meanwhile back', async () => {
				const device = await mountConnected();
				const control = page.getByRole('combobox', { name: 'Device EQ' });
				(control.element() as HTMLElement).focus();

				devicePeqStore.isReading = true;
				await expect.element(control).toHaveAttribute('aria-disabled', 'true');
				await expect.element(control).not.toHaveAttribute('disabled');
				expect(document.activeElement).toBe(control.element());

				// Playwright won't pick an option in an `aria-disabled` dropdown; a user still can.
				const select = control.element() as HTMLSelectElement;
				select.value = 'p0';
				select.dispatchEvent(new Event('change', { bubbles: true }));
				await expect.element(control).toHaveValue('p1');
				expect(device.setEnabled).not.toHaveBeenCalled();
			});

			it('keeps the Device EQ switch focusable, and takes no press meanwhile', async () => {
				const device = await mountConnected({ slots: [{ id: 101, name: 'Custom' }] }, 101);
				const toggle = page.getByRole('switch', { name: 'Device EQ' });
				(toggle.element() as HTMLElement).focus();

				devicePeqStore.isReading = true;
				await expect.element(toggle).toHaveAttribute('aria-disabled', 'true');
				expect(document.activeElement).toBe(toggle.element());

				await userEvent.keyboard(' ');
				await toggle.click({ force: true });
				await expect.element(toggle).toBeChecked();
				expect(device.setEnabled).not.toHaveBeenCalled();
			});

			it('takes no press of Review and write meanwhile', async () => {
				const device = await mountConnected();
				settingsStore.devicePeqAutoWrite = true;
				devicePeqStore.autoPaused = true;
				const review = page.getByRole('button', { name: 'Review and write' });
				await expect.element(review).toBeVisible();

				devicePeqStore.isReading = true;
				await expect.element(review).toHaveAttribute('aria-disabled', 'true');
				await review.click({ force: true });
				expect(device.push).not.toHaveBeenCalled();
				expect(page.getByRole('dialog').all()).toHaveLength(0);
			});
		});

		describe('the Presets row', () => {
			const PLACES = [0, 1, 2, 3, 4].map((id) => ({ id, name: `EQ ${id + 1}` }));
			const newButton = () => page.getByRole('button', { name: 'New', exact: true });

			/**
			 * Connects a device that answers `slots()` with its own list (`held`), unless `list` is a
			 * failure. Device EQ is a dropdown only while it holds more than one.
			 */
			async function mountListing(
				caps: Partial<PeqCapabilities>,
				list: 'listed' | 'fails' | 'none' = 'listed',
				held = ['Jazz', 'Rock']
			) {
				const made = makeConnection({}, { slots: PLACES, ...caps });
				made.device.currentSlot.mockResolvedValue(held.length - 1);
				const slots = vi.fn<NonNullable<PeqDevice['slots']>>(async () => {
					if (list === 'fails') throw new Error('no answer');
					return held.map((name, id) => ({ id, name }));
				});
				connect.connectHid.mockResolvedValue(
					connected(
						list === 'none'
							? made.connection
							: { ...made.connection, device: { ...made.device, slots } }
					)
				);
				await render(DevicePeq);
				await page.getByRole('button', { name: 'Connect USB device' }).click();
				await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
				const eq = page.getByRole(held.length > 1 ? 'combobox' : 'switch', { name: 'Device EQ' });
				await expect.element(eq).toBeInTheDocument();
			}

			it('appears under Device EQ for a device that keeps and edits its own list', async () => {
				await mountListing({ listsSlots: true, editsSlots: true });

				await expect.element(page.getByText('Presets', { exact: true })).toBeInTheDocument();
				await expect.element(newButton()).toBeEnabled();
				await expect
					.element(page.getByRole('button', { name: 'Rename', exact: true }))
					.toBeEnabled();
				await expect
					.element(page.getByRole('button', { name: 'Delete', exact: true }))
					.toBeEnabled();
				// Device EQ lists what the device holds, not the places it has room for.
				await expect.element(page.getByRole('option', { name: 'Rock' })).toBeInTheDocument();
				expect(page.getByRole('option', { name: 'EQ 1' }).all()).toHaveLength(0);
			});

			it('stays with one preset left, Device EQ then a switch, so New is still there', async () => {
				await mountListing({ listsSlots: true, editsSlots: true }, 'listed', ['Jazz']);

				await expect.element(page.getByRole('switch', { name: 'Device EQ' })).toBeChecked();
				await expect.element(newButton()).toBeEnabled();
				await expect
					.element(page.getByRole('button', { name: 'Rename', exact: true }))
					.toBeEnabled();
				await expect
					.element(page.getByRole('button', { name: 'Delete', exact: true }))
					.toBeDisabled();
			});

			it('is not there for an ordinary device', async () => {
				await mountConnected();
				await expect.element(page.getByRole('combobox', { name: 'Device EQ' })).toBeInTheDocument();
				expect(page.getByText('Presets', { exact: true }).all()).toHaveLength(0);
				expect(newButton().all()).toHaveLength(0);
			});

			it('is not there for a device that lists its presets but cannot edit them', async () => {
				await mountListing({ listsSlots: true, editsSlots: false });
				await expect.element(page.getByRole('option', { name: 'Rock' })).toBeInTheDocument();
				expect(newButton().all()).toHaveLength(0);
			});

			it('is not there when the device’s list could not be read', async () => {
				await mountListing({ listsSlots: true, editsSlots: true }, 'fails');
				await expect.element(page.getByRole('option', { name: 'EQ 1' })).toBeInTheDocument();
				expect(newButton().all()).toHaveLength(0);
			});

			it('is not there for a device with no way to list its presets', async () => {
				await mountListing({ listsSlots: true, editsSlots: true }, 'none');
				expect(newButton().all()).toHaveLength(0);
			});
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
			await page.getByRole('button', { name: 'Write to device' }).click();
			await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));
			expect(device.push.mock.calls[0][0].slot).toBeUndefined();

			// Off sits on the bypass preset: writing now would overwrite it.
			await page.getByRole('combobox', { name: 'Device EQ' }).selectOptions('Off (EQ bypassed)');
			const write = page.getByRole('button', { name: 'Write to device' });
			await expect.element(write).toBeDisabled();
			await expect
				.element(write)
				.toHaveAccessibleDescription(/The device's EQ is off\. Turn it on first\./);
		});

		describe('a preset list that marks the writable ones', () => {
			const MARKED = [
				{ id: 0, name: 'Jazz' },
				{ id: 1, name: 'USER1', writable: true }
			];

			it('won’t write a built-in preset, and says so, but still reads it', async () => {
				const device = await mountConnected({ slots: MARKED }, 0);
				eqStore.filters = [100, 200, 400, 800, 1600, 3200].map((f) => band(f, 1));
				eqStore.preamp = -1;

				const write = page.getByRole('button', { name: 'Write to device' });
				await expect.element(write).toBeDisabled();
				await expect.element(write).toHaveAccessibleDescription(/built-in preset can't be written/);
				await expect
					.element(page.getByRole('status'))
					.toHaveTextContent(
						"This built-in preset can't be written. Pick another preset under Device EQ to write."
					);
				await expect.element(page.getByRole('button', { name: 'Read from device' })).toBeEnabled();
				expect(device.push).not.toHaveBeenCalled();
			});

			it('writes once a writable preset is picked', async () => {
				const device = await mountConnected({ slots: MARKED }, 0);
				eqStore.filters = [100, 200, 400, 800, 1600, 3200].map((f) => band(f, 1));
				eqStore.preamp = -1;

				await page.getByRole('combobox', { name: 'Device EQ' }).selectOptions('USER1');
				await page.getByRole('button', { name: 'Write to device' }).click();
				await vi.waitFor(() => expect(device.push).toHaveBeenCalledTimes(1));
				expect(device.push.mock.calls[0][0].slot).toBe(1);
			});
		});

		it('shows Off when the device says its EQ is off, whatever preset it is on', async () => {
			const made = makeConnection({}, { readsEnabled: true });
			made.device.eqEnabled.mockResolvedValue(false);
			connect.connectHid.mockResolvedValue(connected(made.connection));
			await render(DevicePeq);
			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await expect.element(page.getByRole('combobox', { name: 'Device EQ' })).toHaveValue('off');
		});

		describe('a device on no preset', () => {
			/** A Qudelix after any edit: on none of its presets, with an EQ switch of its own. */
			async function mountUnsaved(enabled: boolean) {
				const made = makeConnection(
					{},
					{
						readsSlot: false,
						readsEnabled: true,
						slots: [
							{ id: 0, name: 'Flat' },
							{ id: 22, name: 'Custom #1', writable: true },
							{ id: 23, name: 'Custom #2', writable: true }
						]
					}
				);
				made.device.currentSlot.mockResolvedValue(null);
				made.device.eqEnabled.mockResolvedValue(enabled);
				connect.connectHid.mockResolvedValue(connected(made.connection));
				await render(DevicePeq);
				await page.getByRole('button', { name: 'Connect USB device' }).click();
				await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
				return made.device;
			}

			it('shows Unsaved EQ, which can’t be picked while it plays', async () => {
				await mountUnsaved(true);
				const control = page.getByRole('combobox', { name: 'Device EQ' });
				await expect.element(control).toHaveValue('unsaved');
				await expect.element(page.getByRole('option', { name: 'Unsaved EQ' })).toBeDisabled();
			});

			it('turns the EQ back on as it was from Off', async () => {
				const device = await mountUnsaved(false);
				const control = page.getByRole('combobox', { name: 'Device EQ' });
				await expect.element(control).toHaveValue('off');
				await control.selectOptions('Unsaved EQ');
				await vi.waitFor(() => expect(device.setEnabled).toHaveBeenCalledWith(true, undefined));
				await expect.element(control).toHaveValue('unsaved');
			});
		});

		it('writes a device on a built-in preset to its first memory, and switches to it', async () => {
			const device = await mountConnected({}, 5);
			const control = page.getByRole('combobox', { name: 'Device EQ' });
			await expect.element(control).toHaveValue('other');
			eqStore.filters = [100, 200, 400, 800, 1600, 3200].map((f) => band(f, 1));
			eqStore.preamp = -1;

			await page.getByRole('button', { name: 'Write to device' }).click();
			await vi.waitFor(() => expect(device.setEnabled).toHaveBeenCalledWith(true, 0));
			expect(device.push.mock.calls[0][0].slot).toBe(0);
			await expect.element(control).toHaveValue('p0');
		});

		it('gives a device with one memory an on/off switch, not a preset picker', async () => {
			const device = await mountConnected({ slots: [{ id: 101, name: 'Custom' }] }, 101);
			expect(page.getByRole('combobox').all()).toHaveLength(0);
			const toggle = page.getByRole('switch', { name: 'Device EQ' });
			await expect.element(toggle).toBeChecked();
			await toggle.click();
			await vi.waitFor(() => expect(device.setEnabled).toHaveBeenCalledWith(false));
			await expect.element(toggle).not.toBeChecked();
			await toggle.click();
			await vi.waitFor(() => expect(device.setEnabled).toHaveBeenCalledWith(true, 101));
		});

		it('offers auto-write to a device that can take it', async () => {
			await mountConnected();
			await expect
				.element(page.getByRole('switch', { name: 'Write changes automatically' }))
				.toBeInTheDocument();
		});

		it('has no auto-write for a device that restarts after every save', async () => {
			await mountConnected({ disconnectOnSave: true });
			expect(page.getByRole('switch', { name: 'Write changes automatically' }).all()).toHaveLength(
				0
			);
		});

		it('says whether the device still has the list', async () => {
			await mountConnected();
			eqStore.filters = [100, 200, 400, 800, 1600, 3200].map((f) => band(f, 1));
			eqStore.preamp = -1;
			await page.getByRole('button', { name: 'Write to device' }).click();
			// The write's own message stands for "in sync": one line, not two saying the same.
			const status = page.getByRole('status');
			await expect.element(status).toHaveTextContent('Wrote 6 bands to the device');
			expect(page.getByText('The EQ shown matches the device.').all()).toHaveLength(0);

			eqStore.filters = [band(1000, 3)];
			await expect
				.element(status)
				.toHaveTextContent('The EQ has changed since the last read or write.');
		});

		it('puts a failure above the sync state until the next operation', async () => {
			const device = await mountConnected();
			eqStore.filters = [100, 200, 400, 800, 1600, 3200].map((f) => band(f, 1));
			eqStore.preamp = -1;
			device.push.mockRejectedValueOnce(
				Object.assign(new Error('gone'), { name: 'BridgeError', code: 'timeout' })
			);
			vi.spyOn(console, 'error').mockImplementation(() => {});
			await page.getByRole('button', { name: 'Write to device' }).click();
			const status = page.getByRole('status');
			await expect
				.element(status)
				.toHaveTextContent("The device didn't answer. Check the cable and try again.");

			await page.getByRole('button', { name: 'Write to device' }).click();
			await expect.element(status).toHaveTextContent('Wrote 6 bands to the device');
		});

		it('offers a reviewed write when auto-write pauses', async () => {
			await mountConnected();
			devicePeqStore.autoPaused = true;
			// Paused only matters while auto-write is on.
			expect(page.getByRole('button', { name: 'Review and write' }).all()).toHaveLength(0);
			settingsStore.devicePeqAutoWrite = true;
			await expect
				.element(page.getByRole('status'))
				.toHaveTextContent("Auto-write paused: some EQ settings don't fit this device.");
			await expect.element(page.getByRole('button', { name: 'Review and write' })).toBeVisible();
		});

		it('drops the connection and the device constraint on Disconnect', async () => {
			const device = await mountConnected();
			await page.getByRole('button', { name: 'Disconnect' }).click();
			await vi.waitFor(() => expect(devicePeqStore.isConnected).toBe(false));
			expect(device.close).toHaveBeenCalled();
			expect(eqConstraintsStore.activeId).toBe(DEFAULT_CONSTRAINT_ID);
		});
	});
	// ── One connection at a time ─────────────────────────────────────────────

	// ── A device with more than one EQ ───────────────────────────────────────

	describe('a device with more than one EQ', () => {
		beforeEach(() => stubApis('hid', 'serial', 'bluetooth'));

		const SPK_SLOTS = [
			{ id: 10, name: 'Spk A' },
			{ id: 11, name: 'Spk B' }
		];

		/** A Qudelix-like profile: the user EQ it describes, and the headphone EQ it lists. */
		const TWO_PROFILE: Profile = {
			...hardwareProfile('qudelix-5k', { bandCount: 6, band: PROFILE.band }),
			engine: 'USR EQ',
			device: { brand: 'Qudelix', model: '5K' },
			protocol: {
				handler: 'qudelix-5k',
				eqs: [
					{
						id: 'spk',
						name: 'SPK EQ',
						bandCount: 6,
						presets: SPK_SLOTS.map(({ id, name }) => ({ id, name }))
					}
				]
			}
		};

		/** Connects a device with a user EQ and a headphone EQ, the latter absent in the current mode. */
		async function mountTwoEq({ spkAbsent = false } = {}) {
			const spk = makeConnection({}, { slots: SPK_SLOTS }).device;
			spk.currentSlot.mockImplementation(async () => {
				if (spkAbsent) {
					throw Object.assign(new Error('x'), { name: 'BridgeError', code: 'unsupported' });
				}
				return 10;
			});
			const made = makeConnection(
				{ profile: TWO_PROFILE, name: 'Qudelix 5K · USR EQ' },
				{ eqs: [{ id: 'spk', name: 'SPK EQ', bandCount: 6, slots: SPK_SLOTS, perChannel: false }] }
			);
			const device = Object.assign(made.device, { eq: vi.fn(() => spk) });
			connect.connectHid.mockResolvedValue(connected(made.connection));
			await render(DevicePeq);
			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
			return { device, spk };
		}

		const eqRow = () => page.getByRole('group', { name: 'EQ', exact: true });

		it('shows an EQ row naming each EQ, with the one viewed checked', async () => {
			await mountTwoEq();

			await expect.element(eqRow()).toBeInTheDocument();
			const own = page.getByRole('radio', { name: 'USR EQ' });
			const spk = page.getByRole('radio', { name: 'SPK EQ' });
			await expect.element(own).toBeChecked();
			await expect.element(spk).not.toBeChecked();
			await expect.element(own).toBeEnabled();
			await expect.element(spk).toBeEnabled();
			expect(page.getByText(/Not available in the device's current mode/).all()).toHaveLength(0);
		});

		it('offers the presets of the EQ viewed under Device EQ', async () => {
			await mountTwoEq();
			const control = page.getByRole('combobox', { name: 'Device EQ' });
			await expect.element(control).toHaveValue('p1');
			await expect.element(page.getByRole('option', { name: 'Slot A' })).toBeInTheDocument();
			expect(page.getByRole('option', { name: 'Spk A' }).all()).toHaveLength(0);
		});

		it('switches to the EQ picked, without reading it or touching the bands', async () => {
			const { device, spk } = await mountTwoEq();
			eqStore.filters = [band(1000, 3)];

			await page.getByRole('radio', { name: 'SPK EQ' }).click();

			await expect.element(page.getByRole('radio', { name: 'SPK EQ' })).toBeChecked();
			await expect.element(page.getByRole('radio', { name: 'USR EQ' })).not.toBeChecked();
			await expect
				.element(page.getByRole('status'))
				.toHaveTextContent('Read and Write now use SPK EQ.');
			// Device EQ lists that EQ's presets now.
			await expect.element(page.getByRole('option', { name: 'Spk A' })).toBeInTheDocument();
			await expect.element(page.getByRole('option', { name: 'Spk B' })).toBeInTheDocument();
			expect(page.getByRole('option', { name: 'Slot A' }).all()).toHaveLength(0);
			await expect.element(page.getByRole('combobox', { name: 'Device EQ' })).toHaveValue('p10');

			expect(devicePeqStore.eq).toBe('spk');
			expect(device.pull).not.toHaveBeenCalled();
			expect(spk.pull).not.toHaveBeenCalled();
			expect(eqStore.filters).toHaveLength(1);
			expect(eqStore.filters[0].gain).toBe(3);
		});

		it('sends Read to the EQ picked', async () => {
			const { device, spk } = await mountTwoEq();
			await page.getByRole('radio', { name: 'SPK EQ' }).click();
			await expect.element(page.getByRole('radio', { name: 'SPK EQ' })).toBeChecked();

			await page.getByRole('button', { name: 'Read from device' }).click();
			await vi.waitFor(() => expect(spk.pull).toHaveBeenCalledWith({ slot: 10 }));
			expect(device.pull).not.toHaveBeenCalled();
		});

		it('goes back to the user EQ when it is picked again', async () => {
			await mountTwoEq();
			await page.getByRole('radio', { name: 'SPK EQ' }).click();
			await expect.element(page.getByRole('radio', { name: 'SPK EQ' })).toBeChecked();

			await page.getByRole('radio', { name: 'USR EQ' }).click();
			await expect.element(page.getByRole('radio', { name: 'USR EQ' })).toBeChecked();
			await expect.element(page.getByRole('option', { name: 'Slot A' })).toBeInTheDocument();
			expect(devicePeqStore.eq).toBeUndefined();
		});

		it('keeps the EQ row focusable while the device is busy, and switches nothing', async () => {
			const { spk } = await mountTwoEq();
			spk.currentSlot.mockClear();
			const own = page.getByRole('radio', { name: 'USR EQ' });
			const other = page.getByRole('radio', { name: 'SPK EQ' });
			(own.element() as HTMLElement).focus();

			devicePeqStore.isReading = true;
			await expect.element(own).toHaveAttribute('aria-disabled', 'true');
			await expect.element(other).toHaveAttribute('aria-disabled', 'true');
			expect(document.activeElement).toBe(own.element());

			await other.click({ force: true });
			await expect.element(own).toBeChecked();
			await expect.element(other).not.toBeChecked();
			expect(devicePeqStore.eq).toBeUndefined();
			expect(spk.currentSlot).not.toHaveBeenCalled();
		});

		it('holds back an EQ the device’s current mode lacks, and names it', async () => {
			await mountTwoEq({ spkAbsent: true });

			const spk = page.getByRole('radio', { name: 'SPK EQ' });
			await expect.element(spk).toBeDisabled();
			await expect.element(page.getByRole('radio', { name: 'USR EQ' })).toBeEnabled();
			await expect.element(page.getByRole('radio', { name: 'USR EQ' })).toBeChecked();
			await expect
				.element(page.getByText("Not available in the device's current mode: SPK EQ"))
				.toBeInTheDocument();
		});

		it('shows no EQ row for a device with one EQ', async () => {
			const made = makeConnection();
			connect.connectHid.mockResolvedValue(connected(made.connection));
			await render(DevicePeq);
			await page.getByRole('button', { name: 'Connect USB device' }).click();
			await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
			await expect.element(page.getByRole('combobox', { name: 'Device EQ' })).toBeInTheDocument();

			expect(eqRow().all()).toHaveLength(0);
			expect(page.getByRole('radio').all()).toHaveLength(0);
		});
	});

	describe('one connection at a time', () => {
		beforeEach(() => stubApis('hid', 'serial', 'bluetooth'));

		const connectButton = () => page.getByRole('button', { name: 'Connect USB device' });
		const linkButton = () => page.getByRole('button', { name: 'Link with uniPEQ' });

		/** A link uniPEQ hasn't joined yet, set on the store: starting one would reach the server. */
		function waitingLink() {
			linkStore.phase = 'waiting';
			linkStore.room = 'ABCD2345';
			linkStore.server = 'https://link.unipeq.com';
		}

		it('offers both ways in before either is used', async () => {
			await render(DevicePeq);
			await expect.element(connectButton()).toBeInTheDocument();
			await expect.element(linkButton()).toBeInTheDocument();
		});

		it('hides the link while a device connects here, and once it has', async () => {
			let finish!: (result: ConnectResult) => void;
			connect.connectHid.mockReturnValue(new Promise((resolve) => (finish = resolve)));
			await render(DevicePeq);
			await connectButton().click();
			await expect.element(linkButton()).not.toBeInTheDocument();

			finish(connected(makeConnection().connection));
			await expect.element(page.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
			await expect.element(linkButton()).not.toBeInTheDocument();

			await page.getByRole('button', { name: 'Disconnect' }).click();
			await expect.element(linkButton()).toBeInTheDocument();
		});

		it('hides connecting here while the link is active, and offers it again once it ends', async () => {
			waitingLink();
			await render(DevicePeq);
			await expect.element(page.getByText('ABCD-2345')).toBeInTheDocument();
			await expect.element(connectButton()).not.toBeInTheDocument();

			linkStore.reset();
			await expect.element(connectButton()).toBeInTheDocument();
		});

		it('refuses to connect here while the link is active', async () => {
			waitingLink();
			await devicePeqService.connect('hid');
			expect(connect.connectHid).not.toHaveBeenCalled();
			expect(devicePeqStore.isConnecting).toBe(false);
		});

		it('shows uniPEQ’s device under the link, with Unlink in place of Disconnect', async () => {
			linkStore.phase = 'linked';
			const { connection } = makeConnection({ connectionType: 'link', name: 'Linked DAC' });
			linkStore.device = { name: 'Linked DAC' } as typeof linkStore.device;
			devicePeqStore.setConnected(connection, 1);
			await render(DevicePeq);
			await expect.element(page.getByRole('button', { name: 'Unlink' })).toBeInTheDocument();
			await expect.element(page.getByText('Linked DAC')).toBeInTheDocument();
			await expect.element(page.getByText('Device Setting')).toBeInTheDocument();
			expect(page.getByRole('button', { name: 'Disconnect' }).all()).toHaveLength(0);
			expect(connectButton().all()).toHaveLength(0);
		});
	});

	describe('a device in uniPEQ', () => {
		/** The places the device has room for, under the data's names. */
		const PLACES = [0, 1, 2, 3].map((id) => ({ id, name: `EQ ${id + 1}` }));

		/**
		 * uniPEQ's device as the link carries it (protocol 1.3), with its status mirrored into the
		 * store: on its second preset of `held`, and with the EQs `eqs` where uniPEQ names them
		 * (1.4), and the `status` its device reads. Returns the commands sent to uniPEQ.
		 */
		function linked(
			capabilities: Record<string, unknown>,
			held = ['Jazz', 'Rock'],
			eqs?: ListedEq[],
			status: Partial<LinkStatus> | null = null
		) {
			const command = vi.fn(async (..._args: unknown[]): Promise<CommandResult> => ({ ok: true }));
			const port = { status, command, unlink: vi.fn() } as unknown as LinkPort;
			const device = {
				name: 'Linked DAC',
				kind: 'demo' as const,
				profile: PROFILE,
				profileSource: 'demo' as const,
				profileId: null,
				identity: {},
				capabilities: {
					canRead: true,
					canWrite: true,
					canEnable: true,
					slots: PLACES,
					...capabilities
				}
			};
			const connection = linkConnection(port, device, 3);
			if (!connection) throw new Error('the profile should be usable');
			linkStore.phase = 'linked';
			linkStore.device = device;
			devicePeqStore.setConnected(connection, 1, null, {
				conn: connection,
				eq: OWN_EQ,
				absent: [],
				eqs
			});
			devicePeqStore.setListed(held.map((name, id) => ({ id, name })));
			return command;
		}

		it('offers the EQs uniPEQ names, and picks one through uniPEQ', async () => {
			const command = linked({}, undefined, [
				{ id: undefined, name: 'USR EQ' },
				{ id: 'spk', name: 'SPK EQ' }
			]);
			await render(DevicePeq);

			await expect.element(page.getByRole('radio', { name: 'USR EQ' })).toBeChecked();
			await page.getByRole('radio', { name: 'SPK EQ' }).click();
			await vi.waitFor(() => expect(command).toHaveBeenCalledWith('eq', { id: 'spk' }));
			// The row follows the EQ uniPEQ views, which comes with its next device.
			await expect.element(page.getByRole('radio', { name: 'USR EQ' })).toBeChecked();
		});

		it('offers its EQ on no preset with the EQ off, and turns it back on through uniPEQ', async () => {
			const command = linked({}, undefined, undefined, { deviceSlot: null, unsaved: true });
			// As the link service mirrors a status with `unsaved`.
			devicePeqStore.activeSlot = null;
			devicePeqStore.deviceSlot = 'unsaved';
			devicePeqStore.eqEnabled = true;
			await render(DevicePeq);
			const unsaved = page.getByRole('option', { name: 'Unsaved EQ' });
			await expect.element(unsaved).toBeDisabled();

			devicePeqStore.eqEnabled = false;
			await expect.element(unsaved).toBeEnabled();
			await page.getByRole('combobox', { name: 'Device EQ' }).selectOptions('Unsaved EQ');
			await vi.waitFor(() => expect(command).toHaveBeenCalledWith('switch', { value: 'unsaved' }));
		});

		it('offers its own preset list, and edits it through uniPEQ', async () => {
			const command = linked({ listsSlots: true, editsSlots: true });
			await render(DevicePeq);

			await expect.element(page.getByRole('option', { name: 'Rock' })).toBeInTheDocument();
			const newButton = page.getByRole('button', { name: 'New', exact: true });
			await expect.element(newButton).toBeEnabled();
			await expect.element(page.getByRole('button', { name: 'Rename', exact: true })).toBeEnabled();
			await expect.element(page.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();

			await newButton.click();
			await vi.waitFor(() => expect(command).toHaveBeenCalledWith('preset-create', {}));
		});

		it('shows its settings as uniPEQ reads them, and sets them through uniPEQ', async () => {
			const command = linked({
				controls: [
					{ id: 'feed', name: 'Crossfeed', kind: 'toggle', eq: true },
					{
						id: 'filter',
						name: 'Filter',
						kind: 'choice',
						values: [
							{ value: 0, name: 'Fast' },
							{ value: 1, name: 'Slow' }
						]
					}
				]
			});
			devicePeqStore.controlValues = { feed: 0, filter: 1 };
			await render(DevicePeq);

			const feed = page.getByRole('switch', { name: 'Crossfeed' });
			await expect.element(feed).not.toBeChecked();
			await expect.element(page.getByRole('combobox', { name: 'Filter' })).toHaveValue('1');

			await feed.click();
			await vi.waitFor(() =>
				expect(command).toHaveBeenCalledWith('control', { id: 'feed', value: 1 })
			);
			// The row follows the device: it moves with the value uniPEQ's status reads back.
			await expect.element(feed).not.toBeChecked();
		});
	});
});
