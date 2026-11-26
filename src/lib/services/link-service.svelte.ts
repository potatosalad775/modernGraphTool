/**
 * The uniPEQ link, this page's side (uniPEQ_link's docs/design.md §6). This page hosts a room,
 * uniPEQ joins and approves, and from then on the band list is shared: uniPEQ holds it and writes
 * its device, this page edits optimistically and adopts what uniPEQ echoes back.
 *
 * The protocol, liveness, reconnecting and resuming after a reload are all `peq-link`'s client.
 * What lives here is the binding: local edits turned into ops, echoes adopted as undo steps, the
 * start dialog's question, and uniPEQ's device mirrored into Hardware EQ as a `'link'` connection.
 * Hardware EQ holds one connection at a time, so the link doesn't start while a device is
 * connected or connecting in this browser (`devicePeqStore.localActive`).
 *
 * A page-lifetime singleton, because panels unmount on every switch. It is itself loaded lazily:
 * by Hardware EQ, or from `AppShell.onMount` only when this tab has a session to resume
 * (`link-config.ts`). The client follows with `import()` on the first Link press or that resume,
 * so a visitor who never links downloads neither.
 */
import { untrack } from 'svelte';
import type {
	Adopt,
	CommandName,
	HostLink,
	HostOptions,
	LinkDevice,
	LinkEq,
	LinkStatus
} from 'peq-link/client';
import { linkStore } from '#lib/stores/link-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { eqConstraintsStore } from '#lib/stores/eq-constraints-store.svelte.js';
import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
import type { EQFilter } from '#lib/utils/equalizer.js';
import { track } from '#lib/utils/track.js';
import type { DeviceConnection } from '#lib/device-peq/types.js';
import {
	acceptAbsentEqs,
	acceptControlValues,
	acceptEqs,
	acceptSlots,
	carriesEars,
	fromLinkLists,
	linkConnection,
	linkEdit,
	linkOps,
	LinkCommandError,
	sendLosses,
	toLinkLists,
	type LinkLists,
	type LinkPort
} from '#lib/device-peq/link.js';
import { commandHistory } from './command-history.svelte.js';
import { eqCommands, type ReplaceEqFiltersCommand } from './eq-commands.js';
import { AUTO_WRITE_DELAY_MS, devicePeqService } from './device-peq-service.svelte.js';
import { linkConfig } from './link-config.js';

/** uniPEQ's `eq` as its lists: `right` while its channels are apart (protocol 1.3). */
function listsOf(eq: LinkEq): LinkLists {
	return { left: eq.filters, right: eq.right?.filters ?? null };
}

/**
 * The preamp this page plays for uniPEQ's `eq`. It plays one preamp ahead of the per-ear split, so
 * with the channels apart it is the lower of the two, which keeps the louder ear from clipping as
 * `derivePreamp` does.
 */
function preampOf(eq: LinkEq): { preamp: number; auto: boolean } {
	const right = eq.right ?? eq;
	return { preamp: Math.min(eq.preamp, right.preamp), auto: eq.autoPreamp && right.autoPreamp };
}

/** Hardware EQ's busy flags: for a link connection, only `#busy` writes them. */
const BUSY_FLAGS = [
	'isConnecting',
	'isReading',
	'isWriting',
	'isSwitching',
	'isSettingControl'
] as const;
type BusyFlag = (typeof BUSY_FLAGS)[number];

/** The flag uniPEQ's `status.busy` holds. A preset edit renumbers the list: no switch meanwhile. */
const STATUS_FLAG: Record<NonNullable<LinkStatus['busy']>, BusyFlag> = {
	connect: 'isConnecting',
	read: 'isReading',
	write: 'isWriting',
	switch: 'isSwitching',
	preset: 'isSwitching',
	control: 'isSettingControl'
};

