import { describe, expect, it, vi } from 'vitest';
import type {
	Channel,
	CommandResult,
	PlanChange as LinkPlanChange,
	LinkStatus
} from 'peq-link/client';
import { EQ_CHANNEL_SCOPES, filtersInScope } from '#lib/utils/eq-channel.js';
import type { EQFilter } from '#lib/utils/equalizer.js';
import { describeDeviceError } from './errors.js';
import { drivesChannelsApart } from './push-plan.js';
import {
	acceptAbsentEqs,
	acceptCapabilities,
	acceptControlValues,
	acceptEqs,
	acceptProfile,
	carriesEars,
	fromLinkFilters,
	fromLinkLists,
	linkConnection,
	LinkCommandError,
	linkEdit,
	linkOps,
	LinkPeqDevice,
	reviewChanges,
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

	it('sends an ear the shared bands and its own, each shared band in one slot in both', () => {
		const list: EQFilter[] = [
			pk(300, 5, { channel: 'L' }),
			pk(100, 3),
			pk(400, 6, { channel: 'R' }),
			pk(200, 4, { enabled: false })
		];
		// The L band waits for an R band to share a slot with, so 100 Hz is slot 0 in both.
		expect(toLinkLists(list, true)).toEqual({
			left: [wire(100, 3), wire(300, 5), wire(200, 0)],
			right: [wire(100, 3), wire(400, 6), wire(200, 0)]
		});
		expect(toLinkLists(list, false)).toEqual({ left: [wire(100, 3), wire(200, 0)], right: null });
	});

	it('keeps every band in its bucket through uniPEQ and back', () => {
		const L = (freq: number, gain: number) => pk(freq, gain, { channel: 'L' });
		const R = (freq: number, gain: number) => pk(freq, gain, { channel: 'R' });
		const buckets = (list: EQFilter[]) => EQ_CHANNEL_SCOPES.map((s) => filtersInScope(list, s));
		const cases: EQFilter[][] = [
			[pk(100, 3), L(200, 4), pk(300, 5)],
			[L(200, 4), pk(100, 3), R(250, 1), R(260, 2), pk(300, 5), L(210, -1)],
			[pk(100, 3), L(200, 4), L(210, 1), R(250, 2), pk(300, 5), R(260, 3), R(270, 4)],
			[R(250, 2), R(260, 3), pk(100, 3)]
		];
		for (const list of cases) {
			const lists = toLinkLists(list, true);
			const back = fromLinkLists(lists);
			expect(buckets(back)).toEqual(buckets(list));
			expect(toLinkLists(back, true)).toEqual(lists);
		}
	});

	it('counts only one-ear bands the link carries as setting the ears apart', () => {
		const blank: EQFilter = {
			enabled: true,
			type: 'PK',
			freq: null,
			q: null,
			gain: null,
			channel: 'L'
		};
		const notch: EQFilter = { enabled: false, type: 'NO', freq: 500, q: 4, gain: 0, channel: 'R' };
		expect(carriesEars([pk(100, 3), blank, notch])).toBe(false);
		expect(carriesEars([pk(100, 3), pk(200, 4, { channel: 'L', enabled: false })])).toBe(true);
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
		expect(linkOps(a, one, 'right')).toEqual([{ op: 'band', i: 1, filter: one[1], ch: 'right' }]);
		expect(linkOps(a, shorter, 'left')).toEqual([{ op: 'list', filters: shorter, ch: 'left' }]);
	});
});

