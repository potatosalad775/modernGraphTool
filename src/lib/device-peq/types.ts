/**
 * Device PEQ types — the app's view of a connected EQ device.
 *
 * USB HID, USB / Bluetooth serial and BLE devices are driven by `@potatosalad775/eqcaps-device-bridge`
 * and described by their eqcaps profile. Network devices (WiiM, Luxsin) aren't in eqcaps yet, so
 * `network.ts` drives them itself behind the same `PeqDevice` shape, and a device connected in
 * uniPEQ is reached over the link (`link.ts`). The UI never needs to know which.
 */
import type { Profile } from '@potatosalad775/eqcaps-core';
import type {
	DeviceCapabilities,
	DeviceIdentity,
	PullRequest,
	PullResult,
	PushRequest,
	PushResult
} from '@potatosalad775/eqcaps-device-bridge';

export type { PullResult, PushRequest, PushResult, DeviceIdentity };

/** Connection type for device communication */
export type ConnectionType = 'hid' | 'serial' | 'ble' | 'network' | 'link';

/** What a device can do: the bridge's capability flags, minus what only the bridge reads. */
export type PeqCapabilities = Pick<
	DeviceCapabilities,
	| 'canRead'
	| 'canWrite'
	| 'readsPreamp'
	| 'readsSlot'
	| 'writesPreamp'
	| 'writesSlot'
	| 'readsCurrentSlot'
	| 'readsEnabled'
	| 'canEnable'
	| 'slots'
	| 'disconnectOnSave'
	| 'experimental'
>;

/**
 * A connected device. The bridge's `BridgeDevice` satisfies this as is. Every value in and out is a
 * written value in eqcaps units (Hz, dB, RBJ Q, `LSC`/`HSC`); pushes are `fit` + `complete`d
 * first, since the bridge never clamps or pads (`push-plan.ts`).
 */
export interface PeqDevice {
	readonly capabilities: PeqCapabilities;
	pull(request?: PullRequest): Promise<PullResult>;
	push(request: PushRequest): Promise<PushResult>;
	/**
	 * The active preset slot; null when the protocol can't say, or on some bypass-preset protocols
	 * when the EQ is off. Where the EQ switch is its own state (`readsEnabled`), the preset whether
	 * the EQ is on or off.
	 */
	currentSlot(): Promise<number | null>;
	/** Whether the EQ is on (`readsEnabled`); null when the protocol or device doesn't say. */
	eqEnabled(): Promise<boolean | null>;
	setEnabled(enabled: boolean, slot?: number): Promise<void>;
	close(): Promise<void>;
}

/**
 * How sure we are about what the device accepts.
 *
 * - `device`: its own eqcaps profile.
 * - `group`: a profile for a family of devices its identity can't tell apart (a chipset scheme).
 * - `guess`: no profile; the vendor's usual protocol, with limits from what that protocol's write
 *   frames can carry. Experimental.
 * - `builtin`: a network device described in this repo.
 * - `demo`: uniPEQ's demo device, over the link.
 */
export type ProfileSource = 'device' | 'group' | 'guess' | 'builtin' | 'demo';

export interface DeviceConnection {
	device: PeqDevice;
	connectionType: ConnectionType;
	/** "FiiO KA17", or the USB product name for a guessed device. */
	name: string;
	/** What the device accepts. Always present: a guessed device gets one from its protocol. */
	profile: Profile;
	profileSource: ProfileSource;
	/** The eqcaps id of `profile`, when it came from the database. */
	profileId: string | null;
	/** What the device reported about itself, for an issue report. */
	identity: DeviceIdentity;
	/**
	 * Re-open the same device without the browser's chooser, after it dropped (HID only). With
	 * `wait`, for a device restarting to save: the handle it had is skipped, and it gets until the
	 * timeout to come back. Null if it isn't there, or the browser no longer grants it.
	 */
	reopen?: (wait?: ReopenWait) => Promise<DeviceConnection | null>;
	/**
	 * Calls `listener` once when the device goes on its own (unplugged, out of range), where the
	 * browser reports it; returns the unsubscribe.
	 */
	onLost?: (listener: () => void) => () => void;
}

/** How `reopen` waits for a device that restarts to save. */
export interface ReopenWait {
	timeoutMs: number;
}

/** A profile the user can pick when a device's identity matched several, or none (serial ports). */
export interface DeviceCandidate {
	id: string;
	label: string;
}
