import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { devicePeqStore } from './device-peq-store.svelte.js';
import { linkStore } from './link-store.svelte.js';
import {
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID,
	DEVICE_CONSTRAINT_ID,
	eqConstraintsStore
} from './eq-constraints-store.svelte.js';
import type { DeviceConnection, PeqCapabilities, Slot } from '#lib/device-peq/types.js';
import { hardwareProfile } from '#lib/utils/__fixtures__/eq-profiles.js';

const CAPS: PeqCapabilities = {
	canRead: true,
	canWrite: true,
	readsPreamp: false,
	readsSlot: false,
	writesPreamp: true,
	writesSlot: false,
	readsCurrentSlot: true,
	readsEnabled: false,
	canEnable: true,
	slots: [
		{ id: 0, name: 'Jazz' },
		{ id: 160, name: 'USER1' },
		{ id: 240, name: 'BYPASS', bypass: true }
	],
	disconnectOnSave: false,
	experimental: false
};

function makeConnection(overrides: Partial<DeviceConnection> = {}): DeviceConnection {
	return {
		device: {
			capabilities: CAPS,
			pull: vi.fn(),
			push: vi.fn(),
			currentSlot: vi.fn(),
			eqEnabled: vi.fn(),
			setEnabled: vi.fn(),
			close: vi.fn()
		},
		connectionType: 'hid',
		name: 'FiiO KA17',
		profile: hardwareProfile('fiio-ka17', { bandCount: 10 }),
		profileSource: 'device',
		profileId: 'fiio-ka17',
		identity: {},
		...overrides
	};
}

