import { describe, it, expect, vi } from 'vitest';
import type { Profile } from '@potatosalad775/eqcaps-core';
import { hardwareProfile } from '#lib/utils/__fixtures__/eq-profiles.js';
import { OWN_EQ, deviceAs, deviceEqs, eqView } from './device-eqs.js';
import type { DeviceConnection, PeqCapabilities, PeqDevice } from './types.js';

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
	slots: [{ id: 0, name: 'Preset 1' }],
	disconnectOnSave: false,
	experimental: false
};

/** A Qudelix-like profile: a 10-band user EQ, and a 20-band headphone EQ it lists. */
function qudelixProfile(): Profile {
	return {
		...hardwareProfile('qudelix-5k', { bandCount: 10 }),
		engine: 'USR EQ',
		device: { brand: 'Qudelix', model: '5K' },
		protocol: {
			handler: 'qudelix-5k',
			presets: [{ id: 0, name: 'Preset 1' }],
			eqs: [{ id: 'spk', name: 'SPK EQ', bandCount: 20, presets: [{ id: 10, name: 'Spk 1' }] }]
		}
	};
}

function fakeDevice(caps: Partial<PeqCapabilities> = {}) {
	return {
		capabilities: { ...CAPS, ...caps },
		pull: vi.fn<PeqDevice['pull']>(async () => ({ filters: [] })),
		push: vi.fn<PeqDevice['push']>(async () => ({ reconnect: false })),
		currentSlot: vi.fn<PeqDevice['currentSlot']>(async () => 0),
		eqEnabled: vi.fn<PeqDevice['eqEnabled']>(async () => null),
		setEnabled: vi.fn<PeqDevice['setEnabled']>(async () => {}),
		close: vi.fn<PeqDevice['close']>(async () => {})
	};
}

const SPK_INFO = {
	id: 'spk',
	name: 'SPK EQ',
	bandCount: 20,
	slots: [{ id: 10, name: 'Spk 1' }],
	perChannel: false
};

/** A device with the two EQs, and the view `eq('spk')` hands back. */
function twoEqDevice(caps: Partial<PeqCapabilities> = {}) {
	const spk = fakeDevice({ slots: [{ id: 10, name: 'Spk 1' }] });
	const eq = vi.fn<NonNullable<PeqDevice['eq']>>(() => spk);
	const device = { ...fakeDevice({ eqs: [SPK_INFO], ...caps }), eq };
	return { device, spk, eq };
}

function connectionOf(
	device: PeqDevice,
	profile: Profile,
	name = 'Qudelix 5K · USR EQ'
): DeviceConnection {
	return {
		device,
		connectionType: 'ble',
		name,
		profile,
		profileSource: 'device',
		profileId: profile.id,
		identity: {}
	};
}

describe('deviceEqs', () => {
	it('lists the profile’s own EQ first, then the ones the bridge drives, by the data’s names', () => {
		const { device } = twoEqDevice();
		const eqs = deviceEqs(connectionOf(device, qudelixProfile()), []);
		expect(eqs).toEqual([
			{ id: undefined, name: 'USR EQ', present: true },
			{ id: 'spk', name: 'SPK EQ', present: true }
		]);
		expect(eqs[0].id).toBeUndefined();
	});

	it('marks an EQ the device’s current mode lacks as not present, and only that one', () => {
		const { device } = twoEqDevice();
		const eqs = deviceEqs(connectionOf(device, qudelixProfile()), ['spk']);
		expect(eqs.map((e) => e.present)).toEqual([true, false]);
		// An id that isn't listed changes nothing.
		const other = deviceEqs(connectionOf(device, qudelixProfile()), ['nope']);
		expect(other.map((e) => e.present)).toEqual([true, true]);
	});

	it('leaves out an EQ the profile lists but the bridge does not drive', () => {
		const device = fakeDevice({ eqs: [] });
		expect(deviceEqs(connectionOf(device, qudelixProfile()), [])).toHaveLength(1);
		expect(deviceEqs(connectionOf(fakeDevice(), qudelixProfile()), [])).toHaveLength(1);
	});

	it('gives one entry for a device with no EQs capability, and no name where the data has none', () => {
		const profile = hardwareProfile('dongle', { bandCount: 4 });
		const eqs = deviceEqs(connectionOf(fakeDevice(), profile, 'Dongle'), []);
		expect(eqs).toEqual([{ id: undefined, name: undefined, present: true }]);
	});

	it('ignores a bridge EQ the profile does not list', () => {
		const { device } = twoEqDevice();
		const profile = hardwareProfile('dongle', { bandCount: 4 });
		expect(deviceEqs(connectionOf(device, profile, 'Dongle'), [])).toHaveLength(1);
	});
});

