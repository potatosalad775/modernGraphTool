/**
 * The uniPEQ link as the UI sees it: where the session is, what uniPEQ reports, and what the user
 * has to answer. `services/link-service.svelte.ts` writes it; nothing else does. Here rather than
 * in a panel, because panels unmount on every switch and the link outlives them.
 *
 * Only types come from `peq-link`, so this store costs the boot bundle nothing but itself.
 */
import type { Ended, HostState, LinkDevice, LinkStatus } from 'peq-link/client';

/** `idle` before the first Link press; the rest are the client's `HostState`. */
export type LinkPhase = 'idle' | HostState;

/** The session's first list differs from this page's: which one the link keeps. */
export interface LinkChoice {
	/** Bands uniPEQ has. */
	theirs: number;
	/** Switched-off bands that "Send this EQ" sends as 0 dB bands. */
	flattened: number;
	/** One-ear bands (and switched-off pass or notch bands) that "Send this EQ" leaves out. */
	dropped: number;
}

class LinkStore {
	phase = $state<LinkPhase>('idle');
	/** The room code, while there is one. */
	room = $state<string | null>(null);
	/** The Worker the room is on. */
	server = $state<string | null>(null);
	/** uniPEQ's version, from its `hello`. */
	unipeqVersion = $state<string | null>(null);
	/** uniPEQ's device, or null when it has none. */
	device = $state.raw<LinkDevice | null>(null);
	/** uniPEQ sent a device whose profile this page can't use, so Hardware EQ doesn't show it. */
	deviceRejected = $state(false);
	status = $state.raw<LinkStatus | null>(null);
	/** How the last session ended; null while one is running or before the first. */
	ended = $state.raw<Ended | null>(null);
	/** Android paused uniPEQ for this long, by the self-check's last report. */
	pausedMs = $state<number | null>(null);
	/** The start dialog's question, while it is open. */
	choice = $state.raw<LinkChoice | null>(null);
	/** Starting the link failed before a room existed (the client didn't load). */
	failed = $state(false);

	/** uniPEQ approved and the session hasn't ended: the shared list is the list. */
	get linked(): boolean {
		return this.phase === 'linked' || this.phase === 'stalled';
	}

	/** A room exists and no one has ended it. */
	get active(): boolean {
		return this.phase !== 'idle' && this.phase !== 'ended';
	}

	/** Linked, but uniPEQ takes no edits now (its device is reconnecting). */
	get readOnly(): boolean {
		return this.linked && this.status !== null && !this.status.editable;
	}

	/** A new session: everything the last one reported is gone. */
	reset(): void {
		this.phase = 'idle';
		this.room = null;
		this.server = null;
		this.unipeqVersion = null;
		this.device = null;
		this.deviceRejected = false;
		this.status = null;
		this.ended = null;
		this.pausedMs = null;
		this.choice = null;
		this.failed = false;
	}
}

export const linkStore = new LinkStore();