describe('devicePeqStore', () => {
	beforeEach(() => {
		devicePeqStore.setDisconnected();
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
	});

	it('starts disconnected', () => {
		expect(devicePeqStore.isConnected).toBe(false);
		expect(devicePeqStore.deviceName).toBeNull();
		expect(devicePeqStore.slots).toEqual([]);
	});

	it('connecting makes the device’s profile the active constraint', () => {
		devicePeqStore.setConnected(makeConnection(), 160);
		expect(devicePeqStore.isConnected).toBe(true);
		expect(devicePeqStore.deviceName).toBe('FiiO KA17');
		expect(eqConstraintsStore.activeId).toBe(DEVICE_CONSTRAINT_ID);
		expect(eqConstraintsStore.active.label).toBe('FiiO KA17');
		expect(eqConstraintsStore.maxBands).toBe(10);
	});

	it('lists the EQ memories without the bypass preset', () => {
		devicePeqStore.setConnected(makeConnection(), 160);
		expect(devicePeqStore.slots.map((s) => s.name)).toEqual(['Jazz', 'USER1']);
		expect(devicePeqStore.activeSlot).toBe(160);
		expect(devicePeqStore.eqEnabled).toBe(true);
	});

	it('reads a device sitting on its bypass preset as EQ off, targeting the first memory', () => {
		devicePeqStore.setConnected(makeConnection(), 240);
		expect(devicePeqStore.eqEnabled).toBe(false);
		expect(devicePeqStore.activeSlot).toBe(0);
	});

	it('does not know whether EQ is on when the device can’t say', () => {
		devicePeqStore.setConnected(makeConnection(), null);
		expect(devicePeqStore.eqEnabled).toBeNull();
		expect(devicePeqStore.activeSlot).toBe(0);
	});

	it('shows a device on a preset it doesn’t list as on a built-in one, targeting the first memory', () => {
		devicePeqStore.setConnected(makeConnection(), 5);
		expect(devicePeqStore.selection).toBe('other');
		expect(devicePeqStore.deviceSlot).toBe(5);
		expect(devicePeqStore.activeSlot).toBe(0);
	});

	it('shows what the device plays: a memory, off, or unknown', () => {
		devicePeqStore.setConnected(makeConnection(), 160);
		expect(devicePeqStore.selection).toBe(160);
		devicePeqStore.setConnected(makeConnection(), 240);
		expect(devicePeqStore.selection).toBe('off');
		devicePeqStore.setConnected(makeConnection(), null);
		expect(devicePeqStore.selection).toBeNull();
	});

	describe('an EQ switch of its own', () => {
		it('shows Off on the preset the device stays on, and Read still reaches it', () => {
			devicePeqStore.setConnected(makeConnection(), 160, false);
			expect(devicePeqStore.selection).toBe('off');
			expect(devicePeqStore.eqEnabled).toBe(false);
			expect(devicePeqStore.deviceSlot).toBe(160);
			expect(devicePeqStore.activeSlot).toBe(160);
			expect(devicePeqStore.readTarget).toEqual({});
		});

		it('takes the switch over what the preset would say', () => {
			devicePeqStore.setConnected(makeConnection(), 240, true);
			expect(devicePeqStore.eqEnabled).toBe(true);
		});

		it('falls back on the preset when the switch is unknown', () => {
			devicePeqStore.setConnected(makeConnection(), 160, null);
			expect(devicePeqStore.eqEnabled).toBe(true);
			devicePeqStore.setConnected(makeConnection(), 240, null);
			expect(devicePeqStore.eqEnabled).toBe(false);
		});
	});

	describe('a device on no preset', () => {
		/** A Qudelix: Flat, then its user presets. After any edit it is on none, and says so. */
		const qudelix = () => {
			const connection = makeConnection();
			const capabilities: PeqCapabilities = {
				...CAPS,
				readsSlot: false,
				writesSlot: true,
				readsEnabled: true,
				slots: [
					{ id: 0, name: 'Flat' },
					{ id: 22, name: 'Custom #1', writable: true },
					{ id: 23, name: 'Custom #2', writable: true }
				]
			};
			return { ...connection, device: { ...connection.device, capabilities } };
		};

		it('shows Unsaved EQ, and reads and writes the EQ it plays, not a preset', () => {
			devicePeqStore.setConnected(qudelix(), 'unsaved', true);
			expect(devicePeqStore.selection).toBe('unsaved');
			expect(devicePeqStore.activeSlot).toBeNull();
			expect(devicePeqStore.readTarget).toEqual({});
			expect(devicePeqStore.writeTarget).toEqual({});
		});

		it('follows the device off its preset when it reports none, and back', () => {
			devicePeqStore.setConnected(qudelix(), 22, true);
			devicePeqStore.synced = { filters: [], preamp: 0 };

			devicePeqStore.reported('unsaved', true);
			expect(devicePeqStore.selection).toBe('unsaved');
			expect(devicePeqStore.writeTarget).toEqual({});
			// What the device holds now is no longer what was last read or written.
			expect(devicePeqStore.inSync).toBeNull();

			devicePeqStore.reported(23, true);
			expect(devicePeqStore.selection).toBe(23);
			expect(devicePeqStore.writeTarget).toEqual({ slot: 23 });
		});

		it('leaves things as they were when the device can’t say where it is', () => {
			devicePeqStore.setConnected(qudelix(), 22, true);
			devicePeqStore.reported(null, null);
			expect(devicePeqStore.selection).toBe(22);
			expect(devicePeqStore.writeTarget).toEqual({ slot: 22 });
		});
	});

	describe('built-in presets', () => {
		const marked = (): DeviceConnection => {
			const connection = makeConnection();
			return {
				...connection,
				device: {
					...connection.device,
					capabilities: {
						...CAPS,
						writesSlot: true,
						slots: [
							{ id: 0, name: 'Jazz' },
							{ id: 160, name: 'USER1', writable: true },
							{ id: 161, name: 'USER2', writable: true },
							{ id: 240, name: 'BYPASS', bypass: true }
						]
					}
				}
			};
		};

		it('won’t write the built-in preset the device is on, but still reads it', () => {
			devicePeqStore.setConnected(marked(), 0);
			expect(devicePeqStore.activeSlot).toBe(0);
			expect(devicePeqStore.targetWritable).toBe(false);
			expect(devicePeqStore.writeTarget).toBeNull();
			expect(devicePeqStore.readTarget).toEqual({});
		});

		it('writes once the user picks one of their own', () => {
			devicePeqStore.setConnected(marked(), 0);
			devicePeqStore.target(161);
			expect(devicePeqStore.writeTarget).toEqual({ slot: 161 });
		});

		it('targets the first writable preset when the device is on none it lists', () => {
			devicePeqStore.setConnected(marked(), 240);
			expect(devicePeqStore.activeSlot).toBe(160);
			expect(devicePeqStore.writeTarget).toEqual({ slot: 160 });
		});

		it('treats every preset but the bypass as writable when the profile marks none', () => {
			devicePeqStore.setConnected(makeConnection(), 0);
			expect(devicePeqStore.writableSlots.map((s) => s.id)).toEqual([0, 160]);
			expect(devicePeqStore.targetWritable).toBe(true);
			expect(devicePeqStore.writeTarget).toEqual({});
		});
	});

	it('follows a switch, and forgets what it knew of the old preset', () => {
		devicePeqStore.setConnected(makeConnection(), 0);
		devicePeqStore.synced = { filters: [], preamp: 0 };
		devicePeqStore.played('off');
		expect(devicePeqStore.selection).toBe('off');
		expect(devicePeqStore.deviceSlot).toBe(240);
		expect(devicePeqStore.synced).not.toBeNull();
		devicePeqStore.played(160);
		expect(devicePeqStore.selection).toBe(160);
		expect(devicePeqStore.deviceSlot).toBe(160);
		expect(devicePeqStore.synced).toBeNull();
	});

	it('drops the last message when Read and Write move to another preset', () => {
		devicePeqStore.setConnected(makeConnection(), 0);
		devicePeqStore.setStatus('Wrote 6 band(s) to the device');
		devicePeqStore.target(0);
		expect(devicePeqStore.statusMessage).not.toBeNull();
		devicePeqStore.target(160);
		expect(devicePeqStore.statusMessage).toBeNull();
	});

	it('disconnecting clears everything and restores the user’s constraint', () => {
		eqConstraintsStore.activeId = 'generic-10-band';
		devicePeqStore.setConnected(makeConnection(), 0);
		devicePeqStore.isReading = true;
		devicePeqStore.needsReconnect = true;
		devicePeqStore.setStatus('busy');

		devicePeqStore.setDisconnected();
		expect(devicePeqStore.connection).toBeNull();
		expect(devicePeqStore.isReading).toBe(false);
		expect(devicePeqStore.needsReconnect).toBe(false);
		expect(devicePeqStore.statusMessage).toBeNull();
		expect(eqConstraintsStore.activeId).toBe('generic-10-band');
	});

	it('a fresh connection clears a pending reconnect', () => {
		devicePeqStore.setConnected(makeConnection(), 0);
		devicePeqStore.needsReconnect = true;
		devicePeqStore.setConnected(makeConnection(), 0);
		expect(devicePeqStore.needsReconnect).toBe(false);
	});

	it('is busy while connecting, reading or writing', () => {
		expect(devicePeqStore.isBusy).toBe(false);
		devicePeqStore.isWriting = true;
		expect(devicePeqStore.isBusy).toBe(true);
	});

	describe('a device that keeps its presets as a list', () => {
		/** The places the device has room for, and the bypass preset of the data. */
		const PLACES: Slot[] = [
			{ id: 0, name: 'EQ 1' },
			{ id: 1, name: 'EQ 2' },
			{ id: 2, name: 'EQ 3' },
			{ id: 3, name: 'EQ 4' },
			{ id: 9, name: 'Off', bypass: true }
		];
		const OFF: Slot = { id: 9, name: 'Off', bypass: true };
		const HELD: Slot[] = [
			{ id: 0, name: 'Jazz' },
			{ id: 1, name: 'Rock' },
			{ id: 2, name: 'Pop' },
			OFF
		];
		const names = (slots: readonly Slot[]) => slots.map((s) => s.name);

		const listing = (caps: Partial<PeqCapabilities> = {}): DeviceConnection => {
			const connection = makeConnection();
			return {
				...connection,
				device: {
					...connection.device,
					capabilities: { ...CAPS, slots: PLACES, listsSlots: true, editsSlots: true, ...caps }
				}
			};
		};

		describe('what it shows', () => {
			it('lists what the device holds, not the places it has room for', () => {
				devicePeqStore.setConnected(listing(), 1, null, undefined, HELD);
				expect(names(devicePeqStore.slots)).toEqual(['Jazz', 'Rock', 'Pop']);
				expect(devicePeqStore.selection).toBe(1);
			});

			it('keeps the bypass preset out of the list when it comes from the live one', () => {
				devicePeqStore.setConnected(listing(), 1, null, undefined, HELD);
				expect(devicePeqStore.slots.some((s) => s.bypass)).toBe(false);
				expect(devicePeqStore.slots).toHaveLength(3);
			});

			it('reads a device sitting on the live list’s bypass preset as EQ off', () => {
				devicePeqStore.setConnected(listing(), 9, null, undefined, HELD);
				expect(devicePeqStore.eqEnabled).toBe(false);
				expect(devicePeqStore.selection).toBe('off');
				expect(devicePeqStore.activeSlot).toBe(0);
			});

			it('switches to the live list’s bypass preset for Off', () => {
				devicePeqStore.setConnected(listing(), 1, null, undefined, HELD);
				devicePeqStore.played('off');
				expect(devicePeqStore.deviceSlot).toBe(9);
				expect(devicePeqStore.selection).toBe('off');
			});

			it('keeps the profile’s presets when no list was read', () => {
				devicePeqStore.setConnected(listing(), 1);
				expect(names(devicePeqStore.slots)).toEqual(['EQ 1', 'EQ 2', 'EQ 3', 'EQ 4']);
			});

			it('shows a preset the live list lacks as a built-in one', () => {
				devicePeqStore.setConnected(listing(), 3, null, undefined, HELD);
				expect(devicePeqStore.selection).toBe('other');
				expect(devicePeqStore.activeSlot).toBe(0);
			});

			it('forgets the list on disconnecting and on a connection without one', () => {
				devicePeqStore.setConnected(listing(), 1, null, undefined, HELD);
				devicePeqStore.setDisconnected();
				expect(devicePeqStore.slots).toEqual([]);

				devicePeqStore.setConnected(listing(), 1, null, undefined, HELD);
				devicePeqStore.setConnected(listing(), 1);
				expect(names(devicePeqStore.slots)).toEqual(['EQ 1', 'EQ 2', 'EQ 3', 'EQ 4']);
				expect(devicePeqStore.canEditPresets).toBe(false);
			});

			it('takes the list of another EQ on a switch, or none', () => {
				const connection = listing();
				devicePeqStore.setConnected(connection, 1, null, undefined, HELD);
				const eq = { id: 'spk', bandCount: null };

				devicePeqStore.selectEq(connection, eq, 0, null, undefined, [{ id: 0, name: 'Spk A' }]);
				expect(names(devicePeqStore.slots)).toEqual(['Spk A']);
				expect(devicePeqStore.canEditPresets).toBe(true);

				devicePeqStore.selectEq(connection, eq, 0, null);
				expect(names(devicePeqStore.slots)).toEqual(['EQ 1', 'EQ 2', 'EQ 3', 'EQ 4']);
				expect(devicePeqStore.canEditPresets).toBe(false);
			});
		});

		describe('canEditPresets', () => {
			it('is true for a device that edits its list, once the list is read', () => {
				devicePeqStore.setConnected(listing(), 1, null, undefined, HELD);
				expect(devicePeqStore.canEditPresets).toBe(true);
			});

			it('is false when the list could not be read', () => {
				devicePeqStore.setConnected(listing(), 1);
				expect(devicePeqStore.canEditPresets).toBe(false);
			});

			it('is false for a device that lists but does not edit', () => {
				devicePeqStore.setConnected(listing({ editsSlots: false }), 1, null, undefined, HELD);
				expect(devicePeqStore.canEditPresets).toBe(false);
			});

			it('is false for an ordinary device, and with nothing connected', () => {
				expect(devicePeqStore.canEditPresets).toBe(false);
				devicePeqStore.setConnected(makeConnection(), 160);
				expect(devicePeqStore.canEditPresets).toBe(false);
			});
		});

		describe('slotRoom', () => {
			it('counts the places the device has room for, bypass preset not among them', () => {
				devicePeqStore.setConnected(listing(), 1, null, undefined, HELD);
				expect(devicePeqStore.slotRoom).toBe(4);
			});

			it('is null where the presets are the profile’s', () => {
				expect(devicePeqStore.slotRoom).toBeNull();
				devicePeqStore.setConnected(listing(), 1);
				expect(devicePeqStore.slotRoom).toBeNull();
				devicePeqStore.setConnected(makeConnection(), 160);
				expect(devicePeqStore.slotRoom).toBeNull();
			});

			it('says when the list is full', () => {
				const full: Slot[] = [0, 1, 2, 3].map((id) => ({ id, name: `P${id}` }));
				devicePeqStore.setConnected(listing(), 1, null, undefined, [...full, OFF]);
				expect(devicePeqStore.slots.length).toBe(devicePeqStore.slotRoom);
			});
		});

		describe('relisted', () => {
			const connect = () => {
				devicePeqStore.setConnected(listing(), 1, null, undefined, HELD);
				devicePeqStore.target(2);
				devicePeqStore.synced = { filters: [], preamp: 0 };
				devicePeqStore.layout = { slot: 2, hints: null };
				devicePeqStore.autoPaused = true;
				devicePeqStore.setStatus('Wrote 6 bands.');
			};

			it('puts the target on the preset the device is on, and forgets what it held', () => {
				connect();
				// Rock is gone: Pop is 1 now, and the device is on it.
				devicePeqStore.relisted([HELD[0], { id: 1, name: 'Pop' }, OFF], 1, null);

				expect(names(devicePeqStore.slots)).toEqual(['Jazz', 'Pop']);
				expect(devicePeqStore.deviceSlot).toBe(1);
				expect(devicePeqStore.activeSlot).toBe(1);
				expect(devicePeqStore.selection).toBe(1);
				expect(devicePeqStore.eqEnabled).toBe(true);
				expect(devicePeqStore.synced).toBeNull();
				expect(devicePeqStore.layout).toBeNull();
				expect(devicePeqStore.autoPaused).toBe(false);
			});

			it('targets the first writable preset when the device is on none the list holds', () => {
				connect();
				devicePeqStore.relisted([HELD[0], HELD[1], OFF], 7, null);

				expect(devicePeqStore.deviceSlot).toBe(7);
				expect(devicePeqStore.activeSlot).toBe(0);
				expect(devicePeqStore.selection).toBe('other');
			});

			it('targets the first of those marked writable', () => {
				connect();
				devicePeqStore.relisted(
					[{ id: 0, name: 'Built-in' }, { id: 1, name: 'Mine', writable: true }, OFF],
					7,
					null
				);
				expect(devicePeqStore.activeSlot).toBe(1);
			});

			it('takes the device’s EQ switch, or the bypass preset, over what it was', () => {
				connect();
				devicePeqStore.relisted(HELD, 1, false);
				expect(devicePeqStore.eqEnabled).toBe(false);
				expect(devicePeqStore.selection).toBe('off');

				devicePeqStore.relisted(HELD, 9, null);
				expect(devicePeqStore.eqEnabled).toBe(false);
				expect(devicePeqStore.activeSlot).toBe(0);

				devicePeqStore.relisted(HELD, null, null);
				expect(devicePeqStore.eqEnabled).toBeNull();
			});

			it('leaves the last message, which is the caller’s to set', () => {
				connect();
				devicePeqStore.relisted(HELD, 1, null);
				expect(devicePeqStore.statusMessage).toBe('Wrote 6 bands.');
			});

			describe('keeping the target', () => {
				it('changes only the names', () => {
					connect();
					const synced = devicePeqStore.synced;
					const layout = devicePeqStore.layout;

					devicePeqStore.relisted(
						[HELD[0], HELD[1], { id: 2, name: 'Metal' }, OFF],
						0,
						false,
						true
					);

					expect(names(devicePeqStore.slots)).toEqual(['Jazz', 'Rock', 'Metal']);
					expect(devicePeqStore.activeSlot).toBe(2);
					expect(devicePeqStore.deviceSlot).toBe(1);
					expect(devicePeqStore.eqEnabled).toBe(true);
					expect(devicePeqStore.synced).toBe(synced);
					expect(devicePeqStore.layout).toBe(layout);
					expect(devicePeqStore.autoPaused).toBe(true);
					expect(devicePeqStore.statusMessage).toBe('Wrote 6 bands.');
				});

				it('still counts the list as the device’s, with its room', () => {
					connect();
					devicePeqStore.relisted([HELD[0], OFF], 0, null, true);
					expect(devicePeqStore.canEditPresets).toBe(true);
					expect(devicePeqStore.slotRoom).toBe(4);
					expect(devicePeqStore.slots).toHaveLength(1);
				});
			});
		});
	});

	describe('whether this page’s sound plays the device’s EQ', () => {
		const link = () => makeConnection({ connectionType: 'link', name: 'Moondrop Dawn Pro' });

		beforeEach(() => {
			devicePeqStore.audioPathChoice = null;
		});

		afterEach(() => {
			devicePeqStore.audioPathChoice = null;
		});

		it('is false with no connection, whatever was answered', () => {
			expect(devicePeqStore.audioThroughDevice).toBe(false);
			expect(devicePeqStore.playsEq).toBe(false);
			devicePeqStore.setAudioThroughDevice(true);
			expect(devicePeqStore.audioPathChoice).toBeNull();
			expect(devicePeqStore.audioThroughDevice).toBe(false);
			expect(devicePeqStore.playsEq).toBe(false);
		});

		it.each(['hid', 'serial', 'ble', 'network'] as const)(
			'guesses yes for a device connected in this browser (%s)',
			(connectionType) => {
				devicePeqStore.setConnected(makeConnection({ connectionType }), 160);
				expect(devicePeqStore.audioThroughDevice).toBe(true);
				expect(devicePeqStore.playsEq).toBe(true);
			}
		);

		it('guesses no for a device uniPEQ holds over the link', () => {
			devicePeqStore.setConnected(link(), 160);
			expect(devicePeqStore.audioThroughDevice).toBe(false);
			expect(devicePeqStore.playsEq).toBe(false);
		});

		it('guesses yes for a linked device when uniPEQ was opened from this page', () => {
			linkStore.launchedHere = true;
			devicePeqStore.setConnected(link(), 160);
			expect(devicePeqStore.audioThroughDevice).toBe(true);
			expect(devicePeqStore.playsEq).toBe(true);
			// The user's answer still wins: Bluetooth multipoint, a second output.
			devicePeqStore.setAudioThroughDevice(false);
			expect(devicePeqStore.audioThroughDevice).toBe(false);
			linkStore.launchedHere = false;
		});

		it('lets the user say a linked device is the one they listen through', () => {
			devicePeqStore.setConnected(link(), 160);
			devicePeqStore.setAudioThroughDevice(true);
			expect(devicePeqStore.audioThroughDevice).toBe(true);
			expect(devicePeqStore.playsEq).toBe(true);
		});

		it('lets the user say a local device is not the one they listen through', () => {
			devicePeqStore.setConnected(makeConnection(), 160);
			devicePeqStore.setAudioThroughDevice(false);
			expect(devicePeqStore.audioThroughDevice).toBe(false);
			expect(devicePeqStore.playsEq).toBe(false);
		});

		it('records the answer under the connected device’s name', () => {
			devicePeqStore.setConnected(makeConnection(), 160);
			devicePeqStore.setAudioThroughDevice(false);
			expect(devicePeqStore.audioPathChoice).toEqual({ device: 'FiiO KA17', through: false });
		});

		it('keeps the answer on another of the device’s EQs, whose view has another name', () => {
			const opened = makeConnection({ name: 'Qudelix 5K · USR EQ' });
			devicePeqStore.setConnected(opened, 160);
			devicePeqStore.setAudioThroughDevice(false);

			const spk = { ...opened, name: 'Qudelix 5K · SPK EQ' };
			devicePeqStore.selectEq(spk, { id: 'spk', bandCount: null }, 160, null);
			expect(devicePeqStore.audioThroughDevice).toBe(false);
			devicePeqStore.setAudioThroughDevice(true);
			expect(devicePeqStore.audioPathChoice).toEqual({
				device: 'Qudelix 5K · USR EQ',
				through: true
			});
		});

		it('does not play the EQ while the device’s EQ is off', () => {
			devicePeqStore.setConnected(makeConnection(), 240);
			expect(devicePeqStore.eqEnabled).toBe(false);
			expect(devicePeqStore.audioThroughDevice).toBe(true);
			expect(devicePeqStore.playsEq).toBe(false);
		});

		it('counts an EQ switch the device can’t report as on', () => {
			devicePeqStore.setConnected(makeConnection(), null);
			expect(devicePeqStore.eqEnabled).toBeNull();
			expect(devicePeqStore.playsEq).toBe(true);
		});

		it('follows the device’s EQ switch as it flips', () => {
			devicePeqStore.setConnected(makeConnection(), 160);
			expect(devicePeqStore.playsEq).toBe(true);
			devicePeqStore.played('off');
			expect(devicePeqStore.playsEq).toBe(false);
			devicePeqStore.played(160);
			expect(devicePeqStore.playsEq).toBe(true);
		});

		it('needs the user’s yes as well as the device’s EQ being on', () => {
			devicePeqStore.setConnected(link(), 240);
			devicePeqStore.setAudioThroughDevice(true);
			expect(devicePeqStore.audioThroughDevice).toBe(true);
			expect(devicePeqStore.playsEq).toBe(false);
		});

		it('keeps the answer across a disconnect, for the same device coming back', () => {
			devicePeqStore.setConnected(makeConnection(), 160);
			devicePeqStore.setAudioThroughDevice(false);

			devicePeqStore.setDisconnected();
			expect(devicePeqStore.audioPathChoice).toEqual({ device: 'FiiO KA17', through: false });
			expect(devicePeqStore.audioThroughDevice).toBe(false);

			devicePeqStore.setConnected(makeConnection(), 160);
			expect(devicePeqStore.audioThroughDevice).toBe(false);
			expect(devicePeqStore.playsEq).toBe(false);
		});

		it('keeps a yes across a disconnect too, over the link default', () => {
			devicePeqStore.setConnected(link(), 160);
			devicePeqStore.setAudioThroughDevice(true);

			devicePeqStore.setDisconnected();
			devicePeqStore.setConnected(link(), 160);

			expect(devicePeqStore.audioThroughDevice).toBe(true);
		});

		it('ignores an answer given for another device', () => {
			devicePeqStore.setConnected(makeConnection(), 160);
			devicePeqStore.setAudioThroughDevice(false);
			devicePeqStore.setDisconnected();

			devicePeqStore.setConnected(makeConnection({ name: 'Moondrop Dawn Pro' }), 160);
			expect(devicePeqStore.audioThroughDevice).toBe(true);

			devicePeqStore.setDisconnected();
			devicePeqStore.setConnected(
				makeConnection({ name: 'Moondrop Dawn Pro', connectionType: 'link' }),
				160
			);
			expect(devicePeqStore.audioThroughDevice).toBe(false);
		});

		it('replaces the earlier answer when the user answers again', () => {
			devicePeqStore.setConnected(makeConnection(), 160);
			devicePeqStore.setAudioThroughDevice(false);
			devicePeqStore.setAudioThroughDevice(true);
			expect(devicePeqStore.audioPathChoice).toEqual({ device: 'FiiO KA17', through: true });
			expect(devicePeqStore.playsEq).toBe(true);
		});
	});
});
