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
import EqAudioPlayer from './EqAudioPlayer.svelte';
import { audioPlayerService } from '$lib/services/audio-player-service.svelte.js';
import { audioRangeStore } from '$lib/stores/audio-range-store.svelte.js';
import { audioSpectrumStore } from '$lib/stores/audio-spectrum-store.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';

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

		it('bounds the endpoint inputs to the band while range mode is active', async () => {
			audioRangeStore.isFrequencySelectionMode = true;
			audioRangeStore.setRange(500, 5000);

			// The range section renders its own From/To above the sweep pair.
			await expect.element(numberBox('From').last()).toHaveAttribute('min', '500');
			await expect.element(numberBox('From').last()).toHaveAttribute('max', '5000');
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

	// ── Transport ────────────────────────────────────────────────────────────

	describe('transport', () => {
		it('keeps play and stop disabled until a source is chosen', async () => {
			render(EqAudioPlayer);

			await expect.element(page.getByRole('button', { name: 'Play Audio' })).toBeDisabled();
			await expect.element(page.getByRole('button', { name: 'Stop Audio' })).toBeDisabled();
		});

		it('keeps play disabled for the file source until a file is loaded', async () => {
			render(EqAudioPlayer);
			await sourceSelect().selectOptions('file');

			await expect.element(page.getByRole('button', { name: 'Play Audio' })).toBeDisabled();
			// Stop only needs a source, so it comes back straight away.
			await expect.element(page.getByRole('button', { name: 'Stop Audio' })).toBeEnabled();
		});

		it('starts playback through the service', async () => {
			const toggle = vi.spyOn(audioPlayerService, 'togglePlay').mockImplementation(() => {});
			render(EqAudioPlayer);
			await sourceSelect().selectOptions('white');

			await page.getByRole('button', { name: 'Play Audio' }).click();
			expect(toggle).toHaveBeenCalledTimes(1);
		});

		it('stops playback through the service', async () => {
			const stop = vi.spyOn(audioPlayerService, 'stop').mockImplementation(() => {});
			render(EqAudioPlayer);
			await sourceSelect().selectOptions('white');

			await page.getByRole('button', { name: 'Stop Audio' }).click();
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
			await expect.element(page.getByRole('button', { name: 'Stop Audio' })).toBeInTheDocument();
			expect(document.querySelector('.lucide-volume-x, .lucide-volume-off')).not.toBeNull();
		});
	});
});
