import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import type {
	Adopt,
	CommandResult,
	EditOp,
	HostOptions,
	LinkEq,
	LinkSlot,
	LinkStatus
} from 'peq-link/client';
import { linkService } from './link-service.svelte.js';
import { devicePeqService } from './device-peq-service.svelte.js';
import { linkStore } from '#lib/stores/link-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
import { eqConstraintsStore } from '#lib/stores/eq-constraints-store.svelte.js';
import { BUILTIN_PRESETS, DEFAULT_CONSTRAINT_ID } from '#lib/stores/eq-constraints-store.svelte.js';
import { commandHistory } from './command-history.svelte.js';
import { eqCommands } from './eq-commands.js';
import { eqCurve } from './eq-curve.svelte.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import * as m from '#lib/paraglide/messages.js';
import { toast } from './toast.js';
import type { EQFilter } from '#lib/utils/equalizer.js';
import type { DeviceConnection } from '#lib/device-peq/types.js';

/** `HostLink` as far as the service uses it, driven by the test. */
class FakeHost {
	state = 'waiting';
	room = 'ABCD2345';
	server = 'https://link.unipeq.com';
	status: LinkStatus | null = null;
	/** The session's protocol minor: 3 is a uniPEQ that knows both channels. */
	minor = 3;
	readonly launch = 'TESTTOKEN2345678';
	launchedHere = false;
	readonly options: HostOptions;
	readonly edit = vi.fn();
	readonly replaceAll = vi.fn();
	readonly command = vi.fn(async (..._args: unknown[]): Promise<CommandResult> => ({ ok: true }));
	readonly unlink = vi.fn(() => this.end('unlink'));
	#listeners = new Map<string, ((value: unknown) => void)[]>();
	#raw: ((message: unknown) => void)[] = [];
	readonly session = {
		on: (_type: 'message', listener: (message: unknown) => void) => {
			this.#raw.push(listener);
			return () => {};
		}
	};
	#rev = 0;

	constructor(options: HostOptions) {
		this.options = options;
	}

	on(type: string, listener: (value: unknown) => void) {
		this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
		return () => {};
	}

