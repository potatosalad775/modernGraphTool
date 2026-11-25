/**
 * Device PEQ Store — the connected EQ device and what the panel is doing with it.
 *
 * Connecting makes the device's eqcaps profile the active EQ constraint, and disconnecting
 * restores the user's own pick. Here rather than in the Hardware EQ panel, so it holds however the
 * connection ends and whether or not the panel is mounted. It never edits the filters: bands that
 * don't fit are flagged, and the user fits them when they choose to.
 */
import type { ConnectResult } from '#lib/device-peq/connect.js';
import { readRequest, writeRequest, type PresetRequest } from '#lib/device-peq/preset.js';
import { drivesChannelsApart, type Layout } from '#lib/device-peq/push-plan.js';
import type { DeviceCandidate, DeviceConnection } from '#lib/device-peq/types.js';
import { eqFiltersEqual, type EQFilter } from '#lib/utils/equalizer.js';
import { deviceControls, eqControls } from '#lib/device-peq/controls.js';
import { OWN_EQ, deviceEqs, type DeviceEq, type EqTarget } from '#lib/device-peq/device-eqs.js';
import { eqDisabledBy, type Control } from '@potatosalad775/eqcaps-core';
import type { Slot } from '@potatosalad775/eqcaps-device-bridge';
import { eqConstraintsStore } from './eq-constraints-store.svelte.js';
import { eqStore } from './eq-store.svelte.js';
import { linkStore } from './link-store.svelte.js';

/**
 * What the Device EQ control shows: a listed preset (by id), the EQ off, a preset the device is
 * on that isn't listed (a built-in one), or null when the device can't say.
 */
export type DeviceEqSelection = number | 'off' | 'other' | null;

/** The device's identity fit several profiles, or none: the user says which it is. */
export interface DeviceChoice {
	candidates: DeviceCandidate[];
	finish: (id: string) => Promise<ConnectResult>;
	cancel: () => Promise<void>;
}

/** The band list and preamp as they were when last read from or written to the device. */
export interface DeviceSnapshot {
	filters: EQFilter[];
	preamp: number;
}

/** The device as it was opened, and which of its EQs `connection` views it as. */
interface Opened {
	conn: DeviceConnection;
	eq: EqTarget;
	/** The listed EQs the device's current mode lacks. */
	absent: readonly string[];
}

class DevicePeqStore {
	/**
	 * The connected device, viewed as the one of its EQs that Hardware EQ reaches: that EQ's
	 * profile, presets and operations. For a device with one EQ, the device as it was opened.
	 */
	connection = $state.raw<DeviceConnection | null>(null);
	#opened = $state.raw<Opened | null>(null);
	/**
	 * The presets a device that keeps a list of its own holds now, under its own names, bypass
	 * preset included. Null for every other device, whose presets are the profile's.
	 */
	#listed = $state.raw<readonly Slot[] | null>(null);
	isConnecting = $state(false);
	isReading = $state(false);
	isWriting = $state(false);
	isSwitching = $state(false);
	/** One of the device's own settings is being changed. */
	isSettingControl = $state(false);
	/**
	 * The device's settings as last read, by control id; null for one it doesn't have right now.
	 * Empty until read, and for a device with none.
	 */
	controlValues = $state.raw<Record<string, number | null>>({});
	/** A connection waiting on the user to say which profile the device is. */
	choice = $state.raw<DeviceChoice | null>(null);
	/** The listed preset reads and writes target; null when the device lists none. */
	activeSlot = $state<number | null>(null);
	/**
	 * The preset the device is on, as it last reported or was told: may be unlisted (a built-in
	 * preset) or the bypass preset. Null when unknown. Protocols that only read and write the
	 * current preset can reach `activeSlot` only while this equals it.
	 */
	deviceSlot = $state<number | null>(null);
	/** Whether the device's EQ is on, when known. */
	eqEnabled = $state<boolean | null>(null);
	/** What the device held after the last read or write, to tell whether the list has moved on. */
	synced = $state.raw<DeviceSnapshot | null>(null);
	/**
	 * The target preset's bands as read before a write, kept so later writes (auto-write above all)
	 * don't read again. Null hints: the preset couldn't be read. Dropped on any preset change.
	 */
	layout = $state.raw<{ slot: number | null; hints: Layout | null } | null>(null);
	/** Auto-write found a list the device can't hold exactly, and waits for a reviewed write. */
	autoPaused = $state(false);
	/** The last automatic write boosts with no way to lower the device's level. */
	autoClipRisk = $state(false);
	/**
	 * An automatic write failed, so auto-write is off until switched back on or the next connection.
	 * Kept out of the saved setting: one dropped connection shouldn't turn it off in later sessions.
	 */
	autoStopped = $state(false);
	/** The last operation's outcome, until the next one. */
	statusMessage = $state<string | null>(null);
	/** Whether `statusMessage` reports a failure, which outranks every other status line. */
	statusIsError = $state(false);
	/**
	 * The device dropped the connection after saving (some do by design), so the next operation
	 * needs a fresh one. The connection itself is kept for its name and `reopen`.
	 */
	needsReconnect = $state(false);
	/**
	 * Whether the device holds the list, as uniPEQ reports it over the link: it writes the device,
	 * so only it knows. Undefined when this page writes the device and works it out from `synced`.
	 */
	reportedInSync = $state<boolean | null | undefined>(undefined);
	/**
	 * The user's own answer to whether this page's sound plays through a device, by device name.
	 * Kept across a dropped connection, so the same device coming back doesn't ask again.
	 */
	audioPathChoice = $state.raw<{ device: string; through: boolean } | null>(null);

