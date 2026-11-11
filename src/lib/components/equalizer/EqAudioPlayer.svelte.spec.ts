/**
 * `EqAudioPlayer` is the view over `audioPlayerService` — every control is a
 * thin call into the singleton, so the spec drives the real service (its setters
 * touch no Web Audio node until `play()`) and spies only on the transport
 * methods that would open an `AudioContext`.
 *
 * The parts worth pinning here are the ones with maths or conditional layout:
 * the log-mapped tone slider, the band that frequency-selection mode imposes on
 * the single-frequency sources, and which controls appear per source.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { toast } from 'svelte-sonner';
import EqAudioPlayer from './EqAudioPlayer.svelte';
import { audioPlayerService } from '#lib/services/audio-player-service.svelte.js';
import { audioRangeStore } from '#lib/stores/audio-range-store.svelte.js';
import { audioSpectrumStore } from '#lib/stores/audio-spectrum-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
import type { DeviceConnection, PeqCapabilities } from '#lib/device-peq/types.js';
import { hardwareProfile } from '#lib/utils/__fixtures__/eq-profiles.js';

/** A hardware device with a bypass preset, so slot 240 reads as "EQ off". */
const DEVICE_CAPS: PeqCapabilities = {
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

function sourceSelect() {
	return page.getByRole('combobox');
}

/** The volume slider is always last; a tone slider, when present, comes first. */
function toneSlider() {
	return page.getByRole('slider').first();
}

function volumeSlider() {
	return page.getByRole('slider').last();
}

/**
 * Each numeric field is wrapped in a `<label>` that also holds the unit span,
 * so its accessible name is e.g. "From Hz" — anchor on the leading word rather
 * than matching the label exactly.
 */
function numberBox(label: string) {
	return page.getByLabelText(new RegExp(`^${label}\\b`));
}

/**
 * The numeric fields commit on `change`, not `input` — `fill()` alone only
 * produces the latter, so the value has to be committed with a blur the way a
 * user leaving the field would.
 */
async function commit(locator: ReturnType<typeof numberBox>, value: string) {
	await locator.fill(value);
	(locator.element() as HTMLInputElement).blur();
}

/** Range inputs report `value` as a string; compare against that directly. */
function sliderValue(locator: ReturnType<typeof toneSlider>): number {
	return Number((locator.element() as HTMLInputElement).value);
}

describe('EqAudioPlayer', () => {
	beforeEach(() => {
		// The range store first: `setSweepFromHz`/`setSweepToHz` clamp against the
		// active band, so resetting the service before the band would carry the
		// previous test's range into this one's starting values.
		audioRangeStore.isFrequencySelectionMode = false;
		audioRangeStore.reset();
		audioPlayerService.setAudioSource('');
		audioPlayerService.setFiltersEnabled(true);
		audioPlayerService.setVolume(0.5);
		audioPlayerService.setToneFreq(1000);
		audioPlayerService.setSweepFromHz(20);
		audioPlayerService.setSweepToHz(20000);
		audioPlayerService.setSweepDurationSec(5);
		audioPlayerService.setSweepLoop(false);
		audioSpectrumStore.isEnabled = false;
		eqStore.isEnabled = true;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ── Source selection ─────────────────────────────────────────────────────

	describe('source selection', () => {
		it('starts on the placeholder option with no source-specific controls', async () => {
			render(EqAudioPlayer);

			await expect.element(sourceSelect()).toHaveValue('');
			expect(await page.getByText(/^Frequency:/).all()).toHaveLength(0);
			expect(await page.getByRole('button', { name: 'Upload Audio' }).all()).toHaveLength(0);
		});

		it('offers every generator plus the file option', async () => {
			render(EqAudioPlayer);
			const values = (await page.getByRole('option').all()).map(
				(o) => (o.element() as HTMLOptionElement).value
			);
			expect(values).toEqual(['', 'white', 'pink', 'tone', 'sweep', 'file']);
		});

		it('pushes the pick into the service', async () => {
			render(EqAudioPlayer);
			await sourceSelect().selectOptions('pink');
			expect(audioPlayerService.audioSource).toBe('pink');
		});

		it('reveals the tone slider only for the tone source', async () => {
			render(EqAudioPlayer);
			await sourceSelect().selectOptions('tone');

			await expect.element(page.getByText(/^Frequency:/)).toBeInTheDocument();
			await expect.element(page.getByText('1000 Hz')).toBeInTheDocument();
		});

		it('reveals the sweep controls only for the sweep source', async () => {
			render(EqAudioPlayer);
			await sourceSelect().selectOptions('sweep');

			await expect.element(numberBox('Duration')).toBeInTheDocument();
			await expect.element(page.getByRole('switch', { name: 'Loop' })).toBeInTheDocument();
		});

		it('reveals the upload button only for the file source', async () => {
			render(EqAudioPlayer);
			await sourceSelect().selectOptions('file');

			await expect.element(page.getByRole('button', { name: 'Upload Audio' })).toBeInTheDocument();
		});
	});

	// ── Tone slider ──────────────────────────────────────────────────────────

	describe('tone slider', () => {
		beforeEach(async () => {
			render(EqAudioPlayer);
			await sourceSelect().selectOptions('tone');
		});

		it('sits at the log-midpoint of 20 Hz–20 kHz for a ~632 Hz tone', async () => {
			audioPlayerService.setToneFreq(632);
			// log10(632) is halfway between log10(20) and log10(20000).
			await vi.waitFor(() => expect(sliderValue(toneSlider())).toBe(500));
		});

		it('pins to the ends of its travel at the band edges', async () => {
			audioPlayerService.setToneFreq(20);
			await vi.waitFor(() => expect(sliderValue(toneSlider())).toBe(0));

			audioPlayerService.setToneFreq(20000);
			await vi.waitFor(() => expect(sliderValue(toneSlider())).toBe(1000));
		});

		it('maps a slider position back to a log-spaced frequency', async () => {
			await toneSlider().fill('750');
			// 750/1000 of three decades above 20 Hz.
			expect(audioPlayerService.toneFreq).toBeCloseTo(
				Math.round(Math.pow(10, Math.log10(20) + 0.75 * 3)),
				-1
			);
		});

		it('remaps its travel across the selected band in frequency-selection mode', async () => {
			audioRangeStore.isFrequencySelectionMode = true;
			audioRangeStore.setRange(1000, 4000);
			// The tone is clamped into the band by the service, then the slider
			// re-scales so the whole travel covers 1k–4k rather than 20–20k.
			await toneSlider().fill('0');
			expect(audioPlayerService.toneFreq).toBe(1000);

			await toneSlider().fill('1000');
			expect(audioPlayerService.toneFreq).toBe(4000);
		});
	});

	// ── Sweep controls ───────────────────────────────────────────────────────

	describe('sweep controls', () => {
		beforeEach(async () => {
			render(EqAudioPlayer);
			await sourceSelect().selectOptions('sweep');
		});

		it('sends the typed endpoints to the service', async () => {
			await commit(numberBox('From'), '100');
			await commit(numberBox('To'), '8000');

			expect(audioPlayerService.sweepFromHz).toBe(100);
			expect(audioPlayerService.sweepToHz).toBe(8000);
		});

		it('ignores a blank endpoint rather than sending NaN', async () => {
			await commit(numberBox('From'), '100');
			await commit(numberBox('From'), '');

			expect(audioPlayerService.sweepFromHz).toBe(100);
		});

		it('clamps the duration into the accepted window', async () => {
			await commit(numberBox('Duration'), '120');
			expect(audioPlayerService.sweepDurationSec).toBe(60);

			await commit(numberBox('Duration'), '0.1');
			expect(audioPlayerService.sweepDurationSec).toBe(0.5);
		});

		it('toggles looping', async () => {
			await page.getByRole('switch', { name: 'Loop' }).click();
			expect(audioPlayerService.sweepLoop).toBe(true);
		});

		it('drops its own endpoint inputs while range mode is active', async () => {
			// In range mode the band is the sweep span, so the range section's From/To
			// is the only pair — a second one would carry the same labels and the same
			// numbers, and the next graph drag would overwrite whatever was typed in it.
			audioRangeStore.isFrequencySelectionMode = true;
			audioRangeStore.setRange(500, 5000);

			await expect.element(numberBox('From')).toHaveValue(500);
			expect(await numberBox('From').all()).toHaveLength(1);
			expect(await numberBox('To').all()).toHaveLength(1);
			// The rest of the sweep controls stay.
			expect(await numberBox('Duration').all()).toHaveLength(1);
		});
	});

	// ── Frequency-selection mode ─────────────────────────────────────────────

	describe('frequency-selection mode', () => {
		it('hides the range inputs while the mode is off', async () => {
			render(EqAudioPlayer);
			expect(await numberBox('From').all()).toHaveLength(0);
		});

		it('shows the band bounds once the mode is on', async () => {
			render(EqAudioPlayer);
			await page.getByRole('switch', { name: 'Frequency Range' }).click();

			expect(audioRangeStore.isFrequencySelectionMode).toBe(true);
			await expect.element(numberBox('From')).toHaveValue(20);
			await expect.element(numberBox('To')).toHaveValue(20000);
		});

		it('writes a typed band back into the store', async () => {
			audioRangeStore.isFrequencySelectionMode = true;
			render(EqAudioPlayer);

			await commit(numberBox('From'), '200');
			await commit(numberBox('To'), '6000');

			expect(audioRangeStore.fromHz).toBe(200);
			expect(audioRangeStore.toHz).toBe(6000);
		});

		it('restores the full band on reset', async () => {
			audioRangeStore.isFrequencySelectionMode = true;
			audioRangeStore.setRange(200, 6000);
			render(EqAudioPlayer);

			await page.getByRole('button', { name: 'Reset Frequency Range' }).click();

			expect(audioRangeStore.fromHz).toBe(20);
			expect(audioRangeStore.toHz).toBe(20000);
		});
	});

	// ── Toggles ──────────────────────────────────────────────────────────────

	describe('toggles', () => {
		it('disables the EQ Effect switch while the equalizer is globally off', async () => {
			eqStore.isEnabled = false;
			render(EqAudioPlayer);

			await expect.element(page.getByRole('switch', { name: 'EQ Effect' })).toBeDisabled();
		});

		it('turns the filter chain off from the EQ Effect switch', async () => {
			render(EqAudioPlayer);
			await page.getByRole('switch', { name: 'EQ Effect' }).click();
			expect(audioPlayerService.filtersEnabled).toBe(false);
		});

		it('drives the spectrum overlay flag straight from the store', async () => {
			render(EqAudioPlayer);
			await page.getByRole('switch', { name: 'Spectrum' }).click();
			expect(audioSpectrumStore.isEnabled).toBe(true);
		});
	});

	// ── A hardware device that applies the EQ ────────────────────────────────

	describe('with a hardware EQ device connected', () => {
		const eqSwitch = () => page.getByRole('switch', { name: 'EQ Effect' });
		const applyHere = () => page.getByRole('button', { name: 'Apply it here instead' });
		const leaveToDevice = () => page.getByRole('button', { name: 'Leave the EQ to the device' });

		function connect(
			opts: { connectionType?: DeviceConnection['connectionType']; slot?: number } = {}
		) {
			devicePeqStore.setConnected(
				{
					device: {
						capabilities: DEVICE_CAPS,
						pull: vi.fn(),
						push: vi.fn(),
						currentSlot: vi.fn(),
						eqEnabled: vi.fn(),
						setEnabled: vi.fn(),
						close: vi.fn()
					},
					connectionType: opts.connectionType ?? 'hid',
					name: 'FiiO KA17',
					profile: hardwareProfile('fiio-ka17', { bandCount: 10 }),
					profileSource: 'device',
					profileId: 'fiio-ka17',
					identity: {}
				},
				opts.slot ?? 160
			);
		}

		beforeEach(() => {
			devicePeqStore.audioPathChoice = null;
			devicePeqStore.setDisconnected();
		});

		afterEach(() => {
			devicePeqStore.audioPathChoice = null;
			devicePeqStore.setDisconnected();
		});

		it('shows neither line with no device connected', async () => {
			render(EqAudioPlayer);

			await expect.element(eqSwitch()).toBeEnabled();
			expect(await applyHere().all()).toHaveLength(0);
			expect(await leaveToDevice().all()).toHaveLength(0);
			expect(await page.getByText(/applies the EQ|applied twice/).all()).toHaveLength(0);
		});

		it('turns the EQ Effect switch off and says who applies the EQ', async () => {
			connect();
			render(EqAudioPlayer);

			await expect.element(eqSwitch()).toBeDisabled();
			await expect.element(eqSwitch()).not.toBeChecked();
			await expect
				.element(page.getByText('FiiO KA17 applies the EQ, so this player leaves it off.'))
				.toBeInTheDocument();
			await expect.element(applyHere()).toBeInTheDocument();
			expect(await leaveToDevice().all()).toHaveLength(0);
		});

		it('shows the switch off even though the player’s own flag is on', async () => {
			audioPlayerService.setFiltersEnabled(true);
			connect();
			render(EqAudioPlayer);

			await expect.element(eqSwitch()).not.toBeChecked();
			expect(audioPlayerService.filtersEnabled).toBe(true);
		});

		it('says the device does not hold the latest changes yet when it is out of sync', async () => {
			connect();
			devicePeqStore.reportedInSync = false;
			render(EqAudioPlayer);

			await expect
				.element(page.getByText(/It doesn't hold your latest changes yet\./))
				.toBeInTheDocument();
		});

		it.each([
			['in sync', true],
			['unknown', null]
		] as const)('leaves out the latest-changes note when sync is %s', async (_name, value) => {
			connect();
			devicePeqStore.reportedInSync = value;
			render(EqAudioPlayer);

			await expect.element(applyHere()).toBeInTheDocument();
			expect(await page.getByText(/latest changes/).all()).toHaveLength(0);
		});

		it('hands the EQ back to this player from "Apply it here instead"', async () => {
			connect();
			render(EqAudioPlayer);

			await applyHere().click();

			expect(devicePeqStore.audioThroughDevice).toBe(false);
			expect(devicePeqStore.audioPathChoice).toEqual({ device: 'FiiO KA17', through: false });
			await expect.element(eqSwitch()).toBeEnabled();
			await expect.element(eqSwitch()).toBeChecked();
			await expect
				.element(page.getByText('Listening through FiiO KA17? Then the EQ is applied twice.'))
				.toBeInTheDocument();
			await expect.element(leaveToDevice()).toBeInTheDocument();
			expect(await applyHere().all()).toHaveLength(0);
		});

		it('gives the EQ to the device again from "Leave the EQ to the device"', async () => {
			connect();
			devicePeqStore.setAudioThroughDevice(false);
			render(EqAudioPlayer);

			await leaveToDevice().click();

			expect(devicePeqStore.audioThroughDevice).toBe(true);
			expect(devicePeqStore.audioPathChoice).toEqual({ device: 'FiiO KA17', through: true });
			await expect.element(eqSwitch()).toBeDisabled();
			await expect.element(applyHere()).toBeInTheDocument();
			expect(await leaveToDevice().all()).toHaveLength(0);
		});

		it('asks about a device held over the link, and leaves the switch alone', async () => {
			connect({ connectionType: 'link' });
			render(EqAudioPlayer);

			await expect.element(eqSwitch()).toBeEnabled();
			await expect
				.element(page.getByText('Listening through FiiO KA17? Then the EQ is applied twice.'))
				.toBeInTheDocument();
			await expect.element(leaveToDevice()).toBeInTheDocument();
			expect(await applyHere().all()).toHaveLength(0);

			await leaveToDevice().click();
			expect(devicePeqStore.playsEq).toBe(true);
			await expect.element(eqSwitch()).toBeDisabled();
		});

		it('shows neither line, and a usable switch, while the device’s EQ is off', async () => {
			connect({ slot: 240 });
			render(EqAudioPlayer);

			await expect.element(eqSwitch()).toBeEnabled();
			await expect.element(eqSwitch()).toBeChecked();
			expect(await applyHere().all()).toHaveLength(0);
			expect(await leaveToDevice().all()).toHaveLength(0);
		});

		it('follows the device connecting and disconnecting while mounted', async () => {
			render(EqAudioPlayer);
			await expect.element(eqSwitch()).toBeEnabled();

			connect();
			await expect.element(eqSwitch()).toBeDisabled();
			await expect.element(applyHere()).toBeInTheDocument();

			devicePeqStore.setDisconnected();
			await expect.element(eqSwitch()).toBeEnabled();
			expect(await applyHere().all()).toHaveLength(0);
			expect(await leaveToDevice().all()).toHaveLength(0);
		});

		it('keeps the switch disabled with the equalizer off, whoever applies the EQ', async () => {
			eqStore.isEnabled = false;
			connect({ connectionType: 'link' });
			render(EqAudioPlayer);

			await expect.element(eqSwitch()).toBeDisabled();
		});
	});

	// ── Transport ────────────────────────────────────────────────────────────

	describe('transport', () => {
		it('keeps play and stop disabled until a source is chosen', async () => {
			render(EqAudioPlayer);

			await expect.element(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
			await expect.element(page.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled();
		});

		it('keeps play disabled for the file source until a file is loaded', async () => {
			render(EqAudioPlayer);
			await sourceSelect().selectOptions('file');

			await expect.element(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
			// Stop only needs a source, so it comes back straight away.
			await expect.element(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
		});

		it('starts playback through the service', async () => {
			const toggle = vi.spyOn(audioPlayerService, 'togglePlay').mockImplementation(() => {});
			render(EqAudioPlayer);
			await sourceSelect().selectOptions('white');

			await page.getByRole('button', { name: 'Play', exact: true }).click();
			expect(toggle).toHaveBeenCalledTimes(1);
		});

		it('stops playback through the service', async () => {
			const stop = vi.spyOn(audioPlayerService, 'stop').mockImplementation(() => {});
			render(EqAudioPlayer);
			await sourceSelect().selectOptions('white');

			await page.getByRole('button', { name: 'Stop', exact: true }).click();
			expect(stop).toHaveBeenCalledTimes(1);
		});

		it('sends the volume slider position to the service', async () => {
			render(EqAudioPlayer);
			await volumeSlider().fill('0.25');
			expect(audioPlayerService.volume).toBeCloseTo(0.25, 5);
		});

		it('swaps in the muted icon at zero volume', async () => {
			render(EqAudioPlayer);
			await volumeSlider().fill('0');
			expect(audioPlayerService.volume).toBe(0);
			// lucide renders the icon name onto the svg's class list.
			await expect
				.element(page.getByRole('button', { name: 'Stop', exact: true }))
				.toBeInTheDocument();
			expect(document.querySelector('.lucide-volume-x, .lucide-volume-off')).not.toBeNull();
		});
	});

	// ── File upload ──────────────────────────────────────────────────────────

	describe('file upload', () => {
		function pick(file: File) {
			const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
			const dt = new DataTransfer();
			dt.items.add(file);
			input.files = dt.files;
			input.dispatchEvent(new Event('change', { bubbles: true }));
			return input;
		}

		it('toasts instead of rejecting when the file cannot be decoded', async () => {
			vi.spyOn(audioPlayerService, 'loadFile').mockRejectedValue(new DOMException('bad'));
			vi.spyOn(console, 'error').mockImplementation(() => {});
			const error = vi.spyOn(toast, 'error');
			render(EqAudioPlayer);
			await sourceSelect().selectOptions('file');

			const input = pick(new File(['x'], 'song.opus', { type: 'audio/ogg' }));
			await expect.poll(() => error.mock.calls.length).toBe(1);
			expect(error.mock.calls[0][0]).toContain('song.opus');
			// Cleared so re-picking the same file fires change again
			expect(input.value).toBe('');
		});
	});
});
