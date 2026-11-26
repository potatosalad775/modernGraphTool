/**
 * `DeviceSettings` is a connected device's own settings as rows: a switch, a dropdown, segments or
 * a slider each, a balance slider for a pair of channel gains, and a confirmation for a setting
 * that restarts the device. The service is spied on rather than driven, so what is asserted is
 * which write each gesture asks for; the writes themselves are in `device-peq-service.svelte.spec.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import type { Control } from '@potatosalad775/eqcaps-core';
import { balanceOf, balanceWrites } from '#lib/device-peq/controls.js';
import type { DeviceConnection, PeqCapabilities, PeqDevice } from '#lib/device-peq/types.js';
import { devicePeqService } from '#lib/services/device-peq-service.svelte.js';
import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
import { hardwareProfile } from '#lib/utils/__fixtures__/eq-profiles.js';
import DeviceSettings from './DeviceSettings.svelte';

const CAPS: PeqCapabilities = {
	canRead: true,
	canWrite: true,
	readsPreamp: false,
	readsSlot: false,
	writesPreamp: true,
	writesSlot: true,
	readsCurrentSlot: true,
	readsEnabled: false,
	canEnable: true,
	slots: [{ id: 101, name: 'Custom' }],
	disconnectOnSave: false,
	experimental: false
};

const PROFILE = hardwareProfile('dongle', {
	bandCount: 4,
	band: {
		types: ['PK'],
		freq: { min: 20, max: 20000, step: 1 },
		q: { min: 0.1, max: 10, step: 0.01 },
		gain: { min: -12, max: 12, step: 0.5 }
	}
});

/** Puts a connection with `controls` in the store, and the values the device last read. */
function connectWith(controls: Control[], values: Record<string, number | null>) {
	const device: PeqDevice = {
		capabilities: { ...CAPS, controls },
		pull: vi.fn(async () => ({ filters: [] })),
		push: vi.fn(async () => ({ reconnect: false })),
		currentSlot: vi.fn(async () => 101),
		eqEnabled: vi.fn(async () => null),
		setEnabled: vi.fn(async () => {}),
		close: vi.fn(async () => {})
	};
	const connection: DeviceConnection = {
		device,
		connectionType: 'hid',
		name: 'Dongle',
		profile: PROFILE,
		profileSource: 'device',
		profileId: 'dongle',
		identity: {}
	};
	devicePeqStore.setConnected(connection, 101);
	devicePeqStore.controlValues = values;
}

const CROSSFEED: Control = { id: 'cf', name: 'QX-FEED', kind: 'toggle', role: 'crossfeed' };
const DAC: Control = {
	id: 'dac',
	name: 'FILTER',
	kind: 'choice',
	role: 'dac-filter',
	values: [
		{ value: 0, name: 'Fast roll-off' },
		{ value: 1, name: 'Slow roll-off' },
		{ value: 2, name: 'NOS' }
	]
};
const HEADROOM: Control = {
	id: 'hr',
	name: 'HR',
	kind: 'range',
	role: 'headroom',
	unit: 'dB',
	range: { min: -12, max: 0, step: 6 }
};
const VOLUME: Control = {
	id: 'vol',
	name: 'VOL',
	kind: 'range',
	role: 'volume',
	range: { min: 0, max: 50, step: 1 }
};
const LEFT: Control = {
	id: 'l',
	name: 'L',
	kind: 'range',
	role: 'balance-left',
	unit: 'dB',
	range: { min: -12, max: 0, step: 1 }
};
const RIGHT: Control = { ...LEFT, id: 'r', name: 'R', role: 'balance-right' };
const USB: Control = {
	id: 'usb',
	name: 'USB',
	kind: 'choice',
	role: 'usb-mode',
	reconnect: true,
	values: [
		{ value: 0, name: 'UAC 1.0' },
		{ value: 1, name: 'UAC 2.0' }
	]
};

/** What dragging a range input and letting go does, without the pointer: `input` while moving. */
function drag(el: Element, value: number) {
	const input = el as HTMLInputElement;
	input.value = String(value);
	input.dispatchEvent(new Event('input', { bubbles: true }));
}
const release = (el: Element) => el.dispatchEvent(new Event('change', { bubbles: true }));
/**
 * What picking an option does. Playwright won't pick one in an `aria-disabled` dropdown, which a
 * user still opens and picks from.
 */