	/** The device as it was opened, whichever of its EQs is viewed: what `reopen` and `onLost` are of. */
	get opened(): DeviceConnection | null {
		return this.#opened?.conn ?? null;
	}

	/** The id of the EQ `connection` views; undefined for the one the profile describes. */
	get eq(): string | undefined {
		return this.#opened?.eq.id;
	}

	/** The device's EQs, the profile's own first. One entry for all but a few devices. */
	get eqs(): DeviceEq[] {
		const opened = this.#opened;
		return opened ? deviceEqs(opened.conn, opened.absent) : [];
	}

	/**
	 * The EQ reached holds a filter set per channel and the device writes them apart, so left- and
	 * right-only bands are read and written as they are.
	 */
	get perChannel(): boolean {
		const conn = this.connection;
		return !!conn && drivesChannelsApart(conn.profile, conn.device.capabilities);
	}

	get isConnected(): boolean {
		return this.connection !== null;
	}

	/**
	 * Whether this page's sound is taken to play through the connected device. Nothing can detect
	 * the audio route, so it is the user's answer when they gave one, else a guess from the
	 * connection: a device connected in this browser is on this machine; one uniPEQ holds over the
	 * link may be anywhere, unless this page opened that uniPEQ itself (`linkStore.launchedHere`).
	 */
	get audioThroughDevice(): boolean {
		const conn = this.connection;
		if (!conn) return false;
		const choice = this.audioPathChoice;
		if (choice?.device === conn.name) return choice.through;
		return conn.connectionType !== 'link' || linkStore.launchedHere;
	}

	/**
	 * The device is applying its EQ to what this page plays, so the audio player must not apply the
	 * list a second time. An EQ switch the device can't report counts as on.
	 */
	get playsEq(): boolean {
		return this.audioThroughDevice && this.eqEnabled !== false;
	}

	setAudioThroughDevice(through: boolean): void {
		const device = this.connection?.name;
		if (device !== undefined) this.audioPathChoice = { device, through };
	}

	/**
	 * A connection made in this browser is under way or in place: connecting, waiting on a profile
	 * choice, or connected. A device uniPEQ holds over the link doesn't count. Hardware EQ holds one
	 * connection at a time, so the uniPEQ link doesn't start while this is true, and nothing connects
	 * here while the link is active.
	 */
	get localActive(): boolean {
		const conn = this.connection;
		if (conn) return conn.connectionType !== 'link';
		return this.isConnecting || this.choice !== null;
	}

	get isBusy(): boolean {
		return (
			this.isConnecting ||
			this.isReading ||
			this.isWriting ||
			this.isSwitching ||
			this.isSettingControl
		);
	}

	/** The settings the device has right now: those whose last read gave a value. */
	get controls(): Control[] {
		const values = this.controlValues;
		return (this.connection?.device.capabilities.controls ?? []).filter(
			(c) => typeof values[c.id] === 'number'
		);
	}

	/** The device's own settings, as opposed to those of one of its EQs. */
	get deviceControls(): Control[] {
		return deviceControls(this.controls);
	}

	/** The settings of the EQ being edited (a headroom, a crossfeed), shown with Device EQ. */
	get eqControls(): Control[] {
		return eqControls(this.controls, this.eq);
	}