/** The flag a command of this page's holds until uniPEQ answers it. */
const COMMAND_FLAG: Record<CommandName, BusyFlag | null> = {
	read: 'isReading',
	write: 'isWriting',
	review: 'isWriting',
	switch: 'isSwitching',
	eq: 'isSwitching',
	'preset-create': 'isSwitching',
	'preset-rename': 'isSwitching',
	'preset-delete': 'isSwitching',
	control: 'isSettingControl',
	reconnect: 'isConnecting',
	fit: null,
	'auto-write': null,
	consent: null
};

class LinkService {
	#link: HostLink | null = null;
	#effects = false;
	/**
	 * What uniPEQ holds, as far as this page knows: last adopted, or last sent. Also whether its
	 * channels are apart (`right`), which this page's edits keep unless they add or remove one-ear
	 * bands (`#apart`).
	 */
	#shared: LinkLists = { left: [], right: null };
	/** uniPEQ's last list: its preamp is the link's, since this page derives its own. */
	#remote: LinkEq | null = null;
	/**
	 * Whether this page has joined the shared list. Not before the session's first list is
	 * settled (adopted, found equal, or answered in the start dialog), so nothing it does meanwhile
	 * goes out as an edit.
	 */
	#joined = false;
	/** The next fresh list asks again: a device first connected in uniPEQ during the link. */
	#askOnFresh = false;
	/** uniPEQ's latest list while the start dialog is open. */
	#pending: Adopt | null = null;
	/** The `commandHistory.revision` last seen: a move is a finished step, so the edit settles. */
	#revision = 0;
	/** The gesture under way, whose edits share an id; null between gestures. */
	#burst: string | null = null;
	#bursts = 0;
	#settleTimer: ReturnType<typeof setTimeout> | undefined;
	/** The undo step a burst of uniPEQ's edits folds into. */
	#adopted: { command: ReplaceEqFiltersCommand | null; burst: string | undefined } | null = null;
	/** The `device` last mirrored, so a resent snapshot doesn't reconnect Hardware EQ. */
	#deviceKey: string | null = null;
	#failureKey: string | null = null;
	/**
	 * This session's commands still awaiting uniPEQ's answer, by the flag each holds. uniPEQ's
	 * `busy` alone won't do: it goes `null` partway through some (an `eq` that first writes a
	 * pending edit, a create then a rename), and refuses a second press meanwhile.
	 */
	#awaiting = new Map<BusyFlag, number>();

	/** Rejoin this tab's session after a reload: uniPEQ keeps its approval. From `AppShell.onMount`. */
	resume(): Promise<void> {
		return this.#open(true);
	}

	/** Link with uniPEQ: a new room, its code shown until uniPEQ joins. Not with a device here. */
	start(): Promise<void> {
		return this.#open(false);
	}

	/** Ends the session on both sides: Cancel while waiting, Unlink once linked. */
	unlink(): void {
		this.#link?.unlink();
	}

	/** The start dialog's answer: take uniPEQ's list, or send this page's. One undo step either way. */
	choose(keep: 'theirs' | 'mine'): void {
		const link = this.#link;
		const pending = this.#pending;
		linkStore.choice = null;
		this.#pending = null;
		if (!link) return;
		if (keep === 'theirs') {
			// Asked again mid-session with no list from uniPEQ since (`#changed`): what it holds.
			if (pending) this.#adopt(listsOf(pending.eq), pending);
			else this.#adopt(this.#shared, { fresh: false });
			eqCommands.ensureEnabled();
			return;
		}
		// What uniPEQ can hold: switched-off bands flat, one-ear bands only where its device takes
		// them, every band in the slot uniPEQ will hold it in.
		const ears = this.#allowed(link) && carriesEars(eqStore.filters);
		const sent = toLinkLists(eqStore.filters, ears);
		eqCommands.replaceFilters(fromLinkLists(sent));
		// Without `right` the list lands on both of uniPEQ's channels, and they stay apart if they were.
		const apart = this.#remote?.right !== undefined;
		this.#join(sent.right || !apart ? sent : { left: sent.left, right: sent.left });
		const preamp = { preamp: eqStore.preamp, autoPreamp: true };
		link.replaceAll({
			filters: sent.left,
			...preamp,
			...(sent.right ? { right: { filters: sent.right, ...preamp } } : {})
		});
	}

