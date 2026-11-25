import { describe, expect, it, vi } from 'vitest';
import type { CommandResult, LinkStatus } from 'peq-link/client';
import type { EQFilter } from '#lib/utils/equalizer.js';
import { describeDeviceError } from './errors.js';
import {
	acceptCapabilities,
	acceptProfile,
	fromLinkFilters,
	fromLinkLists,
	linkConnection,
	LinkCommandError,
	linkOps,
	LinkPeqDevice,
	sendLosses,
	toLinkFilters,
	toLinkLists,
	type LinkLists,
	type LinkPort
} from './link.js';

const pk = (freq: number, gain: number, extra: Partial<EQFilter> = {}): EQFilter => ({
	enabled: true,
	type: 'PK',
	freq,
	q: 1,
	gain,
	...extra
});
/** A peak as the link carries it. */
const wire = (freq: number, gain: number) => ({ type: 'PK', freq, q: 1, gain });

const PROFILE = {
	schemaVersion: '1.0',
	id: 'test-dac',
	kind: 'hardware',
	device: { brand: 'Test', model: 'DAC' },
	bandCount: 5,
	band: {
		types: ['PK', 'LSC', 'HSC'],
		freq: { min: 20, max: 20000 },
		q: { min: 0.1, max: 10 },
		gain: { min: -12, max: 12 }
	},
	preamp: { mode: 'manual', gain: { min: -12, max: 0 } },
	meta: { status: 'draft', sources: [] }
};

describe('band lists', () => {
	it('sends shared, complete bands, a switched-off one flat', () => {
		const list: EQFilter[] = [
			pk(100, 3),
			pk(200, 4, { enabled: false }),
			pk(300, 5, { channel: 'L' }),
			{ ...pk(400, 0), q: null },
			{ enabled: false, type: 'NO', freq: 500, q: 4, gain: 0 },
			{ enabled: true, type: 'LSQ', freq: 105, q: 0.7, gain: 2 }
		];
		expect(toLinkFilters(list)).toEqual([
			{ type: 'PK', freq: 100, q: 1, gain: 3 },
			{ type: 'PK', freq: 200, q: 1, gain: 0 },
			{ type: 'LSC', freq: 105, q: 0.7, gain: 2 }
		]);
		expect(sendLosses(list, false)).toEqual({ flattened: 1, dropped: 2 });
	});

	it('sends an ear the shared bands and its own, in list order', () => {
		const list: EQFilter[] = [
			pk(300, 5, { channel: 'L' }),
			pk(100, 3),
			pk(400, 6, { channel: 'R' }),
			pk(200, 4, { enabled: false })
		];
		expect(toLinkFilters(list, 'L')).toEqual([wire(300, 5), wire(100, 3), wire(200, 0)]);
		expect(toLinkFilters(list, 'R')).toEqual([wire(100, 3), wire(400, 6), wire(200, 0)]);
		expect(toLinkLists(list, false)).toEqual({ left: [wire(100, 3), wire(200, 0)], right: null });
		expect(toLinkLists(list, true)).toEqual({
			left: toLinkFilters(list, 'L'),
			right: toLinkFilters(list, 'R')
		});
	});

	it('counts one-ear bands as kept when uniPEQ’s device takes them', () => {
		const list = [pk(100, 3, { channel: 'L' }), pk(200, 4, { enabled: false, channel: 'R' })];
		expect(sendLosses(list, false)).toEqual({ flattened: 0, dropped: 2 });
		expect(sendLosses(list, true)).toEqual({ flattened: 1, dropped: 0 });
	});

	it('reads uniPEQ’s two lists slot by slot: alike is shared, the rest each ear’s, in place', () => {
		const lists = {
			left: [wire(100, 3), wire(200, 4), wire(300, 5)],
			right: [wire(100, 3), wire(250, 4)]
		};
		expect(fromLinkLists(lists)).toEqual([
			pk(100, 3),
			pk(200, 4, { channel: 'L' }),
			pk(250, 4, { channel: 'R' }),
			pk(300, 5, { channel: 'L' })
		]);
		expect(fromLinkLists({ left: lists.left, right: null })).toEqual([
			pk(100, 3),
			pk(200, 4),
			pk(300, 5)
		]);
	});

	it('gives back the lists it read, apart or not, of any lengths', () => {
		const shelf = { type: 'LSC', freq: 105, q: 0.7, gain: 2 };
		const pass = { type: 'HPQ', freq: 30, q: 0.7, gain: 0 };
		const cases: LinkLists[] = [
			{ left: [wire(100, 3), wire(200, 4)], right: null },
			{ left: [], right: null },
			{ left: [], right: [] },
			{ left: [wire(100, 3)], right: [wire(100, 3)] },
			{ left: [wire(200, 4), wire(100, 3)], right: [wire(250, 4), wire(100, 3)] },
			{ left: [wire(100, 3), shelf], right: [pass, wire(100, 3), wire(300, -2)] },
			{ left: [shelf, wire(200, 4), wire(300, 5), pass], right: [shelf] },
			{ left: [], right: [wire(800, 2)] }
		];
		for (const lists of cases) {
			expect(toLinkLists(fromLinkLists(lists), lists.right !== null)).toEqual(lists);
		}
	});

	it('reads the link as app bands, dropping types it has no row for', () => {
		expect(
			fromLinkFilters([
				{ type: 'HSC', freq: 8000, q: 0.7, gain: -2 },
				{ type: 'x-vendor', freq: 1000, q: 1, gain: 0 },
				{ type: 'HPQ', freq: 30, q: 0.7, gain: 5 }
			])
		).toEqual([
			{ enabled: true, type: 'HSQ', freq: 8000, q: 0.7, gain: -2 },
			{ enabled: true, type: 'HPQ', freq: 30, q: 0.7, gain: 0 }
		]);
	});

	it('sends one changed band as a band op, and anything bigger as the whole list', () => {
		const a = toLinkFilters([pk(100, 1), pk(200, 2), pk(300, 3)]);
		expect(linkOps(a, a)).toEqual([]);
		const one = toLinkFilters([pk(100, 1), pk(250, 2), pk(300, 3)]);
		expect(linkOps(a, one)).toEqual([{ op: 'band', i: 1, filter: one[1] }]);
		const two = toLinkFilters([pk(100, 9), pk(250, 2), pk(300, 3)]);
		expect(linkOps(a, two)).toEqual([{ op: 'list', filters: two }]);
		const shorter = a.slice(0, 2);
		expect(linkOps(a, shorter)).toEqual([{ op: 'list', filters: shorter }]);
	});
});