	/** The settings whose current value stops the device applying its EQ. */
	get eqOffBy(): Control[] {
		return eqDisabledBy(this.controls, this.controlValues);
	}

	get deviceName(): string | null {
		return this.connection?.name ?? null;
	}

	/** EQ memories to read from and write to — the bypass preset is the off switch, not one. */
	get slots(): Slot[] {
		return this.#allSlots.filter((s) => !s.bypass);
	}

	/** The device's presets as they are now, the bypass one included. */
	get #allSlots(): readonly Slot[] {
		return this.#listed ?? this.connection?.device.capabilities.slots ?? [];
	}

	/** Presets can be added, renamed and deleted on this device. */
	get canEditPresets(): boolean {
		return !!this.connection?.device.capabilities.editsSlots && this.#listed !== null;
	}

	/** How many presets the device has room for, where it keeps a list; null where they are fixed. */
	get slotRoom(): number | null {
		const caps = this.connection?.device.capabilities;
		if (!caps || this.#listed === null) return null;
		return caps.slots.filter((s) => !s.bypass).length;
	}

	/**
	 * The memories a write may target: the user presets eqcaps marks `writable`, not the built-in
	 * curves. A profile that marks none (all memories, a guessed device) leaves every preset but the
	 * bypass one writable (eqcaps SPEC §9). The bridge doesn't enforce the marks.
	 */
	get writableSlots(): Slot[] {
		const marked = this.slots.filter((s) => s.writable);
		return marked.length ? marked : this.slots;
	}

	/** Whether the target preset is one a write may reach; true for a device without presets. */
	get targetWritable(): boolean {
		const slot = this.activeSlot;
		return slot === null || this.writableSlots.some((s) => s.id === slot);
	}

	/** How Read reaches what Device EQ shows, or null when it can't from where the device is. */
	get readTarget(): PresetRequest | null {
		const caps = this.connection?.device.capabilities;
		if (!caps) return null;
		// A built-in preset is read where the device is: it's what the control shows.
		if (this.selection === 'other') return caps.canRead ? {} : null;
		return readRequest(caps, this.activeSlot, this.deviceSlot);
	}

	/**
	 * How Write reaches the target preset, or null when it can't from where the device is, or the
	 * target is a built-in preset. Never retargets: picking another preset is the user's call.
	 */
	get writeTarget(): PresetRequest | null {
		const caps = this.connection?.device.capabilities;
		if (!caps || !this.targetWritable) return null;
		return writeRequest(caps, this.activeSlot, this.deviceSlot);
	}

	/** Whether the list still matches the last read or write; null before either. */
	get inSync(): boolean | null {
		if (this.reportedInSync !== undefined) return this.reportedInSync;
		const synced = this.synced;
		if (!synced) return null;
		const preampMatters = this.connection?.device.capabilities.writesPreamp ?? false;
		return (
			synced.filters.length === eqStore.filters.length &&
			synced.filters.every((f, i) => eqFiltersEqual(f, eqStore.filters[i])) &&
			(!preampMatters || synced.preamp === eqStore.preamp)
		);
	}

	get selection(): DeviceEqSelection {
		if (this.eqEnabled === false) return 'off';
		const d = this.deviceSlot;
		if (d !== null && this.slots.length > 0 && !this.slots.some((s) => s.id === d)) return 'other';
		if (this.eqEnabled === null && this.connection?.device.capabilities.canEnable) return null;
		return this.activeSlot;
	}

	/**
	 * `connection` is the device viewed as the EQ to reach first; `of` says which that is and how
	 * the device was opened, where that is not `connection` itself (another band count, another EQ).
	 * `enabled` is the device's EQ switch where it reads one (`readsEnabled`); otherwise whether the
	 * EQ is on follows from the preset.
	 */
	setConnected(
		connection: DeviceConnection,
		currentSlot: number | null,
		enabled: boolean | null = null,
		of: Opened = { conn: connection, eq: OWN_EQ, absent: [] },
		listed: readonly Slot[] | null = null
	): void {
		this.#opened = of;
		this.controlValues = {};
		this.autoStopped = false;
		this.#view(connection, currentSlot, enabled, listed);
	}

	/**
	 * Reach another of the device's EQs from now on: `connection` is the device viewed as `eq`.
	 * Everything about the EQ starts over as on connecting (its preset, its switch, whether it holds
	 * the list); the device's own settings and the band list stay. `absent`, where the device was
	 * asked again, replaces the EQs known to be missing.
	 */
	selectEq(
		connection: DeviceConnection,
		eq: EqTarget,
		currentSlot: number | null,
		enabled: boolean | null,
		absent?: readonly string[],
		listed: readonly Slot[] | null = null
	): void {
		const opened = this.#opened;
		if (!opened) return;
		this.#opened = { ...opened, eq, absent: absent ?? opened.absent };
		this.#view(connection, currentSlot, enabled, listed);
	}

	/**
	 * The device's preset list was read again, after one was added, renamed or deleted. A rename
	 * changes only names (`keep`): the target and whether it holds the list stand. Anything else
	 * may have moved the device and renumbered the presets after a deleted one, so the target is the
	 * preset the device is on now, and what it holds is unknown until a read or a write.
	 */
	relisted(
		listed: readonly Slot[],
		currentSlot: number | null,
		enabled: boolean | null,
		keep = false
	): void {
		this.#listed = listed;
		if (keep) return;
		this.#place(currentSlot, enabled);
		this.synced = null;
		this.layout = null;
		this.autoPaused = false;
	}

	/** Where the device is: the preset it plays, the one Read and Write reach, and its EQ switch. */
	#place(currentSlot: number | null, enabled: boolean | null): void {
		const bypass = this.#allSlots.find((s) => s.bypass);
		// A device reading back its bypass preset has its EQ off, and no memory is selected.
		const onBypass = currentSlot === bypass?.id;
		const listed = this.slots.some((s) => s.id === currentSlot);
		this.deviceSlot = currentSlot;
		this.activeSlot = listed ? currentSlot : (this.writableSlots[0]?.id ?? null);
		this.eqEnabled = enabled ?? (onBypass ? false : currentSlot !== null ? true : null);
	}

	#view(
		connection: DeviceConnection,
		currentSlot: number | null,
		enabled: boolean | null,
		listed: readonly Slot[] | null
	): void {
		this.connection = connection;
		this.#listed = listed;
		this.isConnecting = false;
		this.needsReconnect = false;
		this.#place(currentSlot, enabled);
		this.synced = null;
		this.layout = null;
		this.autoPaused = false;
		this.autoClipRisk = false;
		this.statusMessage = null;
		this.statusIsError = false;
		this.reportedInSync = undefined;
		eqConstraintsStore.setDeviceConstraint(
			connection.profile,
			connection.name,
			drivesChannelsApart(connection.profile, connection.device.capabilities)
		);
	}

	/** The device was switched to `slot` (undefined: EQ on, no preset named) or its EQ off. */
	played(choice: number | 'off' | undefined): void {
		if (choice === 'off') {
			this.eqEnabled = false;
			const bypass = this.#allSlots.find((s) => s.bypass);
			if (bypass) this.deviceSlot = bypass.id;
			return;
		}
		// Back from a bypass preset or a built-in one: what it reads there may differ.
		if (choice !== this.deviceSlot) this.layout = null;
		this.eqEnabled = true;
		if (choice === undefined) return;
		this.deviceSlot = choice;
		this.target(choice);
	}

	/**
	 * Read and write `slot` from now on. What the device held there is no longer known, and the last
	 * read or write's message ("Wrote 6 bands") was about another preset.
	 */
	target(slot: number): void {
		if (this.activeSlot === slot) return;
		this.activeSlot = slot;
		this.synced = null;
		this.layout = null;
		this.autoPaused = false;
		this.setStatus(null);
	}

	setDisconnected(): void {
		this.connection = null;
		this.#opened = null;
		this.#listed = null;
		this.isConnecting = false;
		this.isReading = false;
		this.isWriting = false;
		this.isSwitching = false;
		this.isSettingControl = false;
		this.controlValues = {};
		this.activeSlot = null;
		this.deviceSlot = null;
		this.eqEnabled = null;
		this.synced = null;
		this.layout = null;
		this.autoPaused = false;
		this.autoClipRisk = false;
		this.autoStopped = false;
		this.statusMessage = null;
		this.statusIsError = false;
		this.needsReconnect = false;
		this.reportedInSync = undefined;
		eqConstraintsStore.clearDeviceConstraint();
	}

	setStatus(message: string | null, isError = false): void {
		this.statusMessage = message;
		this.statusIsError = message !== null && isError;
	}
}

export const devicePeqStore = new DevicePeqStore();
