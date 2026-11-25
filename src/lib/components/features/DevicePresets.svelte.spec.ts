/**
 * `DevicePresets` is the row under Device EQ that adds, renames and deletes the presets of a device
 * that keeps them as a list. Rename and Delete act on the preset Device EQ shows, so the specs put
 * a list-keeping connection in the store and spy on the three service actions: what the device does
 * with them is the service spec's business.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import DevicePresets from './DevicePresets.svelte';
import { devicePeqService } from '#lib/services/device-peq-service.svelte.js';
import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
import type { DeviceConnection, PeqCapabilities, PeqDevice, Slot } from '#lib/device-peq/types.js';
import { hardwareProfile } from '#lib/utils/__fixtures__/eq-profiles.js';

/** The places the device has room for: five. */
const PLACES: Slot[] = [0, 1, 2, 3, 4].map((id) => ({ id, name: `EQ ${id + 1}` }));

const CAPS: PeqCapabilities = {
	canRead: true,
	canWrite: true,
	readsPreamp: false,
	readsSlot: true,
	writesPreamp: true,
	writesSlot: true,
	readsCurrentSlot: true,
	readsEnabled: false,
	canEnable: true,
	slots: PLACES,
	listsSlots: true,
	editsSlots: true,
	disconnectOnSave: false,
	experimental: false
};

const connection = (): DeviceConnection => ({
	device: {
		capabilities: CAPS,
		pull: vi.fn<PeqDevice['pull']>(async () => ({ filters: [] })),
		push: vi.fn<PeqDevice['push']>(async () => ({ reconnect: false })),
		currentSlot: vi.fn<PeqDevice['currentSlot']>(async () => 1),
		eqEnabled: vi.fn<PeqDevice['eqEnabled']>(async () => null),
		setEnabled: vi.fn<PeqDevice['setEnabled']>(async () => {}),
		close: vi.fn<PeqDevice['close']>(async () => {})
	},
	connectionType: 'hid',
	name: 'Topping DX5 II',
	profile: hardwareProfile('topping-dx5-ii', { bandCount: 10 }),
	profileSource: 'device',
	profileId: 'topping-dx5-ii',
	identity: {}
});

interface Mount {
	/** The presets the device holds, in order; their ids are their places. */
	held?: string[];
	/** The preset the device is on. */
	on?: number;
	/** Whether its EQ is on. */
	enabled?: boolean;
}

async function mount({ held = ['Jazz', 'Rock', 'Pop'], on = 1, enabled = true }: Mount = {}) {
	const listed = held.map((name, id) => ({ id, name }));
	devicePeqStore.setConnected(connection(), on, enabled, undefined, listed);
	return render(DevicePresets);
}

const newButton = () => page.getByRole('button', { name: 'New', exact: true });
const renameButton = () => page.getByRole('button', { name: 'Rename', exact: true });
const deleteButton = () => page.getByRole('button', { name: 'Delete', exact: true });

const PICK_FIRST = 'Pick one of your presets under Device EQ first.';

