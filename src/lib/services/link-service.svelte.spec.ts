import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { Adopt, HostOptions, LinkEq, LinkStatus } from 'peq-link/client';
import { linkService } from './link-service.svelte.js';
import { linkStore } from '$lib/stores/link-store.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { devicePeqStore } from '$lib/stores/device-peq-store.svelte.js';
import { eqConstraintsStore } from '$lib/stores/eq-constraints-store.svelte.js';
import { BUILTIN_PRESETS, DEFAULT_CONSTRAINT_ID } from '$lib/stores/eq-constraints-store.svelte.js';
import { commandHistory } from './command-history.svelte.js';
import { eqCommands } from './eq-commands.js';
import { dataProvider } from './data-provider.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import type { EQFilter } from '$lib/utils/equalizer.js';
import type { DeviceConnection } from '$lib/device-peq/types.js';

/** `HostLink` as far as the service uses it, driven by the test. */
class FakeHost {
	state = 'waiting';
	room = 'ABCD2345';
	server = 'https://link.unipeq.com';
	status: LinkStatus | null = null;
	readonly options: HostOptions;
	readonly edit = vi.fn();
	readonly replaceAll = vi.fn();
	readonly command = vi.fn(async () => ({ ok: true }));
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

	/**
	 * uniPEQ's `eq`, as the client hands it on: an `eq` event only when it differs from this
	 * page's list, and the raw message either way.
	 */
	eq(
		filters: LinkEq['filters'],
		extra: Partial<Adopt> = {},
		preamp: Pick<LinkEq, 'preamp' | 'autoPreamp'> = { preamp: -2, autoPreamp: true }
	) {
		const eq: LinkEq = { filters, ...preamp };
		const rev = ++this.#rev;
		const local = this.options.local();
		const same =
			JSON.stringify(local.filters) === JSON.stringify(filters) &&
			local.autoPreamp === eq.autoPreamp &&
			local.preamp === eq.preamp;
		if (!same) {
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

/** Starts a link and has uniPEQ approve it. */
async function linked(): Promise<FakeHost> {
	await linkService.start();
	host.setState('linked');
	return host;
}

describe('linkService', () => {
	beforeEach(() => {
		eqStore.filters = [];
		eqStore.isEnabled = false;
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

	it('leaves a device connected here alone', async () => {
		devicePeqStore.connection = { connectionType: 'hid', name: 'Local DAC' } as DeviceConnection;
		await linked();
		host.emit('device', DEVICE);
		expect(devicePeqStore.connection?.connectionType).toBe('hid');
		devicePeqStore.connection = null;
	});

	it('plays uniPEQ’s fixed preamp whatever the bands do, and turns Auto back on through the link', async () => {
		dataProvider.installEqCurveSync();
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
		dataProvider.installEqCurveSync();
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
});