	/** Turn uniPEQ's preamp back to Auto: a fixed one came from the device, read in uniPEQ. */
	autoPreamp(): void {
		this.#link?.edit([{ op: 'auto-preamp', on: true }], { settle: true });
	}

	/**
	 * `local` for the client: this page's list, with uniPEQ's preamp, which this page doesn't own.
	 * Once joined, apart exactly when `#shared` is: a resync sends this whole, channels included, so
	 * any other rule would split or join uniPEQ's channels on a reconnect. Before that, also apart
	 * for one-ear bands, so a list equal but for them still asks: Send keeps them where uniPEQ's
	 * device takes them, and the dialog says they are left out where it doesn't.
	 */
	#local(): LinkEq {
		const ears = !this.#joined && carriesEars(eqStore.filters);
		const { left, right } = toLinkLists(eqStore.filters, this.#shared.right !== null || ears);
		const remote = this.#remote;
		const top = {
			preamp: remote?.preamp ?? eqStore.preamp,
			autoPreamp: remote?.autoPreamp ?? true
		};
		if (!right) return { filters: left, ...top };
		const { preamp, autoPreamp } = remote?.right ?? top;
		return { filters: left, ...top, right: { filters: right, preamp, autoPreamp } };
	}

	/**
	 * uniPEQ takes one-ear bands from this page: it knows protocol 1.3 and its device drives its
	 * channels apart. The connection is the link's, since nothing else connects while linked.
	 */
	#allowed(link: HostLink): boolean {
		return link.minor >= 3 && devicePeqStore.perChannel;
	}

	/** Already linked, or a device connected on this page has the EQ. */
	#taken(): boolean {
		return this.#link !== null || devicePeqStore.localActive;
	}

	async #open(resume: boolean): Promise<void> {
		if (this.#taken()) return;
		const { server } = linkConfig();
		let client: typeof import('peq-link/client');
		try {
			client = await import('peq-link/client');
		} catch (error) {
			console.error('uniPEQ link: the client failed to load', error);
			if (!resume) linkStore.failed = true;
			return;
		}
		// A device may have connected here while the client loaded.
		if (this.#taken()) return;
		const options: HostOptions = {
			server,
			version: __APP_VERSION__,
			site: document.title || undefined,
			local: () => this.#local()
		};
		const link = resume ? client.resumeHost(options) : client.startHost(options);
		if (!link) return;
		this.#bind(link);
	}

	#bind(link: HostLink): void {
		this.#link = link;
		this.#shared = { left: [], right: null };
		this.#remote = null;
		eqStore.linkedPreamp = null;
		this.#joined = false;
		this.#askOnFresh = false;
		this.#pending = null;
		this.#adopted = null;
		this.#deviceKey = null;
		this.#failureKey = null;
		this.#awaiting = new Map();
		this.#endBurst();
		linkStore.reset();
		linkStore.phase = link.state;
		linkStore.room = link.room;
		linkStore.server = link.server;
		this.#installEffects();

		link.on('state', (state) => (linkStore.phase = state));
		linkStore.launch = link.launch;
		link.on('hello', (hello) => {
			linkStore.unipeqVersion = hello.version;
			linkStore.launchedHere = link.launchedHere;
		});
		link.on('eq', (adopt) => this.#receive(link, adopt));
		// After the client's own handler: an `eq` it found equal to this list emitted nothing, and
		// is still the session's first list settled.
		link.session.on('message', (message) => {
			if (message.t !== 'eq' || !linkStore.linked) return;
			this.#remote = message.eq;
			if (!this.#joined && !linkStore.choice) {
				this.#join(toLinkLists(eqStore.filters, message.eq.right !== undefined));
			}
			// uniPEQ's preamp, for the list as adopted. Not while this page has edits it hasn't seen:
			// that preamp is for an older list.
			if (this.#joined && !link.dirty) {
				eqStore.linkedPreamp = { ...preampOf(message.eq), filters: eqStore.filters };
			}
		});
		link.on('device', (device) => this.#device(link, device));
		link.on('status', (status) => this.#status(status));
		link.on('notice', ({ ms }) => (linkStore.pausedMs = ms));
		link.on('ended', (ended) => {
			if (this.#link !== link) return;
			this.#link = null;
			this.#awaiting = new Map();
			this.#endBurst();
			this.#joined = false;
			this.#pending = null;
			linkStore.choice = null;
			linkStore.ended = ended;
			eqStore.linkedPreamp = null;
			if (devicePeqStore.connection?.connectionType === 'link') devicePeqStore.setDisconnected();
		});
	}

	/** Local edits out: installed with the first session, never disposed. */
	#installEffects(): void {
		if (this.#effects) return;
		this.#effects = true;
		this.#revision = commandHistory.revision;
		$effect.root(() => {
			$effect(() => {
				const filters = eqStore.filters;
				const revision = commandHistory.revision;
				// Keep in the channel conflict dialog lifts a restriction without an edit, and the
				// one-ear bands it kept may be ones the link can't carry (`#changed` asks).
				track(eqConstraintsStore.supportsPerChannel);
				untrack(() => this.#changed(filters, revision));
			});
		});
	}

	#changed(filters: EQFilter[], revision: number): void {
		const committed = revision !== this.#revision;
		this.#revision = revision;
		const link = this.#link;
		if (!link || !this.#joined) return;
		const apart = this.#apart(link, filters);
		// One-ear bands the link can't carry, back from before it (an undo past the start choice):
		// ask again rather than keep them behind the locked channel picker, unheard by uniPEQ.
		// Under a restriction that holds none, `eqChannelConflict` asks instead.
		if (!apart && carriesEars(filters) && eqConstraintsStore.supportsPerChannel) {
			this.#joined = false;
			this.#endBurst();
			this.#ask(link, fromLinkLists(this.#shared).length);
			return;
		}
		const next = toLinkLists(filters, apart);
		const ops = linkEdit(this.#shared, next);
		this.#shared = next;
		// A command landing ends the gesture that led to it (a drag's release, a slider's last
		// step), or is a step of its own (AutoEQ, add, undo).
		if (!ops.length && !(committed && this.#burst)) return;
		this.#burst ??= `m${++this.#bursts}`;
		const burst = this.#burst;
		clearTimeout(this.#settleTimer);
		if (committed) {
			link.edit(ops, { burst, settle: true });
			this.#burst = null;
			return;
		}
		// Mid-gesture, or a change no command recorded (AutoEQ auto-apply amending its step):
		// settle once it goes quiet, as auto-write would have written then.
		link.edit(ops, { burst });
		this.#settleTimer = setTimeout(() => {
			if (this.#link === link && this.#burst === burst) link.edit([], { burst, settle: true });
			if (this.#burst === burst) this.#burst = null;
		}, AUTO_WRITE_DELAY_MS);
	}

	#endBurst(): void {
		clearTimeout(this.#settleTimer);
		this.#burst = null;
	}

	/**
	 * Whether uniPEQ's channels are apart once `filters` goes out. One-ear bands the link carries
	 * (`carriesEars`: not an empty one just added) set them apart where uniPEQ's device takes them,
	 * and removing the last of them joins them again if they held any. Otherwise they stay as they
	 * are: apart with both channels alike is uniPEQ's user's choice.
	 */
	#apart(link: HostLink, filters: EQFilter[]): boolean {
		const ears = carriesEars(filters);
		if (ears && this.#allowed(link)) return true;
		const { left, right } = this.#shared;
		return right !== null && (ears || linkOps(left, right).length === 0);
	}

	/** A list from uniPEQ to adopt (the client already dropped echoes of this page's own edits). */
	#receive(link: HostLink, adopt: Adopt): void {
		this.#remote = adopt.eq;
		const lists = listsOf(adopt.eq);
		const theirs = fromLinkLists(lists).length;
		if (linkStore.choice) {
			this.#pending = adopt;
			this.#ask(link, theirs);
			return;
		}
		const ask = adopt.initial || (this.#askOnFresh && adopt.fresh);
		if (adopt.fresh) this.#askOnFresh = false;
		// Only the preamp differs (this page derives its own), or whether uniPEQ's channels are apart
		// with both alike: nothing to adopt or ask about. One-ear bands here are a difference even
		// when uniPEQ's list is joined.
		const mine = toLinkLists(eqStore.filters, lists.right !== null || carriesEars(eqStore.filters));
		if (!linkEdit(mine, lists).length) {
			this.#join(mine);
			return;
		}
		const sent = toLinkLists(eqStore.filters, this.#allowed(link));
		// An empty list here takes uniPEQ's without asking: there is nothing to lose. Not one of
		// one-ear bands alone that Send would leave out: taking uniPEQ's loses them just the same.
		const holds = sent.left.length > 0 || !!sent.right?.length || carriesEars(eqStore.filters);
		if (ask && holds) {
			this.#joined = false;
			this.#endBurst();
			this.#pending = adopt;
			this.#ask(link, theirs);
			return;
		}
		this.#adopt(lists, adopt);
		if (adopt.initial) eqCommands.ensureEnabled();
	}

	/**
	 * The start dialog's question, uniPEQ's list holding `theirs` bands. What Send would lose is
	 * worked out again each time, since it depends on uniPEQ's device, which may change meanwhile.
	 */
	#ask(link: HostLink, theirs: number): void {
		linkStore.choice = { theirs, ...sendLosses(eqStore.filters, this.#allowed(link)) };
	}

	/** uniPEQ's `lists` as this page's: one undo step, or one with the last from the same burst. */
	#adopt(lists: LinkLists, { burst, fresh }: Pick<Adopt, 'burst' | 'fresh'>): void {
		const filters = fromLinkLists(lists);
		// What the edit effect compares against, set first so the adoption isn't sent back.
		this.#shared = toLinkLists(filters, lists.right !== null);
		const adopted = this.#adopted;
		const same = burst !== undefined && adopted !== null && adopted.burst === burst;
		const command = eqCommands.adoptLinked(filters, {
			amend: same ? adopted.command : null,
			fresh
		});
		this.#adopted = { command, burst };
		this.#settle();
	}

	/** This page's list is uniPEQ's (`lists`), and its edits go out from here on. */
	#join(lists: LinkLists): void {
		this.#shared = lists;
		if (!this.#joined) this.#settle();
	}

	#settle(): void {
		this.#revision = commandHistory.revision;
		// The list settled opens on L+R, as a new EQ source does: the ear picked before may be empty.
		if (!this.#joined) eqStore.channelScope = 'BOTH';
		this.#joined = true;
	}

	/** uniPEQ's device, as Hardware EQ's connection: nothing else is connected while the link is. */
	#device(link: HostLink, device: LinkDevice | null): void {
		linkStore.device = device;
		const key = JSON.stringify(device);
		if (key === this.#deviceKey) return;
		const first = this.#deviceKey === 'null' && device !== null;
		this.#deviceKey = key;
		// A device connected in uniPEQ mid-link reads its bands into the list: ask again then.
		if (first && this.#joined) this.#askOnFresh = true;
		const connection = device && linkConnection(this.#port(link), device, link.minor);
		linkStore.deviceRejected = device !== null && !connection;
		if (connection) this.#connect(link, device, connection);
		else if (devicePeqStore.connection) devicePeqStore.setDisconnected();
		// Whether Send keeps one-ear bands depends on the device: an open start dialog says so anew.
		if (linkStore.choice) this.#ask(link, linkStore.choice.theirs);
	}

	/**
	 * `connection` into Hardware EQ: the device as uniPEQ views it, as one of its EQs (`eq`,
	 * protocol 1.3), and all of them by name (`eqs`, 1.4). A new EQ comes as a new `device`.
	 */
	#connect(link: HostLink, device: LinkDevice, connection: DeviceConnection): void {
		devicePeqStore.setConnected(connection, link.status?.deviceSlot ?? null, null, {
			conn: connection,
			eq: { id: typeof device.eq === 'string' ? device.eq : undefined, bandCount: null },
			absent: acceptAbsentEqs(link.status?.absentEqs),
			eqs: acceptEqs(device.eqs) ?? undefined
		});
		devicePeqService.install();
		if (link.status) this.#status(link.status);
		// A new view can arrive mid-command (an `eq`), and connecting clears the flags.
		else this.#busy();
	}

	/**
	 * `link` as Hardware EQ's device reaches it: every command it sends holds its flag until
	 * uniPEQ answers, which `HostLink.command` always does (`timeout`, `not-linked` at the end).
	 */
	#port(link: HostLink): LinkPort {
		return {
			get status() {
				return link.status;
			},
			command: async (name, ...args) => {
				const flag = COMMAND_FLAG[name];
				const awaiting = this.#awaiting;
				const count = (by: number) => {
					if (flag) awaiting.set(flag, (awaiting.get(flag) ?? 0) + by);
					if (awaiting === this.#awaiting) this.#busy();
				};
				count(1);
				try {
					return await link.command(name, ...args);
				} finally {
					count(-1);
				}
			},
			unlink: () => link.unlink()
		};
	}

	/**
	 * Hardware EQ's busy flags for a link connection, written here alone: each is on while uniPEQ's
	 * last `status.busy` names it or a command of this page's that holds it awaits its answer.
	 */
	#busy(): void {
		if (devicePeqStore.connection?.connectionType !== 'link') return;
		const busy = linkStore.status?.busy;
		const named = busy ? STATUS_FLAG[busy] : null;
		for (const flag of BUSY_FLAGS) {
			devicePeqStore[flag] = flag === named || (this.#awaiting.get(flag) ?? 0) > 0;
		}
	}

	/** uniPEQ's status, into the flags Hardware EQ's panel and status line read. */
	#status(status: LinkStatus): void {
		const starts = !!status.busy && !linkStore.status?.busy;
		linkStore.status = status;
		if (devicePeqStore.connection?.connectionType !== 'link') return;
		const store = devicePeqStore;
		this.#busy();
		// The presets as they are now, for a device that keeps a list (protocol 1.3); else the
		// profile's. `activeSlot` and `deviceSlot` are ids in it.
		store.setListed(acceptSlots(status.slots));
		// The EQs the device's mode lacks now (protocol 1.3). uniPEQ leaves a viewed one that goes.
		store.setAbsent(acceptAbsentEqs(status.absentEqs));
		// The device's settings as uniPEQ last read them (protocol 1.3): the rows follow these.
		store.controlValues = acceptControlValues(status.controls);
		store.activeSlot = status.activeSlot;
		store.deviceSlot = status.unsaved ? 'unsaved' : status.deviceSlot;
		store.eqEnabled = status.eqEnabled;
		store.needsReconnect = status.needsReconnect;
		store.autoPaused = status.auto.paused;
		store.autoClipRisk = status.auto.clipRisk;
		store.autoStopped = status.auto.stopped;
		store.reportedInSync = status.inSync;
		// uniPEQ's device work sets no message here, so the last one this page set goes when uniPEQ
		// starts some, or it would stand for that work. A failure uniPEQ still reports stays until
		// uniPEQ clears it.
		if (starts && this.#failureKey === null) store.setStatus(null);
		const failure = status.failure;
		const key = failure && `${failure.op}:${failure.code}`;
		if (key === this.#failureKey) return;
		this.#failureKey = key;
		// A name the device can't store is said where it was typed, quietly: this page's Rename says
		// it from the command's answer (`#presetFailed`), and uniPEQ's own Rename in uniPEQ.
		if (key === 'preset:invalid-request') return;
		if (failure) devicePeqService.fail(new LinkCommandError(failure.code), failure.op);
		else if (store.statusIsError) store.setStatus(null);
	}
}

export const linkService = new LinkService();