describe('DevicePresets', () => {
	const spyCreate = () => vi.spyOn(devicePeqService, 'createPreset').mockResolvedValue(undefined);
	const spyRename = () => vi.spyOn(devicePeqService, 'renamePreset').mockResolvedValue(true);
	const spyRemove = () => vi.spyOn(devicePeqService, 'deletePreset').mockResolvedValue(undefined);

	let create: ReturnType<typeof spyCreate>;
	let rename: ReturnType<typeof spyRename>;
	let remove: ReturnType<typeof spyRemove>;

	beforeEach(() => {
		devicePeqStore.setDisconnected();
		create = spyCreate();
		rename = spyRename();
		remove = spyRemove();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		devicePeqStore.setDisconnected();
	});

	describe('the buttons', () => {
		it('offers all three on a preset of the device’s own, with how many are used', async () => {
			await mount();

			await expect.element(page.getByText('Presets', { exact: true })).toBeInTheDocument();
			await expect.element(newButton()).toBeEnabled();
			await expect.element(renameButton()).toBeEnabled();
			await expect.element(deleteButton()).toBeEnabled();
			await expect.element(newButton()).toHaveAccessibleDescription('3 of 5 used');
			await expect.element(renameButton()).not.toHaveAccessibleDescription();
			await expect.element(deleteButton()).not.toHaveAccessibleDescription();
		});

		it('explains the row behind its info button', async () => {
			await mount();
			await page.getByRole('button', { name: 'About Presets' }).click();
			await expect
				.element(page.getByText(/keeps its presets as a list you can add to, rename and delete/))
				.toBeInTheDocument();
			await expect.element(page.getByText('3 of 5 used').first()).toBeInTheDocument();
		});

		it('leaves Rename and Delete off while Device EQ shows Off, and says what to do', async () => {
			await mount({ enabled: false });

			await expect.element(newButton()).toBeEnabled();
			await expect.element(renameButton()).toBeDisabled();
			await expect.element(renameButton()).toHaveAccessibleDescription(PICK_FIRST);
			await expect.element(deleteButton()).toBeDisabled();
			await expect.element(deleteButton()).toHaveAccessibleDescription(PICK_FIRST);
		});

		it('leaves them off on a built-in preset the list does not hold', async () => {
			await mount({ on: 7 });
			expect(devicePeqStore.selection).toBe('other');

			await expect.element(newButton()).toBeEnabled();
			await expect.element(renameButton()).toBeDisabled();
			await expect.element(renameButton()).toHaveAccessibleDescription(PICK_FIRST);
			await expect.element(deleteButton()).toBeDisabled();
			await expect.element(deleteButton()).toHaveAccessibleDescription(PICK_FIRST);
		});

		it('turns them on when Device EQ moves to a preset of the device’s own', async () => {
			await mount({ enabled: false });
			await expect.element(renameButton()).toBeDisabled();

			devicePeqStore.played(2);

			await expect.element(renameButton()).toBeEnabled();
			await expect.element(deleteButton()).toBeEnabled();
			await expect.element(renameButton()).not.toHaveAccessibleDescription();
		});

		it('turns New off, and says why, when the device has no room for another', async () => {
			await mount({ held: ['A', 'B', 'C', 'D', 'E'], on: 0 });

			await expect.element(newButton()).toBeDisabled();
			await expect
				.element(newButton())
				.toHaveAccessibleDescription('The device has no room for another.');
			await expect.element(renameButton()).toBeEnabled();
			await expect.element(deleteButton()).toBeEnabled();
		});

		it('turns Delete off, and says why, for the last preset', async () => {
			await mount({ held: ['Only'], on: 0 });

			await expect.element(deleteButton()).toBeDisabled();
			await expect
				.element(deleteButton())
				.toHaveAccessibleDescription('The device keeps at least one preset.');
			await expect.element(renameButton()).toBeEnabled();
			await expect.element(newButton()).toBeEnabled();
		});

		it('turns all three off while another operation runs', async () => {
			await mount();
			devicePeqStore.isReading = true;

			await expect.element(newButton()).toBeDisabled();
			await expect.element(renameButton()).toBeDisabled();
			await expect.element(deleteButton()).toBeDisabled();

			devicePeqStore.isReading = false;
			await expect.element(newButton()).toBeEnabled();
		});

		it('adds a preset with New', async () => {
			await mount();
			await newButton().click();
			expect(create).toHaveBeenCalledOnce();
			expect(rename).not.toHaveBeenCalled();
			expect(remove).not.toHaveBeenCalled();
		});
	});

	describe('renaming', () => {
		const dialog = (name = 'Rename “Rock”') => page.getByRole('dialog', { name });
		const nameField = () => dialog().getByRole('textbox', { name: 'Name' });
		const confirm = () => dialog().getByRole('button', { name: 'Rename', exact: true });

		async function open() {
			await mount();
			await renameButton().click();
			await expect.element(dialog()).toBeInTheDocument();
		}

		it('asks for the new name, starting from the one the preset has', async () => {
			await open();

			await expect.element(nameField()).toHaveValue('Rock');
			await expect
				.element(dialog())
				.toHaveAccessibleDescription(/The name is stored on the device/);
			await expect.element(confirm()).toBeEnabled();
			expect(rename).not.toHaveBeenCalled();
		});

		it('names the preset Device EQ shows', async () => {
			await mount({ on: 2 });
			await renameButton().click();
			await expect.element(dialog('Rename “Pop”')).toBeInTheDocument();
			await expect
				.element(dialog('Rename “Pop”').getByRole('textbox', { name: 'Name' }))
				.toHaveValue('Pop');
		});

		it('renames the preset and closes when the device takes the name', async () => {
			await open();
			await nameField().fill('Metal');
			await confirm().click();

			await vi.waitFor(() => expect(rename).toHaveBeenCalledExactlyOnceWith(1, 'Metal'));
			await expect.element(dialog()).not.toBeInTheDocument();
		});

		it('submits on Enter', async () => {
			await open();
			await nameField().fill('Metal');
			await userEvent.keyboard('{Enter}');

			await vi.waitFor(() => expect(rename).toHaveBeenCalledExactlyOnceWith(1, 'Metal'));
			await expect.element(dialog()).not.toBeInTheDocument();
		});

		it('stays open and says so when the device refuses the name', async () => {
			rename.mockResolvedValue(false);
			await open();
			await nameField().fill('A name far too long for it');
			await confirm().click();

			await expect
				.element(page.getByRole('alert'))
				.toHaveTextContent(
					"The device can't store that name. Try a shorter one in plain letters and digits."
				);
			await expect.element(dialog()).toBeInTheDocument();
			await expect.element(nameField()).toHaveValue('A name far too long for it');
			await expect.element(nameField()).toHaveAttribute('aria-invalid', 'true');
			await expect
				.element(nameField())
				.toHaveAccessibleDescription(/The device can't store that name/);
		});

		it('closes on a second try the device takes, with the message gone', async () => {
			rename.mockResolvedValueOnce(false);
			await open();
			await nameField().fill('Too long');
			await confirm().click();
			await expect.element(page.getByRole('alert')).toBeInTheDocument();

			await nameField().fill('Short');
			await confirm().click();

			await vi.waitFor(() => expect(rename).toHaveBeenCalledTimes(2));
			expect(rename).toHaveBeenLastCalledWith(1, 'Short');
			await expect.element(dialog()).not.toBeInTheDocument();
		});

		it('shows no message before a name has been refused', async () => {
			await open();
			expect(page.getByRole('alert').all()).toHaveLength(0);
			await expect.element(nameField()).toHaveAttribute('aria-invalid', 'false');
		});

		it('cannot be confirmed with an empty name', async () => {
			await open();
			await nameField().fill('');
			await expect.element(confirm()).toBeDisabled();

			await nameField().fill('   ');
			await expect.element(confirm()).toBeDisabled();
			await userEvent.keyboard('{Enter}');
			expect(rename).not.toHaveBeenCalled();
			await expect.element(dialog()).toBeInTheDocument();

			await nameField().fill('Metal');
			await expect.element(confirm()).toBeEnabled();
		});

		it('closes on Cancel and asks the device for nothing', async () => {
			await open();
			await nameField().fill('Metal');
			await dialog().getByRole('button', { name: 'Cancel' }).click();

			await expect.element(dialog()).not.toBeInTheDocument();
			expect(rename).not.toHaveBeenCalled();
		});

		it('starts again from the preset’s name, with no message, when opened again', async () => {
			rename.mockResolvedValue(false);
			await open();
			await nameField().fill('Typed and refused');
			await confirm().click();
			await expect.element(page.getByRole('alert')).toBeInTheDocument();
			await dialog().getByRole('button', { name: 'Cancel' }).click();
			await expect.element(dialog()).not.toBeInTheDocument();

			await renameButton().click();

			await expect.element(nameField()).toHaveValue('Rock');
			expect(page.getByRole('alert').all()).toHaveLength(0);
		});
	});

	describe('deleting', () => {
		const dialog = (name = 'Delete “Rock”?') => page.getByRole('dialog', { name });

		async function open() {
			await mount();
			await deleteButton().click();
			await expect.element(dialog()).toBeInTheDocument();
		}

		it('asks first, naming the preset and the device', async () => {
			await open();

			await expect
				.element(dialog())
				.toHaveAccessibleDescription(
					'The preset is removed from Topping DX5 II for good. The device may switch to another of its presets.'
				);
			expect(remove).not.toHaveBeenCalled();
		});

		it('names the preset Device EQ shows', async () => {
			await mount({ on: 2 });
			await deleteButton().click();
			await expect.element(dialog('Delete “Pop”?')).toBeInTheDocument();
		});

		it('does nothing on Cancel', async () => {
			await open();
			await dialog().getByRole('button', { name: 'Cancel' }).click();

			await expect.element(dialog()).not.toBeInTheDocument();
			expect(remove).not.toHaveBeenCalled();
		});

		it('deletes the preset, by its id, on Delete', async () => {
			await open();
			await dialog().getByRole('button', { name: 'Delete', exact: true }).click();

			await vi.waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith(1));
			await expect.element(dialog()).not.toBeInTheDocument();
			expect(rename).not.toHaveBeenCalled();
		});
	});
});