	emit(type: string, value?: unknown) {
		for (const listener of this.#listeners.get(type) ?? []) listener(value);
	}

	setState(state: string) {
		this.state = state;
		this.emit('state', state);
	}

	/** Leaves the next command unanswered until the returned `answer`, as uniPEQ while it works. */
	hold(): (result?: CommandResult) => void {
		let answer = (_: CommandResult) => {};
		this.command.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
		return (result = { ok: true }) => answer(result);
	}

	/** uniPEQ's one list for both channels. */
	eq(
		filters: LinkEq['filters'],
		extra: Partial<Adopt> = {},
		preamp: Pick<LinkEq, 'preamp' | 'autoPreamp'> = { preamp: -2, autoPreamp: true }
	) {
		this.send({ filters, ...preamp }, extra);
	}

	/**
	 * uniPEQ's `eq`, as the client hands it on: an `eq` event only when it differs from this
	 * page's list (`eqEqual`, the right channel included), and the raw message either way.
	 */
	send(eq: LinkEq, extra: Partial<Adopt> = {}) {
		const rev = ++this.#rev;
		const key = ({ filters, preamp, autoPreamp, right }: LinkEq) =>
			JSON.stringify([
				filters,
				preamp,
				autoPreamp,
				right && [right.filters, right.preamp, right.autoPreamp]
			]);
		if (key(eq) !== key(this.options.local())) {
			this.emit('eq', { eq, rev, by: 'unipeq', fresh: false, initial: rev === 1, ...extra });
		}
		for (const listener of this.#raw) listener({ t: 'eq', rev, ack: 0, by: 'unipeq', eq });
	}

	end(reason: string) {
		this.setState('ended');
		this.emit('ended', { reason, by: 'self' });
	}
}

let host: FakeHost;

vi.mock('peq-link/client', () => ({
	startHost: (options: HostOptions) => (host = new FakeHost(options)),
	resumeHost: () => null
}));

const pk = (freq: number, gain: number): EQFilter => ({
	enabled: true,
	type: 'PK',
	freq,
	q: 1,
	gain
});
const wire = (freq: number, gain: number) => ({ type: 'PK', freq, q: 1, gain });

const STATUS: LinkStatus = {
	connected: true,
	knownDevice: 'Test DAC',
	editable: true,
	activeSlot: null,
	deviceSlot: null,
	eqEnabled: true,
	busy: null,
	inSync: true,
	unwritten: false,
	needsReconnect: false,
	auto: { on: true, pending: false, paused: false, stopped: false, clipRisk: false },
	failure: null,
	review: null
};

const DEVICE = {
	name: 'Test DAC',
	kind: 'demo' as const,
	profile: {
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
	},
	profileSource: 'demo' as const,
	profileId: null,
	identity: null,
	capabilities: { canRead: true, canWrite: true, slots: [] }
};

/** A device whose EQ has a filter set per channel, which uniPEQ writes apart (protocol 1.3). */
const STEREO = {
	...DEVICE,
	name: 'Stereo DAC',
	profile: { ...DEVICE.profile, channels: 'independent' },
	capabilities: { ...DEVICE.capabilities, perChannel: true }
};

/** Starts a link and has uniPEQ approve it, on protocol minor `minor`. */
async function linked(minor = 3): Promise<FakeHost> {
	await linkService.start();
	host.minor = minor;
	host.setState('linked');
	return host;
}

/** uniPEQ's EQ with its channels apart. */
function apart(
	left: LinkEq['filters'],
	right: LinkEq['filters'],
	preamp: { left: number; right: number; auto?: boolean } = { left: -2, right: -2 }
): LinkEq {
	const autoPreamp = preamp.auto ?? true;
	return {
		filters: left,
		preamp: preamp.left,
		autoPreamp,
		right: { filters: right, preamp: preamp.right, autoPreamp }
	};
}

/** Every op sent to uniPEQ so far. */
function sentOps(): EditOp[] {
	return host.edit.mock.calls.flatMap(([ops]) => ops as EditOp[]);
}

describe('linkService', () => {
	beforeEach(() => {
		eqStore.filters = [];
		eqStore.isEnabled = false;
		eqStore.channelScope = 'BOTH';
		commandHistory.clear();
		frStore.entries.clear();
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		devicePeqStore.setDisconnected();
		linkStore.reset();
	});

	afterEach(() => {
		if (linkStore.active) host.end('unlink');
		flushSync();
	});

	it('shows the room until uniPEQ joins', async () => {
		await linkService.start();
		expect(linkStore.phase).toBe('waiting');
		expect(linkStore.room).toBe('ABCD2345');
		expect(host.options.server).toBe('https://link.unipeq.com');
	});

	it('offers the launch token, and says uniPEQ was opened here once its hello echoes it', async () => {
		await linkService.start();
		expect(linkStore.launch).toBe(host.launch);
		host.emit('hello', { version: '1.4.0' });
		expect(linkStore.launchedHere).toBe(false);
		host.launchedHere = true;
		host.emit('hello', { version: '1.4.0' });
		expect(linkStore.launchedHere).toBe(true);
		expect(linkStore.unipeqVersion).toBe('1.4.0');
	});

	it('takes uniPEQ’s list without asking when this one is empty, and sends nothing back', async () => {
		await linked();
		host.eq([wire(100, 3), wire(1000, -2)]);
		flushSync();
		expect(linkStore.choice).toBeNull();
		expect(eqStore.filters).toEqual([pk(100, 3), pk(1000, -2)]);
		expect(eqStore.isEnabled).toBe(true);
		expect(host.edit).not.toHaveBeenCalled();
	});

	it('asks which list to keep when they differ, and keeps uniPEQ’s on request', async () => {
		eqStore.filters = [
			pk(200, 1),
			{ ...pk(300, 2), enabled: false },
			{ ...pk(400, 3), channel: 'L' }
		];
		await linked();
		host.eq([wire(100, 3)]);
		flushSync();
		expect(linkStore.choice).toEqual({ theirs: 1, flattened: 1, dropped: 1 });
		expect(eqStore.filters).toHaveLength(3);

		linkService.choose('theirs');
		flushSync();
		expect(linkStore.choice).toBeNull();
		expect(eqStore.filters).toEqual([pk(100, 3)]);
		expect(host.edit).not.toHaveBeenCalled();
		expect(host.replaceAll).not.toHaveBeenCalled();
		// One undo step back to this page's list.
		commandHistory.undo(frStore);
		expect(eqStore.filters).toHaveLength(3);
	});

	it('sends this page’s list, as uniPEQ can hold it, on request', async () => {
		eqStore.filters = [
			pk(200, 1),
			{ ...pk(300, 2), enabled: false },
			{ ...pk(400, 3), channel: 'R' }
		];
		await linked();
		host.eq([wire(100, 3)]);
		linkService.choose('mine');
		flushSync();
		expect(eqStore.filters).toEqual([pk(200, 1), pk(300, 0)]);
		expect(host.replaceAll).toHaveBeenCalledWith({
			filters: [wire(200, 1), wire(300, 0)],
			preamp: eqStore.preamp,
			autoPreamp: true
		});
		expect(host.edit).not.toHaveBeenCalled();
	});

	it('joins without asking when the first list is already the same', async () => {
		eqStore.filters = [pk(100, 3)];
		await linked();
		host.eq([wire(100, 3)]);
		eqCommands.addBand(pk(2000, 1));
		flushSync();
		expect(linkStore.choice).toBeNull();
		expect(host.edit).toHaveBeenCalledWith(
			[{ op: 'list', filters: [wire(100, 3), wire(2000, 1)] }],
			expect.objectContaining({ settle: true })
		);
	});

	it('sends a drag as band ops in one burst, and settles when it lands', async () => {
		await linked();
		host.eq([wire(100, 3), wire(1000, -2)]);
		flushSync();

		eqCommands.updateBand(1, { gain: -4 });
		flushSync();
		eqCommands.updateBand(1, { gain: -5 });
		flushSync();
		eqCommands.flushBand(1);
		flushSync();

		const calls = host.edit.mock.calls;
		expect(calls).toHaveLength(3);
		const burst = calls[0][1].burst;
		expect(burst).toEqual(expect.any(String));
		expect(calls[0]).toEqual([[{ op: 'band', i: 1, filter: wire(1000, -4) }], { burst }]);
		expect(calls[1]).toEqual([[{ op: 'band', i: 1, filter: wire(1000, -5) }], { burst }]);
		expect(calls[2]).toEqual([[], { burst, settle: true }]);
	});

	it('folds a burst of uniPEQ’s edits into one undo step', async () => {
		await linked();
		host.eq([wire(100, 3)]);
		host.eq([wire(100, 4)], { burst: 'u1' });
		host.eq([wire(100, 5)], { burst: 'u1' });
		flushSync();
		expect(eqStore.filters).toEqual([pk(100, 5)]);
		commandHistory.undo(frStore);
		expect(eqStore.filters).toEqual([pk(100, 3)]);
		expect(host.edit).toHaveBeenCalledTimes(0);
	});

	it('clears undo at a fresh list: undoing past it would hand the device other bands', async () => {
		await linked();
		host.eq([wire(100, 3)]);
		host.eq([wire(500, 1)], { fresh: true, by: 'device' });
		flushSync();
		expect(eqStore.filters).toEqual([pk(500, 1)]);
		expect(commandHistory.canUndo).toBe(false);
	});

	it('mirrors uniPEQ’s device and status into Hardware EQ', async () => {
		await linked();
		host.status = { ...STATUS, busy: 'write', inSync: false };
		host.emit('device', DEVICE);
		host.emit('status', host.status);
		expect(devicePeqStore.connection?.connectionType).toBe('link');
		expect(devicePeqStore.connection?.name).toBe('Test DAC');
		expect(eqConstraintsStore.maxBands).toBe(5);
		expect(devicePeqStore.isWriting).toBe(true);
		expect(devicePeqStore.inSync).toBe(false);

		host.emit('status', { ...STATUS, failure: { op: 'write', code: 'timeout' } });
		expect(devicePeqStore.statusIsError).toBe(true);
		host.emit('status', STATUS);
		expect(devicePeqStore.statusIsError).toBe(false);

		host.emit('device', null);
		expect(devicePeqStore.connection).toBeNull();
		expect(linkStore.device).toBeNull();
	});

	it('shows uniPEQ’s device on no preset as Unsaved EQ, which Read and Write reach', async () => {
		await linked();
		const presets = [
			{ id: 0, name: 'A' },
			{ id: 1, name: 'B' }
		];
		host.status = { ...STATUS, unsaved: true };
		host.emit('device', {
			...DEVICE,
			capabilities: { ...DEVICE.capabilities, canEnable: true, slots: presets }
		});
		expect(devicePeqStore.selection).toBe('unsaved');
		expect(devicePeqStore.readTarget).toEqual({});

		host.emit('status', { ...STATUS, activeSlot: 1, deviceSlot: 1 });
		expect(devicePeqStore.selection).toBe(1);
	});

	it('doesn’t start while a device is connected or connecting here', async () => {
		devicePeqStore.connection = { connectionType: 'hid', name: 'Local DAC' } as DeviceConnection;
		await linkService.start();
		expect(linkStore.phase).toBe('idle');
		devicePeqStore.connection = null;

		devicePeqStore.isConnecting = true;
		await linkService.start();
		expect(linkStore.phase).toBe('idle');
		devicePeqStore.isConnecting = false;
	});

	it('plays uniPEQ’s fixed preamp whatever the bands do, and turns Auto back on through the link', async () => {
		eqCurve.installSync();
		await linked();
		host.eq([wire(100, 3)], {}, { preamp: -5, autoPreamp: false });
		flushSync();
		expect(eqStore.preamp).toBe(-5);
		eqCommands.addBand(pk(2000, 6));
		flushSync();
		expect(eqStore.preamp).toBe(-5);

		linkService.autoPreamp();
		expect(host.edit).toHaveBeenLastCalledWith([{ op: 'auto-preamp', on: true }], { settle: true });
	});

	it('takes uniPEQ’s Auto value for the list it came with, and derives its own after an edit', async () => {
		eqCurve.installSync();
		await linked();
		// uniPEQ's Auto on a 1 dB grid: -4, where this page would derive -3.
		host.eq([wire(100, 3)], {}, { preamp: -4, autoPreamp: true });
		flushSync();
		expect(eqStore.preamp).toBe(-4);
		eqCommands.addBand(pk(2000, 6));
		flushSync();
		expect(eqStore.preamp).toBeLessThanOrEqual(-6);
	});

	it('drops the device and stops sending when the link ends', async () => {
		await linked();
		host.eq([wire(100, 3)]);
		host.emit('device', DEVICE);
		linkService.unlink();
		flushSync();
		expect(linkStore.ended).toEqual({ reason: 'unlink', by: 'self' });
		expect(devicePeqStore.connection).toBeNull();
		eqCommands.addBand(pk(2000, 1));
		flushSync();
		expect(host.edit).not.toHaveBeenCalled();
	});

	describe('with uniPEQ’s device driving its channels apart', () => {
		const left = (freq: number, gain: number): EQFilter => ({ ...pk(freq, gain), channel: 'L' });
		const right = (freq: number, gain: number): EQFilter => ({ ...pk(freq, gain), channel: 'R' });

		it('takes uniPEQ’s two lists as one-ear bands in slot order, and plays the lower preamp', async () => {
			eqCurve.installSync();
			await linked();
			host.emit('device', STEREO);
			host.send(
				apart([wire(100, 3), wire(200, 4), wire(300, 5)], [wire(100, 3), wire(250, 4)], {
					left: -5,
					right: -7
				})
			);
			flushSync();
			expect(eqStore.filters).toEqual([pk(100, 3), left(200, 4), right(250, 4), left(300, 5)]);
			expect(eqStore.preamp).toBe(-7);
			expect(host.edit).not.toHaveBeenCalled();
		});

		it('sends a shared band’s edit once, for both channels', async () => {
			await linked();
			host.emit('device', STEREO);
			host.send(apart([wire(100, 3), wire(200, 4)], [wire(100, 3), wire(250, 4)]));
			flushSync();
			eqCommands.updateBand(0, { gain: 6 });
			flushSync();
			expect(sentOps()).toEqual([{ op: 'band', i: 0, filter: wire(100, 6) }]);
		});

		it('sets the channels apart for a one-ear band, and joins them when it goes', async () => {
			await linked();
			host.emit('device', STEREO);
			host.eq([wire(100, 3)]);
			flushSync();

			eqCommands.addBand(left(2000, 1));
			flushSync();
			expect(sentOps()).toEqual([
				{ op: 'channels', apart: true },
				{ op: 'list', filters: [wire(100, 3), wire(2000, 1)], ch: 'left' }
			]);

			host.edit.mockClear();
			eqCommands.removeBand(1);
			flushSync();
			expect(sentOps()).toEqual([
				{ op: 'channels', apart: false },
				{ op: 'list', filters: [wire(100, 3)] }
			]);
		});

		it('leaves uniPEQ’s channels apart when its user set them so, both alike', async () => {
			await linked();
			host.emit('device', STEREO);
			host.send(apart([wire(100, 3)], [wire(100, 3)]));
			flushSync();
			expect(eqStore.filters).toEqual([pk(100, 3)]);
			eqCommands.updateBand(0, { gain: 5 });
			flushSync();
			expect(sentOps()).toEqual([{ op: 'band', i: 0, filter: wire(100, 5) }]);
			expect(host.options.local().right?.filters).toEqual([wire(100, 5)]);
		});

		it('tells a resync the channels are apart exactly when uniPEQ’s are', async () => {
			await linked();
			host.emit('device', STEREO);
			host.eq([wire(100, 3)]);
			flushSync();
			expect(host.options.local()).not.toHaveProperty('right');

			const eq = apart([wire(100, 3), wire(300, 2)], [wire(100, 3)], {
				left: -4,
				right: -6,
				auto: false
			});
			host.send(eq);
			flushSync();
			// What uniPEQ holds, preamps included, so its echo is no change.
			expect(host.options.local()).toEqual(eq);

			eqCommands.removeBand(1);
			flushSync();
			expect(host.options.local()).not.toHaveProperty('right');
		});

		it('drops its one-ear bands when uniPEQ’s user joins the channels', async () => {
			await linked();
			host.emit('device', STEREO);
			host.send(apart([wire(100, 3), wire(2000, 1)], [wire(100, 3)]));
			flushSync();
			expect(eqStore.filters).toEqual([pk(100, 3), left(2000, 1)]);

			// Both, keeping the right channel.
			host.eq([wire(100, 3)]);
			flushSync();
			expect(eqStore.filters).toEqual([pk(100, 3)]);

			eqCommands.updateBand(0, { gain: 5 });
			flushSync();
			expect(sentOps()).toEqual([{ op: 'band', i: 0, filter: wire(100, 5) }]);
		});

		it('asks at the start when the lists differ only by one-ear bands, and sends them apart', async () => {
			eqStore.filters = [pk(100, 3), left(2000, 1)];
			await linked();
			host.emit('device', STEREO);
			// The preamp alike too, so only the one-ear band tells the lists apart.
			host.eq([wire(100, 3)], {}, { preamp: eqStore.preamp, autoPreamp: true });
			flushSync();
			expect(linkStore.choice).toEqual({ theirs: 1, flattened: 0, dropped: 0 });

			linkService.choose('mine');
			flushSync();
			// With `right`, the client sends `channels apart: true` and a list per channel.
			expect(host.replaceAll).toHaveBeenCalledWith({
				filters: [wire(100, 3), wire(2000, 1)],
				preamp: eqStore.preamp,
				autoPreamp: true,
				right: { filters: [wire(100, 3)], preamp: eqStore.preamp, autoPreamp: true }
			});
			expect(host.edit).not.toHaveBeenCalled();
		});

		it('keeps a shared band added after a one-ear band shared through uniPEQ’s echo', async () => {
			await linked();
			host.emit('device', STEREO);
			host.send(apart([wire(100, 3), wire(300, 2)], [wire(100, 3)]));
			flushSync();
			eqCommands.addBand(pk(2000, 1));
			flushSync();
			// Both lists hold the new band in slot 1, where uniPEQ reads it back as one band.
			expect(sentOps()).toEqual([
				{ op: 'list', filters: [wire(100, 3), wire(2000, 1), wire(300, 2)], ch: 'left' },
				{ op: 'list', filters: [wire(100, 3), wire(2000, 1)], ch: 'right' }
			]);

			// uniPEQ snaps it to its device and echoes both lists.
			host.send(
				apart([wire(100, 3), wire(2000, 1.5), wire(300, 2)], [wire(100, 3), wire(2000, 1.5)])
			);
			flushSync();
			expect(eqStore.filters).toEqual([pk(100, 3), pk(2000, 1.5), left(300, 2)]);
		});

		it('keeps uniPEQ’s channels joined for an empty one-ear band, added and removed', async () => {
			await linked();
			host.emit('device', STEREO);
			host.eq([wire(100, 3)]);
			flushSync();
			eqCommands.addBand({ ...pk(0, 0), freq: null, q: null, gain: null, channel: 'L' });
			flushSync();
			eqCommands.removeBand(1);
			flushSync();
			expect(sentOps()).toEqual([]);
			expect(host.options.local()).not.toHaveProperty('right');
		});

		it('says again what Send leaves out when uniPEQ’s device changes under the start dialog', async () => {
			eqStore.filters = [pk(200, 1), left(400, 3)];
			await linked();
			host.eq([wire(100, 3)]);
			flushSync();
			expect(linkStore.choice).toEqual({ theirs: 1, flattened: 0, dropped: 1 });
			host.emit('device', STEREO);
			expect(linkStore.choice).toEqual({ theirs: 1, flattened: 0, dropped: 0 });
			host.emit('device', null);
			expect(linkStore.choice).toEqual({ theirs: 1, flattened: 0, dropped: 1 });
		});

		it('sends nothing per channel to a uniPEQ before protocol 1.3', async () => {
			await linked(2);
			host.emit('device', STEREO);
			host.eq([wire(100, 3)]);
			flushSync();
			eqStore.channelScope = 'L';
			expect(eqStore.channelScopeLocked).toBe(true);
			expect(eqStore.channelScope).toBe('BOTH');

			eqCommands.addBand(left(2000, 1));
			eqCommands.updateBand(0, { gain: 5 });
			eqCommands.flushBand(0);
			flushSync();
			expect(sentOps()).toEqual([{ op: 'band', i: 0, filter: wire(100, 5) }]);
			expect(host.options.local()).toEqual({
				filters: [wire(100, 5)],
				preamp: -2,
				autoPreamp: true
			});
		});
	});

	describe('with one-ear bands and no device in uniPEQ to take them', () => {
		const left = (freq: number, gain: number): EQFilter => ({ ...pk(freq, gain), channel: 'L' });

		it('asks at the start even when the shared bands are uniPEQ’s', async () => {
			eqStore.filters = [pk(100, 3), left(400, 3)];
			await linked();
			host.eq([wire(100, 3)], {}, { preamp: eqStore.preamp, autoPreamp: true });
			flushSync();
			expect(linkStore.choice).toEqual({ theirs: 1, flattened: 0, dropped: 1 });
		});

		it('asks at the start when this list holds nothing else, which Send would leave empty', async () => {
			eqStore.filters = [left(400, 3)];
			await linked();
			host.eq([wire(100, 3)]);
			flushSync();
			expect(linkStore.choice).toEqual({ theirs: 1, flattened: 0, dropped: 1 });
			expect(eqStore.filters).toEqual([left(400, 3)]);
		});

		it('asks again when an undo brings them back, rather than hiding them', async () => {
			eqStore.filters = [pk(200, 1), left(400, 3)];
			await linked();
			host.eq([wire(100, 3)]);
			linkService.choose('theirs');
			flushSync();
			expect(eqStore.filters).toEqual([pk(100, 3)]);

			commandHistory.undo(frStore);
			flushSync();
			expect(linkStore.choice).toEqual({ theirs: 1, flattened: 0, dropped: 1 });
			expect(host.edit).not.toHaveBeenCalled();

			linkService.choose('theirs');
			flushSync();
			expect(eqStore.filters).toEqual([pk(100, 3)]);
			expect(host.edit).not.toHaveBeenCalled();
			expect(host.replaceAll).not.toHaveBeenCalled();
		});
	});

	it('opens the band list on L+R once the first list settles', async () => {
		eqStore.channelScope = 'R';
		await linked();
		host.emit('device', STEREO);
		expect(eqStore.channelScope).toBe('R');
		host.eq([wire(100, 3)]);
		flushSync();
		expect(eqStore.channelScope).toBe('BOTH');
	});

	describe('with uniPEQ’s device keeping its presets as a list', () => {
		/** The places the device has room for, under the data's names: four. */
		const PLACES = [0, 1, 2, 3].map((id) => ({ id, name: `EQ ${id + 1}` }));
		const LISTING = {
			...DEVICE,
			capabilities: {
				...DEVICE.capabilities,
				canEnable: true,
				slots: PLACES,
				listsSlots: true,
				editsSlots: true
			}
		};
		/** Presets as the device holds them: their ids are their places. */
		const held = (...names: string[]) => names.map((name, id) => ({ id, name }));
		const names = () => devicePeqStore.slots.map((s) => s.name);
		/** uniPEQ's status with the device on preset `on` of `slots`. */
		const listed = (on: number, slots: LinkSlot[]): LinkStatus => ({
			...STATUS,
			activeSlot: on,
			deviceSlot: on,
			slots
		});

		/** uniPEQ's status, then its device: either may come first. */
		async function listing(status = listed(1, held('Jazz', 'Rock', 'Pop'))) {
			await linked();
			host.status = status;
			host.emit('status', status);
			host.emit('device', LISTING);
		}

		it('shows the presets uniPEQ’s status lists, under the device’s own names', async () => {
			await listing();
			expect(devicePeqStore.slots).toEqual(held('Jazz', 'Rock', 'Pop'));
			expect(devicePeqStore.selection).toBe(1);
			expect(devicePeqStore.canEditPresets).toBe(true);
			expect(devicePeqStore.slotRoom).toBe(4);
		});

		it('takes the ids from the status after a delete moves the later ones down', async () => {
			await listing(listed(2, held('Jazz', 'Rock', 'Pop')));
			host.emit('status', listed(1, held('Rock', 'Pop')));
			expect(devicePeqStore.slots).toEqual(held('Rock', 'Pop'));
			expect(devicePeqStore.selection).toBe(1);
		});

		it('leaves out a preset it can’t read', async () => {
			const slots = [
				{ id: 0, name: 'Jazz' },
				{ id: 'x', name: 'Bad' },
				{ id: 1, name: 'Rock', writable: 'yes', bypass: false }
			] as unknown as LinkSlot[];
			await listing(listed(0, slots));
			expect(devicePeqStore.slots).toEqual(held('Jazz', 'Rock'));
		});

		it('falls back to the profile’s presets, with no editing, when the status lists none', async () => {
			await listing();
			host.emit('status', { ...STATUS, activeSlot: 0, deviceSlot: 0 });
			expect(names()).toEqual(['EQ 1', 'EQ 2', 'EQ 3', 'EQ 4']);
			expect(devicePeqStore.canEditPresets).toBe(false);
		});

		it('offers no preset switch while uniPEQ edits the list', async () => {
			await listing();
			const status = listed(1, held('Jazz', 'Rock', 'Pop'));
			host.emit('status', { ...status, busy: 'preset' });
			expect(devicePeqStore.isSwitching).toBe(true);
			host.emit('status', status);
			expect(devicePeqStore.isBusy).toBe(false);
		});

		it('renames by command, and shows the name the status brings, before or after the answer', async () => {
			await listing();
			host.command.mockImplementationOnce(async () => {
				host.emit('status', listed(1, held('Jazz', 'Metal', 'Pop')));
				return { ok: true };
			});
			expect(await devicePeqService.renamePreset(1, 'Metal')).toBe('done');
			expect(host.command).toHaveBeenLastCalledWith('preset-rename', { slot: 1, name: 'Metal' });
			expect(names()).toEqual(['Jazz', 'Metal', 'Pop']);

			// Answered first: the list stays as uniPEQ last said until its status.
			expect(await devicePeqService.renamePreset(1, 'Blues')).toBe('done');
			expect(names()).toEqual(['Jazz', 'Metal', 'Pop']);
			host.emit('status', listed(1, held('Jazz', 'Blues', 'Pop')));
			expect(names()).toEqual(['Jazz', 'Blues', 'Pop']);
		});

		it('says a name the device can’t store once, quietly, before or after the status', async () => {
			await listing();
			const status = listed(1, held('Jazz', 'Rock', 'Pop'));
			// uniPEQ's Rename says it in its status too.
			const refusal = { ...status, failure: { op: 'preset', code: 'invalid-request' } };
			const error = vi.spyOn(toast, 'error').mockImplementation(() => '' as never);
			try {
				host.command.mockImplementationOnce(async () => {
					host.emit('status', refusal);
					return { ok: false, code: 'invalid-request' };
				});
				expect(await devicePeqService.renamePreset(1, 'Far too long')).toBe('refused');
				expect(devicePeqStore.statusMessage).toBe(m.device_presets_name_refused());

				host.emit('status', status);
				host.command.mockResolvedValueOnce({ ok: false, code: 'invalid-request' });
				expect(await devicePeqService.renamePreset(1, 'Far too long')).toBe('refused');
				host.emit('status', refusal);
				expect(devicePeqStore.statusMessage).toBe(m.device_presets_name_refused());
				expect(error).not.toHaveBeenCalled();
			} finally {
				error.mockRestore();
			}
		});

		it('says nothing of a delete uniPEQ answers: it may still be asking its volume warning', async () => {
			await listing();
			devicePeqStore.setStatus(null);
			await devicePeqService.deletePreset(2);
			expect(host.command).toHaveBeenLastCalledWith('preset-delete', { slot: 2 });
			expect(devicePeqStore.statusMessage).toBeNull();
			expect(names()).toEqual(['Jazz', 'Rock', 'Pop']);
		});

		it('leaves where the device is to the status after a Device EQ pick', async () => {
			await listing();
			devicePeqStore.setStatus('Renamed the preset.');
			// uniPEQ answers while its volume warning is up, its device still on preset 1.
			host.command.mockImplementationOnce(async () => {
				host.emit('status', { ...listed(1, held('Jazz', 'Rock', 'Pop')), consent: true });
				return { ok: true };
			});
			await devicePeqService.choose('p2');
			expect(host.command).toHaveBeenLastCalledWith('switch', { value: 'p2' });
			expect(devicePeqStore.deviceSlot).toBe(1);
			expect(devicePeqStore.activeSlot).toBe(1);
			expect(devicePeqStore.statusMessage).toBe('Renamed the preset.');

			host.emit('status', listed(2, held('Jazz', 'Rock', 'Pop')));
			expect(devicePeqStore.deviceSlot).toBe(2);
			expect(devicePeqStore.activeSlot).toBe(2);
		});
	});

	describe('with uniPEQ’s device having settings of its own', () => {
		const FEED = { id: 'feed', name: 'Feed', kind: 'toggle', eq: true };
		const GAIN = {
			id: 'gain',
			name: 'Gain',
			kind: 'range',
			role: 'output-gain',
			unit: 'dB',
			range: { min: -12, max: 0, step: 6 }
		};
		const SETTINGS = {
			...DEVICE,
			capabilities: { ...DEVICE.capabilities, controls: [FEED, GAIN] }
		};
		const ids = (controls: { id: string }[]) => controls.map((c) => c.id);

		/** uniPEQ's device, then its status reading `controls`. */
		async function withSettings(controls: Record<string, number | null>) {
			await linked();
			host.emit('device', SETTINGS);
			host.status = { ...STATUS, controls };
			host.emit('status', host.status);
		}

		it('shows the settings uniPEQ’s status reads, and none the device lacks now', async () => {
			await withSettings({ feed: 1, gain: null });
			expect(devicePeqStore.controlValues).toEqual({ feed: 1, gain: null });
			expect(ids(devicePeqStore.eqControls)).toEqual(['feed']);
			expect(devicePeqStore.deviceControls).toEqual([]);

			host.emit('status', { ...STATUS, controls: { feed: 0, gain: -6 } });
			expect(devicePeqStore.controlValues).toEqual({ feed: 0, gain: -6 });
			expect(ids(devicePeqStore.deviceControls)).toEqual(['gain']);
		});

		it('holds them while uniPEQ changes one', async () => {
			await withSettings({ feed: 1, gain: 0 });
			host.emit('status', { ...STATUS, controls: { feed: 1, gain: 0 }, busy: 'control' });
			expect(devicePeqStore.isSettingControl).toBe(true);
			host.emit('status', { ...STATUS, controls: { feed: 1, gain: 0 } });
			expect(devicePeqStore.isBusy).toBe(false);
		});

		it('sets one by command, and shows the value the status reads back, after the answer', async () => {
			await withSettings({ feed: 1, gain: 0 });

			await devicePeqService.setControl('gain', -6);
			expect(host.command).toHaveBeenLastCalledWith('control', { id: 'gain', value: -6 });
			expect(devicePeqStore.controlValues).toEqual({ feed: 1, gain: 0 });

			host.emit('status', { ...STATUS, controls: { feed: 1, gain: -6 } });
			expect(devicePeqStore.controlValues).toEqual({ feed: 1, gain: -6 });
		});
	});

	describe('with uniPEQ’s device having more than one EQ', () => {
		/** A Qudelix as uniPEQ views it: its user EQ, with both EQs by name (protocol 1.4). */
		const QUDELIX = {
			...DEVICE,
			name: 'Qudelix 5K · USR EQ',
			profile: { ...DEVICE.profile, engine: 'USR EQ' },
			profileId: 'qudelix-5k',
			eq: null,
			eqs: [
				{ id: null, name: 'USR EQ' },
				{ id: 'spk', name: 'SPK EQ' }
			]
		};
		/** The same device after the `eq` command: uniPEQ names the view for its EQ. */
		const SPK = {
			...QUDELIX,
			name: 'Qudelix 5K · SPK EQ',
			profile: { ...DEVICE.profile, engine: 'SPK EQ' },
			eq: 'spk'
		};

		beforeEach(() => (devicePeqStore.audioPathChoice = null));
		afterEach(() => (devicePeqStore.audioPathChoice = null));

		it('lists the EQs by name, with the one uniPEQ views', async () => {
			await linked(4);
			host.emit('device', SPK);
			expect(devicePeqStore.eqs).toEqual([
				{ id: undefined, name: 'USR EQ', present: true },
				{ id: 'spk', name: 'SPK EQ', present: true }
			]);
			expect(devicePeqStore.eq).toBe('spk');
		});

		it('marks one absent as uniPEQ’s status says, and moves nothing else', async () => {
			await linked(4);
			host.emit('device', QUDELIX);
			const connection = devicePeqStore.connection;
			devicePeqStore.setStatus('Renamed the preset.');

			host.emit('status', { ...STATUS, absentEqs: ['spk'] });
			expect(devicePeqStore.eqs.map((e) => e.present)).toEqual([true, false]);
			expect(devicePeqStore.connection).toBe(connection);
			expect(devicePeqStore.statusMessage).toBe('Renamed the preset.');

			host.emit('status', STATUS);
			expect(devicePeqStore.eqs.map((e) => e.present)).toEqual([true, true]);
		});

		it('views the EQ uniPEQ picked, with its settings, from a uniPEQ that names none', async () => {
			const feed = { id: 'feed', name: 'Feed', kind: 'toggle', eq: true };
			const spkFeed = { id: 'spkfeed', name: 'Spk feed', kind: 'toggle', eq: 'spk' };
			await linked(3);
			host.emit('device', {
				...SPK,
				eqs: undefined,
				capabilities: { ...DEVICE.capabilities, controls: [feed, spkFeed] }
			});
			host.emit('status', { ...STATUS, controls: { feed: 1, spkfeed: 0 } });

			expect(devicePeqStore.eqs).toHaveLength(1);
			expect(devicePeqStore.eq).toBe('spk');
			expect(devicePeqStore.eqControls.map((c) => c.id)).toEqual(['spkfeed']);
		});

		it('asks uniPEQ to view another EQ, and follows the device and fresh list it sends', async () => {
			await linked(4);
			host.eq([wire(100, 3)]);
			host.emit('device', QUDELIX);
			host.command.mockImplementationOnce(async () => {
				host.emit('device', SPK);
				host.eq([wire(500, 1)], { fresh: true, by: 'device' });
				return { ok: true };
			});

			await devicePeqService.selectEq('spk');
			flushSync();

			expect(host.command).toHaveBeenCalledExactlyOnceWith('eq', { id: 'spk' });
			expect(devicePeqStore.eq).toBe('spk');
			expect(devicePeqStore.connection?.name).toBe('Qudelix 5K · SPK EQ');
			expect(eqStore.filters).toEqual([pk(500, 1)]);
			expect(commandHistory.canUndo).toBe(false);
		});

		it('keeps the answer on where this page’s sound plays when uniPEQ views another EQ', async () => {
			await linked(4);
			host.emit('device', QUDELIX);
			expect(devicePeqStore.audioThroughDevice).toBe(false);
			devicePeqStore.setAudioThroughDevice(true);

			host.emit('device', SPK);
			expect(devicePeqStore.connection?.name).toBe('Qudelix 5K · SPK EQ');
			expect(devicePeqStore.audioThroughDevice).toBe(true);
		});

		it('asks again for another device under a profile many products share', async () => {
			const dongle = { ...DEVICE, name: 'Dongle A', profileSource: 'group', profileId: 'walkplay' };
			await linked(4);
			host.emit('device', dongle);
			devicePeqStore.setAudioThroughDevice(true);
			expect(devicePeqStore.audioThroughDevice).toBe(true);

			host.emit('device', { ...dongle, name: 'Dongle B' });
			expect(devicePeqStore.audioThroughDevice).toBe(false);
		});
	});

	describe('holding Hardware EQ busy until uniPEQ answers', () => {
		/** A device with presets uniPEQ lists and edits, on preset 1 of three. */
		const PRESETS = {
			...DEVICE,
			capabilities: {
				...DEVICE.capabilities,
				canEnable: true,
				slots: [0, 1, 2, 3].map((id) => ({ id, name: `EQ ${id + 1}` })),
				listsSlots: true,
				editsSlots: true,
				controls: [{ id: 'feed', name: 'Feed', kind: 'toggle' }]
			}
		};
		const ON_1: LinkStatus = {
			...STATUS,
			activeSlot: 1,
			deviceSlot: 1,
			slots: ['Jazz', 'Rock', 'Pop'].map((name, id) => ({ id, name })),
			controls: { feed: 0 }
		};

		async function withPresets() {
			await linked();
			host.status = ON_1;
			host.emit('status', ON_1);
			host.emit('device', PRESETS);
		}

		/** uniPEQ's status running through `busy`, then `null` while it still works on the command. */
		function busyThenIdle(...busy: LinkStatus['busy'][]) {
			for (const kind of [...busy, null]) host.emit('status', { ...ON_1, busy: kind });
		}

		it('follows uniPEQ’s busy alone while this page awaits nothing: its own Read and Write', async () => {
			await withPresets();
			host.emit('status', { ...ON_1, busy: 'read' });
			expect(devicePeqStore.isReading).toBe(true);
			host.emit('status', { ...ON_1, busy: 'write' });
			expect(devicePeqStore.isReading).toBe(false);
			expect(devicePeqStore.isWriting).toBe(true);
			host.emit('status', ON_1);
			expect(devicePeqStore.isBusy).toBe(false);
		});

		it('stays busy past uniPEQ’s answer while its status still says so', async () => {
			await withPresets();
			const presses = [
				[() => devicePeqService.renamePreset(1, 'Metal'), 'preset', 'isSwitching'],
				[() => devicePeqService.choose('p2'), 'switch', 'isSwitching'],
				[() => devicePeqService.setControl('feed', 1), 'control', 'isSettingControl']
			] as const;
			for (const [press, busy, flag] of presses) {
				const answer = host.hold();
				const first = press();
				host.emit('status', { ...ON_1, busy });
				answer();
				await first;
				expect(devicePeqStore[flag]).toBe(true);
				host.emit('status', ON_1);
				expect(devicePeqStore.isBusy).toBe(false);
			}
		});

		it('sends no other preset edit before uniPEQ answers one, whose own busy may come later', async () => {
			await withPresets();
			const answer = host.hold();
			const first = devicePeqService.renamePreset(1, 'Metal');
			await devicePeqService.renamePreset(0, 'Blues');
			await devicePeqService.createPreset();
			await devicePeqService.deletePreset(2);
			expect(host.command).toHaveBeenCalledExactlyOnceWith('preset-rename', {
				slot: 1,
				name: 'Metal'
			});

			answer();
			expect(await first).toBe('done');
			await devicePeqService.deletePreset(2);
			expect(host.command).toHaveBeenLastCalledWith('preset-delete', { slot: 2 });
		});

		it('a preset create: uniPEQ names it after a busy: null', async () => {
			await withPresets();
			const answer = host.hold();
			const first = devicePeqService.createPreset();
			busyThenIdle('preset');
			expect(devicePeqStore.isSwitching).toBe(true);
			await devicePeqService.createPreset();
			expect(host.command).toHaveBeenCalledOnce();

			answer();
			await first;
			expect(devicePeqStore.isBusy).toBe(false);
		});

		it('an EQ pick: uniPEQ writes a pending edit first, then switches', async () => {
			await linked(4);
			host.emit('device', {
				...DEVICE,
				eq: null,
				eqs: [
					{ id: null, name: 'USR EQ' },
					{ id: 'spk', name: 'SPK EQ' }
				]
			});
			const answer = host.hold();
			const first = devicePeqService.selectEq('spk');
			busyThenIdle('write');
			expect(devicePeqStore.isSwitching).toBe(true);
			await devicePeqService.selectEq('spk');
			expect(host.command).toHaveBeenCalledOnce();

			answer();
			await first;
			expect(devicePeqStore.isBusy).toBe(false);
		});

		it('a setting', async () => {
			await withPresets();
			const answer = host.hold();
			const first = devicePeqService.setControl('feed', 1);
			busyThenIdle('control');
			expect(devicePeqStore.isSettingControl).toBe(true);
			await devicePeqService.setControl('feed', 1);
			expect(host.command).toHaveBeenCalledOnce();

			answer();
			await first;
			expect(devicePeqStore.isBusy).toBe(false);
		});

		it('a Device EQ pick, which the panel disables while busy', async () => {
			await withPresets();
			const answer = host.hold();
			const first = devicePeqService.choose('p2');
			busyThenIdle('switch');
			expect(host.command).toHaveBeenCalledExactlyOnceWith('switch', { value: 'p2' });
			expect(devicePeqStore.isSwitching).toBe(true);
			expect(devicePeqStore.isBusy).toBe(true);

			answer();
			await first;
			expect(devicePeqStore.isBusy).toBe(false);
		});
	});

	describe('retiring this page’s last message once uniPEQ starts device work', () => {
		const QUDELIX = {
			...DEVICE,
			eq: null,
			eqs: [
				{ id: null, name: 'USR EQ' },
				{ id: 'spk', name: 'SPK EQ' }
			],
			capabilities: {
				...DEVICE.capabilities,
				controls: [{ id: 'feed', name: 'Crossfeed', kind: 'toggle' }]
			}
		};
		const IDLE: LinkStatus = { ...STATUS, controls: { feed: 0 } };

		async function withQudelix() {
			await linked(4);
			host.status = IDLE;
			host.emit('status', IDLE);
			host.emit('device', QUDELIX);
		}

		/** uniPEQ writing its device, as the Qudelix showed it: busy, in sync, idle. */
		function uniPEQWrites(status = IDLE) {
			host.emit('status', { ...status, busy: 'write', inSync: false });
			host.emit('status', { ...status, busy: 'write', inSync: true });
			host.emit('status', { ...status, busy: null, inSync: true });
		}

		it('drops a refused EQ pick’s error once a Write here gets the device the list', async () => {
			await withQudelix();
			host.command.mockResolvedValueOnce({ ok: false, code: 'unwritten' });
			await devicePeqService.selectEq('spk');
			expect(devicePeqStore.statusMessage).toBe(m.device_eq_unwritten());
			expect(devicePeqStore.statusIsError).toBe(true);

			host.command.mockImplementationOnce(async () => {
				uniPEQWrites();
				return { ok: true };
			});
			await devicePeqService.writeLinked();
			expect(devicePeqStore.statusMessage).toBeNull();
			expect(devicePeqStore.statusIsError).toBe(false);
		});

		it('retires a setting’s message when uniPEQ writes an edit made there', async () => {
			await withQudelix();
			await devicePeqService.setControl('feed', 1);
			expect(devicePeqStore.statusMessage).not.toBeNull();

			uniPEQWrites({ ...IDLE, controls: { feed: 1 } });
			expect(devicePeqStore.statusMessage).toBeNull();
			expect(devicePeqStore.statusIsError).toBe(false);
		});

		it('keeps a failure uniPEQ still reports past new work, until uniPEQ clears it', async () => {
			await withQudelix();
			const failed = { ...IDLE, failure: { op: 'write', code: 'timeout' } };
			host.emit('status', failed);
			const message = devicePeqStore.statusMessage;
			expect(message).not.toBeNull();
			expect(devicePeqStore.statusIsError).toBe(true);

			host.emit('status', { ...failed, busy: 'write' });
			expect(devicePeqStore.statusMessage).toBe(message);
			expect(devicePeqStore.statusIsError).toBe(true);

			host.emit('status', IDLE);
			expect(devicePeqStore.statusMessage).toBeNull();
			expect(devicePeqStore.statusIsError).toBe(false);
		});

		it('keeps a message set while uniPEQ works on, through the rest of that work', async () => {
			await withQudelix();
			const answer = host.hold();
			const first = devicePeqService.setControl('feed', 1);
			host.emit('status', { ...IDLE, busy: 'control' });
			answer();
			await first;
			const message = devicePeqStore.statusMessage;
			expect(message).not.toBeNull();

			host.emit('status', { ...IDLE, busy: 'read' });
			host.emit('status', { ...IDLE, controls: { feed: 1 } });
			expect(devicePeqStore.statusMessage).toBe(message);
		});
	});

	it('keeps the channel picker on both ears while uniPEQ has no device to drive them apart', async () => {
		await linked();
		host.eq([wire(100, 3)]);
		flushSync();
		expect(eqConstraintsStore.supportsPerChannel).toBe(true);
		expect(eqStore.channelScopeLocked).toBe(true);
		host.emit('device', STEREO);
		expect(eqStore.channelScopeLocked).toBe(false);
	});
});