describe('edits across uniPEQ’s channels', () => {
	const a = [wire(100, 3), wire(200, 4)];
	const b = [wire(100, 3), wire(200, 5)];
	const ear = [wire(800, 2)];

	it('edits the one list as before while the channels are joined', () => {
		expect(linkEdit({ left: a, right: null }, { left: b, right: null })).toEqual([
			{ op: 'band', i: 1, filter: wire(200, 5) }
		]);
		expect(linkEdit({ left: a, right: null }, { left: a, right: null })).toEqual([]);
	});

	it('sets the channels apart, then edits each from the left list it starts as', () => {
		expect(linkEdit({ left: a, right: null }, { left: a, right: [...a, ...ear] })).toEqual([
			{ op: 'channels', apart: true },
			{ op: 'list', filters: [...a, ...ear], ch: 'right' }
		]);
		expect(linkEdit({ left: a, right: null }, { left: b, right: a })).toEqual([
			{ op: 'channels', apart: true },
			{ op: 'band', i: 1, filter: wire(200, 5), ch: 'left' }
		]);
	});

	it('joins the channels on the left list, then edits it', () => {
		expect(linkEdit({ left: a, right: ear }, { left: b, right: null })).toEqual([
			{ op: 'channels', apart: false },
			{ op: 'band', i: 1, filter: wire(200, 5) }
		]);
		expect(linkEdit({ left: a, right: ear }, { left: a, right: null })).toEqual([
			{ op: 'channels', apart: false }
		]);
	});

	it('sends an edit both channels get alike once, for both; any other per channel', () => {
		const before = { left: [wire(100, 3), wire(300, 1)], right: [wire(100, 3), wire(900, -1)] };
		const shared = { left: [wire(100, 6), wire(300, 1)], right: [wire(100, 6), wire(900, -1)] };
		expect(linkEdit(before, shared)).toEqual([{ op: 'band', i: 0, filter: wire(100, 6) }]);
		const left = { left: [wire(100, 3), wire(300, 2)], right: before.right };
		expect(linkEdit(before, left)).toEqual([
			{ op: 'band', i: 1, filter: wire(300, 2), ch: 'left' }
		]);
		const added = { left: [...before.left, ...ear], right: [...before.right, ...ear] };
		expect(linkEdit(before, added)).toEqual([
			{ op: 'list', filters: added.left, ch: 'left' },
			{ op: 'list', filters: added.right, ch: 'right' }
		]);
		expect(linkEdit(before, before)).toEqual([]);
	});
});

