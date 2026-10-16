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
import type { Filter } from '@potatosalad775/eqcaps-core';
import type { Adopt, HostLink, HostOptions, LinkDevice, LinkEq, LinkStatus } from 'peq-link/client';
import { linkStore } from '#lib/stores/link-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
import type { EQFilter } from '#lib/utils/equalizer.js';
import {
	fromLinkFilters,
	linkConnection,
	linkOps,
	LinkCommandError,
	sendLosses,
	toLinkFilters
} from '#lib/device-peq/link.js';
import { commandHistory } from './command-history.svelte.js';
import { eqCommands, type ReplaceEqFiltersCommand } from './eq-commands.js';
import { AUTO_WRITE_DELAY_MS, devicePeqService } from './device-peq-service.svelte.js';
import { linkConfig } from './link-config.js';

class LinkService {
	#link: HostLink | null = null;
	#effects = false;
	/** The list as uniPEQ has it, as far as this page knows: last adopted, or last sent. */
	#shared: Filter[] = [];
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
			if (pending) this.#adopt(pending);
			else this.#join();
			eqCommands.ensureEnabled();
			return;
		}
		// What uniPEQ can hold: switched-off bands flat, one-ear bands left out.
		eqCommands.replaceFilters(fromLinkFilters(toLinkFilters(eqStore.filters)));
		this.#join();
		link.replaceAll({ filters: this.#shared, preamp: eqStore.preamp, autoPreamp: true });
	}

	/** Turn uniPEQ's preamp back to Auto: a fixed one came from the device, read in uniPEQ. */
	autoPreamp(): void {
		this.#link?.edit([{ op: 'auto-preamp', on: true }], { settle: true });
	}

	/** `local` for the client: this page's list, with uniPEQ's preamp, which this page doesn't own. */
	#local(): LinkEq {
		return {
			filters: toLinkFilters(eqStore.filters),
			preamp: this.#remote?.preamp ?? eqStore.preamp,
			autoPreamp: this.#remote?.autoPreamp ?? true
		};
	}

	async #open(resume: boolean): Promise<void> {
		if (this.#link || devicePeqStore.localActive) return;
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
		if (this.#link || devicePeqStore.localActive) return;
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
		this.#shared = [];
		this.#remote = null;
		eqStore.linkedPreamp = null;
		this.#joined = false;
		this.#askOnFresh = false;
		this.#pending = null;
		this.#adopted = null;
		this.#deviceKey = null;
		this.#failureKey = null;
		this.#endBurst();
		linkStore.reset();
		linkStore.phase = link.state;
		linkStore.room = link.room;
		linkStore.server = link.server;
		this.#installEffects();

		link.on('state', (state) => {
			linkStore.phase = state;
			// One list for both ears while linked: the scope picker is locked on L+R.
			if (state === 'linked') eqStore.channelScope = 'BOTH';
		});
		link.on('hello', (hello) => (linkStore.unipeqVersion = hello.version));
		link.on('eq', (adopt) => this.#receive(adopt));
		// After the client's own handler: an `eq` it found equal to this list emitted nothing, and
		// is still the session's first list settled.
		link.session.on('message', (message) => {
			if (message.t !== 'eq' || !linkStore.linked) return;
			this.#remote = message.eq;
			if (!this.#joined && !linkStore.choice) this.#join();
			// uniPEQ's preamp, for the list as adopted. Not while this page has edits it hasn't seen:
			// that preamp is for an older list.
			if (this.#joined && !link.dirty) {
				const { preamp, autoPreamp } = message.eq;
				eqStore.linkedPreamp = { preamp, auto: autoPreamp, filters: eqStore.filters };
			}
		});
		link.on('device', (device) => this.#device(link, device));
		link.on('status', (status) => this.#status(status));
		link.on('notice', ({ ms }) => (linkStore.pausedMs = ms));
		link.on('ended', (ended) => {
			if (this.#link !== link) return;
			this.#link = null;
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
				untrack(() => this.#changed(filters, revision));
			});
		});
	}

	#changed(filters: EQFilter[], revision: number): void {
		const committed = revision !== this.#revision;
		this.#revision = revision;
		const link = this.#link;
		if (!link || !this.#joined) return;
		const next = toLinkFilters(filters);
		const ops = linkOps(this.#shared, next);
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

	/** A list from uniPEQ to adopt (the client already dropped echoes of this page's own edits). */
	#receive(adopt: Adopt): void {
		this.#remote = adopt.eq;
		if (linkStore.choice) {
			this.#pending = adopt;
			linkStore.choice = { ...linkStore.choice, theirs: adopt.eq.filters.length };
			return;
		}
		const ask = adopt.initial || (this.#askOnFresh && adopt.fresh);
		if (adopt.fresh) this.#askOnFresh = false;
		// Only the preamp differs (this page derives its own): nothing to adopt or ask about.
		if (!linkOps(toLinkFilters(eqStore.filters), adopt.eq.filters as Filter[]).length) {
			if (!this.#joined) this.#join();
			return;
		}
		// An empty list here takes uniPEQ's without asking: there is nothing to lose.
		if (ask && toLinkFilters(eqStore.filters).length > 0) {
			this.#joined = false;
			this.#endBurst();
			this.#pending = adopt;
			linkStore.choice = { theirs: adopt.eq.filters.length, ...sendLosses(eqStore.filters) };
			return;
		}
		this.#adopt(adopt);
		if (adopt.initial) eqCommands.ensureEnabled();
	}

	#adopt(adopt: Adopt): void {
		const filters = fromLinkFilters(adopt.eq.filters);
		// What the edit effect compares against, set first so the adoption isn't sent back.
		this.#shared = toLinkFilters(filters);
		const same =
			adopt.burst !== undefined && this.#adopted !== null && this.#adopted.burst === adopt.burst;
		const command = eqCommands.adoptLinked(filters, {
			amend: same ? this.#adopted!.command : null,
			fresh: adopt.fresh
		});
		this.#adopted = { command, burst: adopt.burst };
		this.#revision = commandHistory.revision;
		this.#joined = true;
	}

	#join(): void {
		this.#shared = toLinkFilters(eqStore.filters);
		this.#revision = commandHistory.revision;
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
		const connection = device && linkConnection(link, device);
		linkStore.deviceRejected = device !== null && !connection;
		if (!connection) {
			if (devicePeqStore.connection) devicePeqStore.setDisconnected();
			return;
		}
		devicePeqStore.setConnected(connection, link.status?.deviceSlot ?? null);
		devicePeqService.install();
		if (link.status) this.#status(link.status);
	}

	/** uniPEQ's status, into the flags Hardware EQ's panel and status line read. */
	#status(status: LinkStatus): void {
		linkStore.status = status;
		if (devicePeqStore.connection?.connectionType !== 'link') return;
		const store = devicePeqStore;
		store.isConnecting = status.busy === 'connect';
		store.isReading = status.busy === 'read';
		store.isWriting = status.busy === 'write';
		store.isSwitching = status.busy === 'switch';
		store.activeSlot = status.activeSlot;
		store.deviceSlot = status.deviceSlot;
		store.eqEnabled = status.eqEnabled;
		store.needsReconnect = status.needsReconnect;
		store.autoPaused = status.auto.paused;
		store.autoClipRisk = status.auto.clipRisk;
		store.autoStopped = status.auto.stopped;
		store.reportedInSync = status.inSync;
		const failure = status.failure;
		const key = failure && `${failure.op}:${failure.code}`;
		if (key === this.#failureKey) return;
		this.#failureKey = key;
		if (failure) devicePeqService.fail(new LinkCommandError(failure.code), failure.op);
		else if (store.statusIsError) store.setStatus(null);
	}
}

export const linkService = new LinkService();