describe('what uniPEQ says about its device', () => {
	it('takes a usable profile and refuses a broken one', () => {
		expect(acceptProfile(PROFILE)).toBe(PROFILE);
		expect(acceptProfile(null)).toBeNull();
		expect(acceptProfile({ ...PROFILE, band: undefined })).toBeNull();
		expect(acceptProfile({ ...PROFILE, bandCount: -1 })).toBeNull();
		expect(
			acceptProfile({ ...PROFILE, band: { ...PROFILE.band, freq: { min: 500, max: 20 } } })
		).toBeNull();
	});

	it('reads missing or malformed capabilities as "can\'t"', () => {
		const caps = acceptCapabilities({
			canRead: true,
			canWrite: 'yes',
			slots: [
				{ id: 1, name: 'P1', writable: true },
				{ id: 'x' },
				{ id: 2, name: 'Jazz', writable: 'yes' },
				{ id: 9, name: 'Off', bypass: true }
			]
		});
		expect(caps.canRead).toBe(true);
		expect(caps.canWrite).toBe(false);
		expect(caps.slots).toEqual([
			{ id: 1, name: 'P1', writable: true },
			{ id: 2, name: 'Jazz' },
			{ id: 9, name: 'Off', bypass: true }
		]);
		expect(acceptCapabilities(undefined).slots).toEqual([]);
	});

	it('builds a link connection, or none when the profile is unusable', () => {
		const port = fakePort();
		const device = {
			name: 'Test DAC',
			kind: 'demo' as const,
			profile: PROFILE,
			profileSource: 'demo' as const,
			profileId: null,
			identity: null,
			capabilities: { canRead: true }
		};
		const conn = linkConnection(port, device);
		expect(conn).toMatchObject({ connectionType: 'link', name: 'Test DAC', profileSource: 'demo' });
		expect(conn?.device).toBeInstanceOf(LinkPeqDevice);
		expect(linkConnection(port, { ...device, profile: {} })).toBeNull();
	});
});

function fakePort(status: Partial<LinkStatus> | null = null) {
	const command = vi.fn(async (): Promise<CommandResult> => ({ ok: true }));
	const port = { status, command, unlink: vi.fn() } as unknown as LinkPort & {
		command: typeof command;
		unlink: ReturnType<typeof vi.fn>;
	};
	return port;
}

describe('LinkPeqDevice', () => {
	it('turns each device action into uniPEQ’s command', async () => {
		const port = fakePort({ deviceSlot: 2, eqEnabled: false });
		const device = new LinkPeqDevice(port, acceptCapabilities({}));
		await device.pull();
		await device.setEnabled(true, 3);
		await device.setEnabled(true);
		await device.setEnabled(false);
		await device.write();
		await device.review(7, false);
		await device.setAutoWrite(true);
		await device.reconnect();
		expect(port.command.mock.calls).toEqual([
			['read'],
			['switch', { value: 'p3' }],
			['switch', { value: 'on' }],
			['switch', { value: 'off' }],
			['write'],
			['review', { rev: 7, accept: false }],
			['auto-write', { on: true }],
			['reconnect']
		]);
		expect(await device.currentSlot()).toBe(2);
		expect(await device.eqEnabled()).toBe(false);
		await device.close();
		expect(port.unlink).toHaveBeenCalledOnce();
	});

	it('fails with uniPEQ’s code, which reads like the bridge’s', async () => {
		const port = fakePort();
		port.command.mockResolvedValueOnce({ ok: false, code: 'timeout' });
		const device = new LinkPeqDevice(port, acceptCapabilities({}));
		const error = await device.write().catch((e: unknown) => e);
		expect(error).toBeInstanceOf(LinkCommandError);
		expect(describeDeviceError(error)).toBe(describeDeviceError(new LinkCommandError('timeout')));
		expect(describeDeviceError(error)).not.toBe(describeDeviceError(new Error('x')));
		await expect(device.push()).rejects.toThrow();
	});
});