describe('uniPEQ’s write review', () => {
	const gain = (band: number, extra: { channel?: Channel; ear?: 'L' | 'R' } = {}) => ({
		kind: 'field' as const,
		band,
		field: 'gain' as const,
		wanted: 5,
		written: 4.5,
		...extra
	});
	const preamp = (wanted: number, extra: { channel?: Channel; ear?: 'L' | 'R' } = {}) => ({
		kind: 'preamp' as const,
		wanted,
		written: -5,
		...extra
	});

	it('numbers each channel’s bands as this list does, and says a change both carry once', () => {
		// uniPEQ's left [A, B, C] and right [A, D, C].
		const list = [
			pk(100, 3),
			pk(200, 4, { channel: 'L' }),
			pk(250, 4, { channel: 'R' }),
			pk(300, 5)
		];
		const changes: LinkPlanChange[] = [
			gain(1, { channel: 'left' }),
			{ kind: 'dropped', band: 2, channel: 'left' },
			preamp(-6, { channel: 'left' }),
			gain(1, { channel: 'right' }),
			gain(3, { channel: 'right' }),
			preamp(-7, { channel: 'right' })
		];
		expect(reviewChanges(changes, list)).toEqual([
			gain(1),
			{ kind: 'dropped', band: 2, ear: 'L' },
			preamp(-6, { ear: 'L' }),
			gain(4, { ear: 'R' }),
			preamp(-7, { ear: 'R' })
		]);
		const alike = [preamp(-6, { channel: 'left' }), preamp(-6, { channel: 'right' })];
		expect(reviewChanges(alike, list)).toEqual([preamp(-6)]);
	});

	it('numbers past the bands the link leaves out while the channels are joined', () => {
		const blank: EQFilter = { enabled: true, type: 'PK', freq: null, q: null, gain: null };
		expect(reviewChanges([gain(2), preamp(-6)], [blank, pk(100, 3), pk(200, 4)])).toEqual([
			gain(3),
			preamp(-6)
		]);
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
		const caps = acceptCapabilities(
			{
				canRead: true,
				canWrite: 'yes',
				slots: [
					{ id: 1, name: 'P1', writable: true },
					{ id: 'x' },
					{ id: 2, name: 'Jazz', writable: 'yes' },
					{ id: 9, name: 'Off', bypass: true },
					// The rows are keyed by id: the first of each stands.
					{ id: 2, name: 'Rock' }
				],
				perChannel: 'yes',
				listsSlots: 1,
				editsSlots: 'true'
			},
			3
		);
		expect(caps.canRead).toBe(true);
		expect(caps.canWrite).toBe(false);
		expect(caps.perChannel).toBe(false);
		expect(caps.listsSlots).toBe(false);
		expect(caps.editsSlots).toBe(false);
		expect(caps.slots).toEqual([
			{ id: 1, name: 'P1', writable: true },
			{ id: 2, name: 'Jazz' },
			{ id: 9, name: 'Off', bypass: true }
		]);
		expect(acceptCapabilities(undefined, 3).slots).toEqual([]);
	});

	it('takes one-ear writes, the preset list and the settings from protocol 1.3 on, and nothing else it added', () => {
		const gain = { id: 'gain', name: 'Gain', kind: 'range', range: { min: -12, max: 0, step: 6 } };
		const value = {
			perChannel: true,
			controls: [gain],
			eqs: [{ id: 'spk', label: 'SPK' }],
			listsSlots: true,
			editsSlots: true,
			readsBandCount: true
		};
		const caps = acceptCapabilities(value, 3);
		expect(caps.perChannel).toBe(true);
		expect(caps.listsSlots).toBe(true);
		expect(caps.editsSlots).toBe(true);
		expect(caps.controls).toEqual([gain]);
		expect(caps).not.toHaveProperty('eqs');
		expect(caps).not.toHaveProperty('readsBandCount');
		// A uniPEQ before 1.3 sends none of these: an older peer says nothing of the device.
		expect(acceptCapabilities(value, 2)).toMatchObject({
			perChannel: false,
			listsSlots: false,
			editsSlots: false,
			controls: []
		});
	});

	it('leaves out a setting it can’t show, and a value that is neither a number nor none', () => {
		const shown = [
			{ id: 'feed', name: 'Feed', kind: 'toggle', eq: true },
			{ id: 'spk', name: 'SPK feed', kind: 'toggle', eq: 'spk', disablesEq: [1] },
			{ id: 'filter', name: 'Filter', kind: 'choice', values: [{ value: 0, name: 'Fast' }] },
			{
				id: 'gain',
				name: 'Gain',
				kind: 'range',
				role: 'output-gain',
				unit: 'dB',
				range: { min: -12, max: 0 },
				reconnect: true
			}
		];
		const malformed = [
			null,
			{ name: 'No id', kind: 'toggle' },
			{ id: 'knob', name: 'Knob', kind: 'knob' },
			{ id: 'bare', name: 'No values', kind: 'choice' },
			{ id: 'mode', name: 'Mode', kind: 'choice', values: [{ value: '0', name: 'Fast' }] },
			{ id: 'level', name: 'No bounds', kind: 'range', range: { min: 0 } },
			{ id: 'bound', name: 'Bound', kind: 'toggle', eq: false },
			{ id: 'off', name: 'Off', kind: 'toggle', disablesEq: 1 },
			{ id: 'usb', name: 'USB', kind: 'toggle', reconnect: 'yes' },
			{
				id: 'twice',
				name: 'Twice',
				kind: 'choice',
				values: [
					{ value: 0, name: 'Fast' },
					{ value: 0, name: 'Slow' }
				]
			}
		];
		// The rows are keyed by id: the first of each stands.
		const repeated = { id: 'feed', name: 'Feed again', kind: 'toggle' };
		expect(
			acceptCapabilities({ controls: [...malformed, ...shown, repeated] }, 3).controls
		).toEqual(shown);
		expect(acceptCapabilities({ controls: 'gain' }, 3).controls).toEqual([]);

		expect(acceptControlValues({ gain: -6, feed: null, filter: '1', spk: true })).toEqual({
			gain: -6,
			feed: null
		});
		expect(acceptControlValues(null)).toEqual({});
	});

	it('names the device’s EQs, its own first and once, and knows none from anything else', () => {
		const own = { id: null, name: 'USR EQ' };
		expect(acceptEqs([own, { id: 'spk', name: null }])).toEqual([
			{ id: undefined, name: 'USR EQ' },
			{ id: 'spk', name: undefined }
		]);
		expect(acceptEqs([{ id: null, name: null }])).toEqual([{ id: undefined, name: undefined }]);

		const malformed = [
			// A uniPEQ before protocol 1.4 sends none.
			undefined,
			'spk',
			[],
			[{ id: 'spk', name: 'SPK EQ' }],
			[{ id: 'spk', name: 'SPK EQ' }, own],
			[own, { id: null, name: 'Again' }],
			[own, { id: 'spk', name: 'SPK EQ' }, { id: 'spk', name: 'Again' }],
			[own, { id: 7, name: 'SPK EQ' }],
			[own, { id: 'spk', name: 5 }],
			[own, { id: 'spk' }],
			[own, null]
		];
		for (const value of malformed) expect(acceptEqs(value)).toBeNull();

		expect(acceptAbsentEqs(['spk', 3, null])).toEqual(['spk']);
		expect(acceptAbsentEqs('spk')).toEqual([]);
		expect(acceptAbsentEqs(undefined)).toEqual([]);
	});

	it('drives a linked device’s channels apart only where uniPEQ knows protocol 1.3', () => {
		const device = {
			name: 'Test DAC',
			kind: 'demo' as const,
			profile: { ...PROFILE, channels: 'independent' },
			profileSource: 'demo' as const,
			profileId: null,
			identity: null,
			capabilities: { canRead: true, perChannel: true }
		};
		const apart = (minor: number) => {
			const conn = linkConnection(fakePort(), device, minor);
			return !!conn && drivesChannelsApart(conn.profile, conn.device.capabilities);
		};
		expect(apart(3)).toBe(true);
		expect(apart(2)).toBe(false);
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
		const conn = linkConnection(port, device, 3);
		expect(conn).toMatchObject({ connectionType: 'link', name: 'Test DAC', profileSource: 'demo' });
		expect(conn?.device).toBeInstanceOf(LinkPeqDevice);
		expect(linkConnection(port, { ...device, profile: {} }, 3)).toBeNull();
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
		const device = new LinkPeqDevice(port, acceptCapabilities({}, 3));
		await device.pull();
		await device.setEnabled(true, 3);
		await device.setEnabled(true);
		await device.setEnabled(false);
		await device.write();
		await device.review(7, false);
		await device.setAutoWrite(true);
		await device.reconnect();
		await device.createPreset();
		await device.renamePreset(2, 'Jazz');
		await device.deletePreset(1);
		await device.setControl('gain', -6);
		await device.selectEq('spk');
		await device.selectEq(undefined);
		expect(port.command.mock.calls).toEqual([
			['read'],
			['switch', { value: 'p3' }],
			['switch', { value: 'on' }],
			['switch', { value: 'off' }],
			['write'],
			['review', { rev: 7, accept: false }],
			['auto-write', { on: true }],
			['reconnect'],
			['preset-create', {}],
			['preset-rename', { slot: 2, name: 'Jazz' }],
			['preset-delete', { slot: 1 }],
			['control', { id: 'gain', value: -6 }],
			['eq', { id: 'spk' }],
			['eq', { id: null }]
		]);
		expect(await device.currentSlot()).toBe(2);
		expect(await device.eqEnabled()).toBe(false);
		await device.close();
		expect(port.unlink).toHaveBeenCalledOnce();
	});

	it('turns uniPEQ’s device on as it was while it is on no preset', async () => {
		const port = fakePort({ deviceSlot: null, unsaved: true });
		const device = new LinkPeqDevice(port, acceptCapabilities({}, 3));
		await device.setEnabled(true);
		await device.setEnabled(true, 3);
		expect(port.command.mock.calls).toEqual([
			['switch', { value: 'unsaved' }],
			['switch', { value: 'p3' }]
		]);
	});

	it('fails with uniPEQ’s code, which reads like the bridge’s', async () => {
		const port = fakePort();
		port.command.mockResolvedValueOnce({ ok: false, code: 'timeout' });
		const device = new LinkPeqDevice(port, acceptCapabilities({}, 3));
		const error = await device.write().catch((e: unknown) => e);
		expect(error).toBeInstanceOf(LinkCommandError);
		expect(describeDeviceError(error)).toBe(describeDeviceError(new LinkCommandError('timeout')));
		expect(describeDeviceError(error)).not.toBe(describeDeviceError(new Error('x')));
		await expect(device.push()).rejects.toThrow();
	});
});
