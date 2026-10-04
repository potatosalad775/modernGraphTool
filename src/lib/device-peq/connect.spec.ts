/**
 * The connect flows: chooser → `matchDevice` → protocol + profile → an open device.
 *
 * The browser choosers and the eqcaps client are mocked (no permission prompt, no network); the
 * bridge itself is real, so `openDevice` checks each protocol against its transport as it would
 * in the app.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IndexEntry, Profile } from '@potatosalad775/eqcaps-core';
import type { HidTransport, StreamTransport } from '@potatosalad775/eqcaps-device-bridge';
import { hardwareProfile } from '$lib/utils/__fixtures__/eq-profiles.js';

const browser = vi.hoisted(() => ({
	requestHidDevice: vi.fn(),
	requestSerialPort: vi.fn(),
	requestBleDevice: vi.fn(),
	grantedHidDevice: vi.fn()
}));
vi.mock('@potatosalad775/eqcaps-device-bridge/browser', () => browser);

const client = vi.hoisted(() => ({
	loadIndex: vi.fn(),
	loadProfile: vi.fn(),
	matchDevice: vi.fn()
}));
vi.mock('$lib/services/eqcaps-client.js', () => ({ eqcapsClient: () => client }));

const { connectHid, connectSerial, guessedProfile } = await import('./connect.js');

function hid(vendorId: number, productId: number, productName: string): HidTransport {
	return {
		kind: 'hid',
		vendorId,
		productId,
		productName,
		collections: [],
		sendReport: vi.fn(async () => {}),
		sendFeatureReport: vi.fn(async () => {}),
		receiveFeatureReport: vi.fn(async () => new Uint8Array()),
		onInputReport: () => () => {},
		close: vi.fn(async () => {})
	};
}

function entry(id: string, extra: Partial<IndexEntry> = {}): IndexEntry {
	return {
		id,
		kind: 'hardware',
		brand: 'Spec',
		model: id,
		status: 'draft',
		path: `profiles/${id}.json`,
		sha256: '',
		bytes: 0,
		protocol: { handler: 'walkplay-hid' },
		...extra
	};
}

const match = (e: IndexEntry, specificity = 3, group = false) => ({
	id: e.id,
	specificity,
	group,
	entry: e
});

beforeEach(() => {
	vi.clearAllMocks();
	client.loadIndex.mockResolvedValue({ profiles: [] });
	client.loadProfile.mockImplementation(async (id: string): Promise<Profile> =>
		hardwareProfile(id, { bandCount: 8 })
	);
});

describe('connectHid', () => {
	it('is cancelled when the chooser is closed', async () => {
		browser.requestHidDevice.mockResolvedValue(null);
		expect(await connectHid()).toEqual({ kind: 'cancelled' });
	});

	it('drives a matched device with its profile’s protocol and limits', async () => {
		const e = entry('crinear-protocol-micro');
		browser.requestHidDevice.mockResolvedValue(hid(0x3302, 0xc20f, 'Protocol Micro'));
		client.matchDevice.mockResolvedValue({ best: match(e), matches: [match(e)], ambiguous: false });

		const result = await connectHid();
		expect(result.kind).toBe('connected');
		if (result.kind !== 'connected') return;
		expect(result.connection.name).toBe('Spec crinear-protocol-micro');
		expect(result.connection.profileSource).toBe('device');
		expect(result.connection.profileId).toBe('crinear-protocol-micro');
		expect(result.connection.profile.bandCount).toBe(8);
		expect(result.connection.connectionType).toBe('hid');
		expect(result.connection.device.capabilities.canWrite).toBe(true);
		expect(client.matchDevice).toHaveBeenCalledWith({
			usb: { vendorId: '0x3302', productId: '0xc20f', productName: 'Protocol Micro' }
		});
	});

	it('says a group match is one', async () => {
		const e = entry('walkplay-schemeno16-devices', { group: true });
		browser.requestHidDevice.mockResolvedValue(hid(0x3302, 0x1234, 'Dongle'));
		client.matchDevice.mockResolvedValue({
			best: match(e, 3, true),
			matches: [match(e, 3, true)],
			ambiguous: false
		});
		const result = await connectHid();
		expect(result.kind === 'connected' && result.connection.profileSource).toBe('group');
	});

	it('asks which device it is when the match is a tie, then connects the pick', async () => {
		const a = entry('model-a');
		const b = entry('model-b');
		browser.requestHidDevice.mockResolvedValue(hid(0x3302, 0x1, 'Twin'));
		client.matchDevice.mockResolvedValue({
			best: null,
			matches: [match(a), match(b)],
			ambiguous: true
		});

		const result = await connectHid();
		expect(result.kind).toBe('choose');
		if (result.kind !== 'choose') return;
		expect(result.candidates.map((c) => c.id)).toEqual(['model-a', 'model-b']);
		const done = await result.finish('model-b');
		expect(done.kind === 'connected' && done.connection.profileId).toBe('model-b');
	});

	it('guesses a known vendor’s protocol, with limits from what it can carry', async () => {
		browser.requestHidDevice.mockResolvedValue(hid(0x3302, 0x9999, 'Mystery DSP '));
		client.matchDevice.mockResolvedValue({ best: null, matches: [], ambiguous: false });

		const result = await connectHid();
		expect(result.kind).toBe('connected');
		if (result.kind !== 'connected') return;
		expect(result.connection.profileSource).toBe('guess');
		expect(result.connection.name).toBe('Mystery DSP');
		expect(result.connection.device.capabilities.experimental).toBe(true);
		expect(result.connection.profile.bandCount).toBeGreaterThan(0);
	});

	it('closes the device and reports it unsupported when nothing can drive it', async () => {
		const t = hid(0x1234, 0x5678, 'Keyboard');
		browser.requestHidDevice.mockResolvedValue(t);
		client.matchDevice.mockResolvedValue({ best: null, matches: [], ambiguous: false });

		const result = await connectHid();
		expect(result.kind).toBe('unsupported');
		expect(t.close).toHaveBeenCalled();
	});

	it('drives the device on its protocol’s own limits when the profile can’t be fetched', async () => {
		const e = entry('offline-profile');
		browser.requestHidDevice.mockResolvedValue(hid(0x3302, 0x2, 'X'));
		client.matchDevice.mockResolvedValue({ best: match(e), matches: [match(e)], ambiguous: false });
		client.loadProfile.mockResolvedValue(null);
		const result = await connectHid();
		expect(result.kind === 'connected' && result.connection.profileSource).toBe('guess');
	});

	it('finds the same device again without the chooser', async () => {
		const e = entry('crinear-protocol-micro');
		browser.requestHidDevice.mockResolvedValue(hid(0x3302, 0xc20f, 'Protocol Micro'));
		client.matchDevice.mockResolvedValue({ best: match(e), matches: [match(e)], ambiguous: false });
		const result = await connectHid();
		if (result.kind !== 'connected') throw new Error('expected a connection');

		browser.grantedHidDevice.mockResolvedValue(hid(0x3302, 0xc20f, 'Protocol Micro'));
		const again = await result.connection.reopen?.();
		expect(again?.profileId).toBe('crinear-protocol-micro');
		expect(browser.grantedHidDevice).toHaveBeenCalledWith({
			vendorId: 0x3302,
			productId: 0xc20f,
			productName: 'Protocol Micro'
		});
	});
});

describe('connectSerial', () => {
	it('asks which device an unmatched port is, offering only serial-driven profiles', async () => {
		const serialEntry = entry('jds-labs-element-iv', {
			protocol: { handler: 'jds-labs-usb-serial' }
		});
		const hidEntry = entry('hid-only');
		client.loadIndex.mockResolvedValue({ profiles: [serialEntry, hidEntry] });
		client.matchDevice.mockResolvedValue({ best: null, matches: [], ambiguous: false });
		const stream: StreamTransport = {
			kind: 'serial',
			write: vi.fn(async () => {}),
			read: vi.fn(async () => null),
			close: vi.fn(async () => {})
		};
		const open = vi.fn(async () => stream);
		browser.requestSerialPort.mockResolvedValue({ identity: {}, port: {}, open });

		const result = await connectSerial();
		expect(result.kind).toBe('choose');
		if (result.kind !== 'choose') return;
		expect(result.candidates.map((c) => c.id)).toEqual(['jds-labs-element-iv']);
		const done = await result.finish('jds-labs-element-iv');
		expect(done.kind).toBe('connected');
		expect(open).toHaveBeenCalledWith({ handler: 'jds-labs-usb-serial' });
	});
});

describe('guessedProfile', () => {
	it('takes band count, types and domains from the protocol’s write frames', () => {
		const p = guessedProfile({ handler: 'walkplay-hid' }, 'Dongle');
		expect(p.kind).toBe('hardware');
		expect(p.meta.status).toBe('draft');
		expect(p.band.types?.every((t) => ['PK', 'LSC', 'HSC'].includes(t))).toBe(true);
		expect(p.bandCount).toBeGreaterThan(0);
	});
});