describe('deviceAs', () => {
	it('is the device itself for the profile’s own EQ', () => {
		const { device, eq } = twoEqDevice();
		expect(deviceAs(device, undefined)).toBe(device);
		expect(eq).not.toHaveBeenCalled();
	});

	it('is the device itself when it has no way to view another EQ', () => {
		const device = fakeDevice();
		expect(deviceAs(device, 'spk')).toBe(device);
	});

	it('is the device viewed as the EQ asked for', () => {
		const { device, spk, eq } = twoEqDevice();
		expect(deviceAs(device, 'spk')).toBe(spk);
		expect(eq).toHaveBeenCalledExactlyOnceWith('spk');
	});
});

describe('eqView', () => {
	it('is the connection itself for the own EQ at the data’s band count', () => {
		const { device } = twoEqDevice();
		const conn = connectionOf(device, qudelixProfile());
		expect(eqView(conn, OWN_EQ)).toBe(conn);
		expect(eqView(conn, { id: undefined, bandCount: null })).toBe(conn);
	});

	it('is a copy with the reported band count for the own EQ', () => {
		const { device } = twoEqDevice();
		const conn = connectionOf(device, qudelixProfile());
		const view = eqView(conn, { id: undefined, bandCount: 20 });
		expect(view).not.toBe(conn);
		expect(view.profile.bandCount).toBe(20);
		expect(view.device).toBe(device);
		expect(view.name).toBe(conn.name);
		// The connection is not edited.
		expect(conn.profile.bandCount).toBe(10);
	});

	it('views a listed EQ through its own profile, device and name', () => {
		const { device, spk, eq } = twoEqDevice();
		const conn = connectionOf(device, qudelixProfile());
		const view = eqView(conn, { id: 'spk', bandCount: null });
		expect(view.profile.bandCount).toBe(20);
		expect(view.profile.engine).toBe('SPK EQ');
		expect(view.profile.protocol?.presets).toEqual([{ id: 10, name: 'Spk 1' }]);
		expect(view.profile.protocol?.eqs).toBeUndefined();
		expect(view.device).toBe(spk);
		expect(eq).toHaveBeenCalledWith('spk');
		expect(view.name).toBe('Qudelix 5K · SPK EQ');
		expect(view.connectionType).toBe(conn.connectionType);
	});

	it('takes a reported band count over the listed EQ’s own', () => {
		const { device } = twoEqDevice();
		const view = eqView(connectionOf(device, qudelixProfile()), { id: 'spk', bandCount: 12 });
		expect(view.profile.bandCount).toBe(12);
	});

	it('keeps a name that came from elsewhere', () => {
		const { device } = twoEqDevice();
		const conn = connectionOf(device, qudelixProfile(), 'My Qudelix');
		expect(eqView(conn, { id: 'spk', bandCount: null }).name).toBe('My Qudelix');
	});

	it('throws for an EQ the profile does not list', () => {
		const { device } = twoEqDevice();
		const conn = connectionOf(device, qudelixProfile());
		expect(() => eqView(conn, { id: 'nope', bandCount: null })).toThrow(/no EQ "nope"/);
	});
});