function pick(el: Element, value: string) {
	(el as HTMLSelectElement).value = value;
	el.dispatchEvent(new Event('change', { bubbles: true }));
}

let setControl: MockInstance<typeof devicePeqService.setControl>;
let setControls: MockInstance<typeof devicePeqService.setControls>;

beforeEach(() => {
	setControl = vi.spyOn(devicePeqService, 'setControl').mockResolvedValue();
	setControls = vi.spyOn(devicePeqService, 'setControls').mockResolvedValue();
});

afterEach(() => {
	devicePeqStore.setDisconnected();
	vi.restoreAllMocks();
});

describe('DeviceSettings', () => {
	describe('a toggle', () => {
		it('is a switch named by the role, showing the value the device holds', async () => {
			connectWith([CROSSFEED], { cf: 1 });
			await render(DeviceSettings, { controls: [CROSSFEED] });

			await expect
				.element(page.getByRole('switch', { name: 'Crossfeed' }))
				.toHaveAttribute('aria-checked', 'true');
		});

		it('is named by its visible label, which comes before the switch', async () => {
			connectWith([CROSSFEED], { cf: 1 });
			await render(DeviceSettings, { controls: [CROSSFEED] });

			const sw = page.getByRole('switch', { name: 'Crossfeed' });
			await expect.element(sw).toBeVisible();
			const label = page.getByText('Crossfeed', { exact: true });
			await expect.element(label).toBeVisible();
			expect(label.element().tagName).toBe('LABEL');
			expect((label.element() as HTMLLabelElement).htmlFor).toBe(sw.element().id);
			expect(label.element().compareDocumentPosition(sw.element())).toBe(
				Node.DOCUMENT_POSITION_FOLLOWING
			);
		});

		it('turns on with a 1 and off with a 0', async () => {
			connectWith([CROSSFEED], { cf: 0 });
			await render(DeviceSettings, { controls: [CROSSFEED] });
			const sw = page.getByRole('switch', { name: 'Crossfeed' });
			await expect.element(sw).toHaveAttribute('aria-checked', 'false');

			await sw.click();
			expect(setControl).toHaveBeenCalledExactlyOnceWith('cf', 1);

			setControl.mockClear();
			devicePeqStore.controlValues = { cf: 1 };
			await expect.element(sw).toHaveAttribute('aria-checked', 'true');
			await sw.click();
			expect(setControl).toHaveBeenCalledExactlyOnceWith('cf', 0);
		});
	});

	describe('a choice', () => {
		it('is a dropdown of the data’s option names, on the one the device holds', async () => {
			connectWith([DAC], { dac: 1 });
			await render(DeviceSettings, { controls: [DAC] });

			const select = page.getByRole('combobox', { name: /DAC filter/ });
			const options = Array.from((select.element() as HTMLSelectElement).options);
			expect(options.map((o) => o.textContent)).toEqual(['Fast roll-off', 'Slow roll-off', 'NOS']);
			expect((select.element() as HTMLSelectElement).value).toBe('1');
		});

		it('writes the option picked', async () => {
			connectWith([DAC], { dac: 1 });
			await render(DeviceSettings, { controls: [DAC] });

			await page.getByRole('combobox', { name: /DAC filter/ }).selectOptions('NOS');

			expect(setControl).toHaveBeenCalledExactlyOnceWith('dac', 2);
		});

		it('goes back to what the device holds when the change doesn’t take', async () => {
			connectWith([DAC], { dac: 1 });
			await render(DeviceSettings, { controls: [DAC] });
			const select = page.getByRole('combobox', { name: /DAC filter/ });

			await select.selectOptions('NOS');

			await vi.waitFor(() => expect((select.element() as HTMLSelectElement).value).toBe('1'));
		});
	});

	describe('a range of three values', () => {
		it('is segments in the order a cut is listed, with the unit once in the row’s label', async () => {
			connectWith([HEADROOM], { hr: -6 });
			await render(DeviceSettings, { controls: [HEADROOM] });

			const segments = page.getByRole('radio').all();
			expect(segments.map((s) => s.element().textContent.trim())).toEqual(['0', '-6', '-12']);
			await expect.element(page.getByText('Headroom (dB)', { exact: true })).toBeVisible();
			expect(page.getByText(/\(dB\)/).all()).toHaveLength(1);
		});

		it('names the group by the setting alone, the unit being in the visible label', async () => {
			connectWith([HEADROOM], { hr: -6 });
			await render(DeviceSettings, { controls: [HEADROOM] });

			const group = page.getByRole('group', { name: 'Headroom', exact: true });
			await expect.element(group).toBeVisible();
			expect(group.element().getAttribute('aria-label')).toBe('Headroom');
			expect(group.element().contains(page.getByRole('radio', { name: '-6' }).element())).toBe(
				true
			);
		});

		it('checks the value the device holds', async () => {
			connectWith([HEADROOM], { hr: -6 });
			await render(DeviceSettings, { controls: [HEADROOM] });

			await expect
				.element(page.getByRole('radio', { name: '-6', exact: true }))
				.toHaveAttribute('aria-checked', 'true');
			await expect
				.element(page.getByRole('radio', { name: '0', exact: true }))
				.toHaveAttribute('aria-checked', 'false');
			await expect
				.element(page.getByRole('radio', { name: '-12', exact: true }))
				.toHaveAttribute('aria-checked', 'false');
		});

		it('writes the segment clicked, and nothing for the one already on', async () => {
			connectWith([HEADROOM], { hr: -6 });
			await render(DeviceSettings, { controls: [HEADROOM] });

			await page.getByRole('radio', { name: '-6', exact: true }).click();
			expect(setControl).not.toHaveBeenCalled();

			await page.getByRole('radio', { name: '-12', exact: true }).click();
			expect(setControl).toHaveBeenCalledExactlyOnceWith('hr', -12);
		});

		it('leaves the unit off a range that has none', async () => {
			const steps: Control = { ...HEADROOM, unit: undefined };
			connectWith([steps], { hr: 0 });
			await render(DeviceSettings, { controls: [steps] });

			await expect.element(page.getByRole('radio', { name: '-12', exact: true })).toBeVisible();
			await expect.element(page.getByText('Headroom', { exact: true })).toBeVisible();
			await expect.element(page.getByText(/\(dB\)/)).not.toBeInTheDocument();
			await expect.element(page.getByText(/dB/)).not.toBeInTheDocument();
		});
	});

	describe('a wide range', () => {
		it('is a slider showing the value the device holds', async () => {
			connectWith([VOLUME], { vol: 25 });
			await render(DeviceSettings, { controls: [VOLUME] });

			const slider = page.getByRole('slider', { name: /Volume/ });
			await expect.element(slider).toHaveValue('25');
			await expect.element(slider).toHaveAttribute('min', '0');
			await expect.element(slider).toHaveAttribute('max', '50');
			await expect.element(slider).toHaveAttribute('step', '1');
			await expect.element(slider).toHaveAttribute('aria-valuetext', '25');
			await expect.element(page.getByText('25', { exact: true })).toBeVisible();
		});

		it('shows a dB range’s value with its unit, and a range with no step as continuous', async () => {
			const gain: Control = {
				id: 'gain',
				name: 'GAIN',
				kind: 'range',
				role: 'output-gain',
				unit: 'dB',
				range: { min: -6, max: 6 }
			};
			connectWith([gain], { gain: -3 });
			await render(DeviceSettings, { controls: [gain] });

			const slider = page.getByRole('slider', { name: /Output gain/ });
			await expect.element(slider).toHaveAttribute('step', 'any');
			await expect.element(page.getByText('-3 dB', { exact: true })).toBeVisible();
		});

		it('follows the drag on screen, and writes only when let go', async () => {
			connectWith([VOLUME], { vol: 25 });
			await render(DeviceSettings, { controls: [VOLUME] });
			const slider = page.getByRole('slider', { name: /Volume/ }).element();

			drag(slider, 30);
			await expect.element(page.getByText('30', { exact: true })).toBeVisible();
			drag(slider, 35);
			await expect.element(page.getByText('35', { exact: true })).toBeVisible();
			expect(setControl).not.toHaveBeenCalled();

			release(slider);
			await vi.waitFor(() => expect(setControl).toHaveBeenCalledExactlyOnceWith('vol', 35));
		});

		it('goes back to the device’s value once the write is over', async () => {
			connectWith([VOLUME], { vol: 25 });
			await render(DeviceSettings, { controls: [VOLUME] });
			const slider = page.getByRole('slider', { name: /Volume/ });

			drag(slider.element(), 40);
			release(slider.element());

			await expect.element(page.getByText('25', { exact: true })).toBeVisible();
			await expect.element(slider).toHaveValue('25');
		});

		it('holds the value let go while the device is still setting it, as uniPEQ’s status says past its answer', async () => {
			connectWith([VOLUME], { vol: 25 });
			await render(DeviceSettings, { controls: [VOLUME] });
			const slider = page.getByRole('slider', { name: /Volume/ });
			setControl.mockImplementationOnce(async () => {
				devicePeqStore.isSettingControl = true;
			});

			drag(slider.element(), 40);
			release(slider.element());
			await vi.waitFor(() => expect(setControl).toHaveBeenCalledOnce());
			await expect.element(slider).toHaveValue('40');

			devicePeqStore.controlValues = { vol: 40 };
			devicePeqStore.isSettingControl = false;
			await expect.element(slider).toHaveValue('40');
			devicePeqStore.controlValues = { vol: 30 };
			await expect.element(slider).toHaveValue('30');
		});

		it('writes nothing for a change event with no drag, or a drag back to where it was', async () => {
			connectWith([VOLUME], { vol: 25 });
			await render(DeviceSettings, { controls: [VOLUME] });
			const slider = page.getByRole('slider', { name: /Volume/ }).element();

			release(slider);
			drag(slider, 25);
			release(slider);
			await vi.waitFor(() => expect(slider.getAttribute('aria-valuetext')).toBe('25'));
			expect(setControl).not.toHaveBeenCalled();
		});

		it('follows the device again after a drag let go where it began, which fires no change', async () => {
			connectWith([VOLUME], { vol: 25 });
			await render(DeviceSettings, { controls: [VOLUME] });
			const slider = page.getByRole('slider', { name: /Volume/ });

			drag(slider.element(), 40);
			drag(slider.element(), 25);
			// The device reads back another value, after a preset switch say.
			devicePeqStore.controlValues = { vol: 10 };

			await expect.element(slider).toHaveValue('10');
			await expect.element(page.getByText('10', { exact: true })).toBeVisible();
			expect(setControl).not.toHaveBeenCalled();
		});
	});

	describe('a pair of channel gains', () => {
		const controls = [LEFT, RIGHT];
		const balance = balanceOf(controls)!;

		it('is one Balance slider, not two', async () => {
			connectWith(controls, { l: 0, r: 0 });
			await render(DeviceSettings, { controls });

			expect(page.getByRole('slider').all()).toHaveLength(1);
			const slider = page.getByRole('slider', { name: /Balance/ });
			await expect.element(slider).toHaveAttribute('min', '-12');
			await expect.element(slider).toHaveAttribute('max', '12');
			await expect.element(slider).toHaveValue('0');
			await expect.element(page.getByText('Left channel')).not.toBeInTheDocument();
			await expect.element(page.getByText('Right channel')).not.toBeInTheDocument();
		});

		it('says which channel is cut, and by how much', async () => {
			connectWith(controls, { l: 0, r: -4 });
			await render(DeviceSettings, { controls });

			await expect.element(page.getByText('Right -4 dB', { exact: true })).toBeVisible();
			await expect.element(page.getByRole('slider', { name: /Balance/ })).toHaveValue('-4');
		});

		it('says Center with neither cut', async () => {
			connectWith(controls, { l: 0, r: 0 });
			await render(DeviceSettings, { controls });

			await expect.element(page.getByText('Center', { exact: true })).toBeVisible();
		});

		it('writes the gains that make the balance, once let go', async () => {
			const values = { l: -6, r: 0 };
			connectWith(controls, values);
			await render(DeviceSettings, { controls });
			const slider = page.getByRole('slider', { name: /Balance/ }).element();

			drag(slider, -6);
			await expect.element(page.getByText('Right -6 dB', { exact: true })).toBeVisible();
			expect(setControls).not.toHaveBeenCalled();
			release(slider);

			await vi.waitFor(() => expect(setControls).toHaveBeenCalledOnce());
			expect(setControls).toHaveBeenCalledWith(balanceWrites(balance, -6, values));
			expect(setControls).toHaveBeenCalledWith([
				['r', -6],
				['l', 0]
			]);
			expect(setControl).not.toHaveBeenCalled();
		});

		it('keeps a pair that restarts the device as two rows', async () => {
			const restarting = [{ ...LEFT, reconnect: true }, RIGHT];
			connectWith(restarting, { l: 0, r: 0 });
			await render(DeviceSettings, { controls: restarting });

			expect(page.getByRole('slider').all()).toHaveLength(2);
			await expect.element(page.getByRole('slider', { name: /Left channel/ })).toBeVisible();
			await expect.element(page.getByRole('slider', { name: /Right channel/ })).toBeVisible();
		});
	});

	describe('when the device would refuse a change', () => {
		const controls = [CROSSFEED, DAC, HEADROOM, VOLUME];
		const values = { cf: 0, dac: 0, hr: 0, vol: 10 };

		function widgets() {
			return [
				page.getByRole('switch', { name: 'Crossfeed' }),
				page.getByRole('combobox', { name: /DAC filter/ }),
				...page.getByRole('radio').all(),
				page.getByRole('slider', { name: /Volume/ })
			];
		}

		it('leaves every widget on while nothing is in the way', async () => {
			connectWith(controls, values);
			await render(DeviceSettings, { controls });

			expect(widgets()).toHaveLength(6);
			for (const widget of widgets()) await expect.element(widget).toBeEnabled();
		});

		it('turns every widget off when told it is disabled', async () => {
			connectWith(controls, values);
			await render(DeviceSettings, { controls, disabled: true });

			for (const widget of widgets()) await expect.element(widget).toBeDisabled();
		});

		it('keeps focus on any widget while a setting is being written, and says it is unavailable', async () => {
			connectWith(controls, values);
			await render(DeviceSettings, { controls });

			for (const widget of widgets()) {
				const el = widget.element() as HTMLElement;
				el.focus();
				devicePeqStore.isSettingControl = true;
				await expect.element(widget).toHaveAttribute('aria-disabled', 'true');
				await expect.element(widget).not.toHaveAttribute('disabled');
				expect(document.activeElement).toBe(el);
				devicePeqStore.isSettingControl = false;
				await expect.element(widget).not.toHaveAttribute('aria-disabled', 'true');
			}
		});

		it('turns the balance slider off too', async () => {
			connectWith([LEFT, RIGHT], { l: 0, r: 0 });
			await render(DeviceSettings, { controls: [LEFT, RIGHT], disabled: true });

			await expect.element(page.getByRole('slider', { name: /Balance/ })).toBeDisabled();
		});
	});

	describe('while the device is busy', () => {
		/**
		 * Each write keeps the device busy until the returned `finish` lets it end, as a linked
		 * device's answer does, and the device then reads back what it was asked for.
		 */
		function slowWrites() {
			const pending: (() => void)[] = [];
			setControl.mockImplementation((id, value) => {
				devicePeqStore.isSettingControl = true;
				return new Promise<void>((resolve) =>
					pending.push(() => {
						devicePeqStore.controlValues = { ...devicePeqStore.controlValues, [id]: value };
						devicePeqStore.isSettingControl = false;
						resolve();
					})
				);
			});
			return () => pending.shift()?.();
		}

		it('takes three steps of a slider’s arrow key and writes where it ends, keeping focus', async () => {
			connectWith([VOLUME], { vol: 0 });
			await render(DeviceSettings, { controls: [VOLUME] });
			const finish = slowWrites();
			const slider = page.getByRole('slider', { name: /Volume/ });
			const el = slider.element() as HTMLInputElement;
			el.focus();

			await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');

			await expect.element(slider).toHaveValue('3');
			expect(document.activeElement).toBe(el);
			await expect.element(slider).toHaveAttribute('aria-disabled', 'true');
			expect(setControl).toHaveBeenCalledExactlyOnceWith('vol', 1);

			finish();
			await vi.waitFor(() => expect(setControl).toHaveBeenCalledTimes(2));
			expect(setControl).toHaveBeenLastCalledWith('vol', 3);
			await expect.element(slider).toHaveValue('3');

			finish();
			await expect.element(slider).not.toHaveAttribute('aria-disabled', 'true');
			await expect.element(slider).toHaveValue('3');
			expect(devicePeqStore.controlValues).toEqual({ vol: 3 });
			expect(document.activeElement).toBe(el);
			expect(setControl).toHaveBeenCalledTimes(2);
		});

		it('writes a slider let go during another operation once the device is free', async () => {
			connectWith([VOLUME], { vol: 25 });
			await render(DeviceSettings, { controls: [VOLUME] });
			const slider = page.getByRole('slider', { name: /Volume/ });
			devicePeqStore.isReading = true;

			drag(slider.element(), 30);
			release(slider.element());
			await expect.element(slider).toHaveValue('30');
			expect(setControl).not.toHaveBeenCalled();

			devicePeqStore.isReading = false;
			await vi.waitFor(() => expect(setControl).toHaveBeenCalledExactlyOnceWith('vol', 30));
		});

		it('writes each slider let go meanwhile, not only the last one moved', async () => {
			const controls = [VOLUME, LEFT, RIGHT];
			connectWith(controls, { vol: 25, l: 0, r: 0 });
			await render(DeviceSettings, { controls });
			const volume = page.getByRole('slider', { name: /Volume/ }).element();
			const balance = page.getByRole('slider', { name: /Balance/ }).element();
			devicePeqStore.isReading = true;

			drag(volume, 30);
			release(volume);
			drag(balance, -6);
			release(balance);
			expect(setControl).not.toHaveBeenCalled();
			expect(setControls).not.toHaveBeenCalled();

			devicePeqStore.isReading = false;
			await vi.waitFor(() => expect(setControl).toHaveBeenCalledExactlyOnceWith('vol', 30));
			await vi.waitFor(() => expect(setControls).toHaveBeenCalledExactlyOnceWith([['r', -6]]));
		});

		it('keeps focus on a switch pressed, and writes nothing for a press meanwhile', async () => {
			connectWith([CROSSFEED], { cf: 0 });
			await render(DeviceSettings, { controls: [CROSSFEED] });
			const finish = slowWrites();
			const sw = page.getByRole('switch', { name: 'Crossfeed' });
			(sw.element() as HTMLElement).focus();

			await userEvent.keyboard(' ');
			expect(setControl).toHaveBeenCalledExactlyOnceWith('cf', 1);
			await expect.element(sw).toHaveAttribute('aria-disabled', 'true');
			expect(document.activeElement).toBe(sw.element());

			await userEvent.keyboard(' ');
			await sw.click({ force: true });
			expect(setControl).toHaveBeenCalledOnce();
			await expect.element(sw).toHaveAttribute('aria-checked', 'false');

			finish();
			await expect.element(sw).toHaveAttribute('aria-checked', 'true');
			expect(document.activeElement).toBe(sw.element());
		});

		it('keeps focus on a segment pressed, and writes nothing for a pick meanwhile', async () => {
			connectWith([HEADROOM], { hr: 0 });
			await render(DeviceSettings, { controls: [HEADROOM] });
			const finish = slowWrites();
			const six = page.getByRole('radio', { name: '-6', exact: true });
			const twelve = page.getByRole('radio', { name: '-12', exact: true });
			(six.element() as HTMLElement).focus();

			await userEvent.keyboard(' ');
			expect(setControl).toHaveBeenCalledExactlyOnceWith('hr', -6);
			await expect.element(six).toHaveAttribute('aria-disabled', 'true');
			expect(document.activeElement).toBe(six.element());

			await twelve.click({ force: true });
			expect(setControl).toHaveBeenCalledOnce();
			await expect.element(page.getByRole('radio', { name: '0', exact: true })).toBeChecked();

			finish();
			await expect.element(six).toBeChecked();
			await expect.element(twelve).not.toBeChecked();
		});

		it('puts a dropdown picked meanwhile back on what the device holds, and writes nothing', async () => {
			connectWith([DAC], { dac: 1 });
			await render(DeviceSettings, { controls: [DAC] });
			const select = page.getByRole('combobox', { name: /DAC filter/ });
			devicePeqStore.isReading = true;
			await expect.element(select).toHaveAttribute('aria-disabled', 'true');

			pick(select.element(), '2');

			await vi.waitFor(() => expect((select.element() as HTMLSelectElement).value).toBe('1'));
			expect(setControl).not.toHaveBeenCalled();
		});

		it('asks nothing for a setting that restarts the device', async () => {
			connectWith([USB], { usb: 0 });
			await render(DeviceSettings, { controls: [USB] });
			const select = page.getByRole('combobox', { name: /USB mode/ });
			devicePeqStore.isReading = true;
			await expect.element(select).toHaveAttribute('aria-disabled', 'true');

			pick(select.element(), '1');

			await vi.waitFor(() => expect((select.element() as HTMLSelectElement).value).toBe('0'));
			expect(page.getByRole('dialog').all()).toHaveLength(0);
		});
	});

	describe('a setting that restarts the device', () => {
		it('says so under its row', async () => {
			connectWith([USB, DAC], { usb: 0, dac: 0 });
			await render(DeviceSettings, { controls: [USB, DAC] });

			expect(page.getByText('Changing this restarts the device.').all()).toHaveLength(1);
			await expect.element(page.getByText('Changing this restarts the device.')).toBeVisible();
		});

		it('asks before writing, and writes nothing on Cancel', async () => {
			connectWith([USB], { usb: 0 });
			await render(DeviceSettings, { controls: [USB] });

			await page.getByRole('combobox', { name: /USB mode/ }).selectOptions('UAC 2.0');

			const dialog = page.getByRole('dialog', { name: 'Change USB mode?' });
			await expect.element(dialog).toBeVisible();
			await expect.element(dialog).toHaveAccessibleDescription(/The device restarts/);
			expect(setControl).not.toHaveBeenCalled();

			await page.getByRole('button', { name: 'Cancel' }).click();
			await expect.element(dialog).not.toBeInTheDocument();
			expect(setControl).not.toHaveBeenCalled();
		});

		it('writes the value on Change, and closes', async () => {
			connectWith([USB], { usb: 0 });
			await render(DeviceSettings, { controls: [USB] });

			await page.getByRole('combobox', { name: /USB mode/ }).selectOptions('UAC 2.0');
			await page.getByRole('button', { name: 'Change', exact: true }).click();

			expect(setControl).toHaveBeenCalledExactlyOnceWith('usb', 1);
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		});

		it('keeps showing what the device holds while it waits for the answer', async () => {
			connectWith([USB], { usb: 0 });
			await render(DeviceSettings, { controls: [USB] });
			const select = page.getByRole('combobox', { name: /USB mode/ });

			await select.selectOptions('UAC 2.0');

			await expect.element(page.getByRole('dialog')).toBeVisible();
			await vi.waitFor(() => expect((select.element() as HTMLSelectElement).value).toBe('0'));
		});

		it('asks for a toggle that restarts it as well', async () => {
			const toggle: Control = { ...CROSSFEED, reconnect: true };
			connectWith([toggle], { cf: 0 });
			await render(DeviceSettings, { controls: [toggle] });

			await page.getByRole('switch', { name: 'Crossfeed' }).click();

			await expect.element(page.getByRole('dialog', { name: 'Change Crossfeed?' })).toBeVisible();
			expect(setControl).not.toHaveBeenCalled();
		});
	});

	describe('a setting that stops the device applying its EQ', () => {
		it('says so under its row while that value is held', async () => {
			const mode: Control = { ...DAC, disablesEq: [2] };
			connectWith([mode], { dac: 2 });
			await render(DeviceSettings, { controls: [mode] });

			await expect
				.element(page.getByText("The device doesn't apply its EQ with this setting."))
				.toBeVisible();
		});

		it('says nothing while another value is held', async () => {
			const mode: Control = { ...DAC, disablesEq: [2] };
			connectWith([mode], { dac: 0 });
			await render(DeviceSettings, { controls: [mode] });

			await expect
				.element(page.getByText("The device doesn't apply its EQ with this setting."))
				.not.toBeInTheDocument();
		});
	});

	it('shows the rows in the order given, each under the data’s name when it has no role', async () => {
		const plain: Control = { id: 'x', name: 'QX-HP', kind: 'toggle' };
		connectWith([plain, CROSSFEED], { x: 0, cf: 0 });
		await render(DeviceSettings, { controls: [plain, CROSSFEED] });

		await expect.element(page.getByRole('switch', { name: 'QX-HP' })).toBeVisible();
		await expect.element(page.getByRole('switch', { name: 'Crossfeed' })).toBeVisible();
		const [first, second] = page.getByRole('switch').all();
		expect(first.element().compareDocumentPosition(second.element())).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING
		);
		expect(first.element().id).toBe(page.getByRole('switch', { name: 'QX-HP' }).element().id);
	});
});
