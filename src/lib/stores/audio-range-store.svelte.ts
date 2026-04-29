/**
 * Listening-range state for the EqAudioPlayer's "Frequency selection" mode.
 *
 * When `isFrequencySelectionMode` is true, the graph's range overlay accepts
 * click-and-drag to set the active band, and the audio chain inserts a
 * highpass/lowpass pair gating playback to the band. EQ-node interaction on
 * the graph is mutually exclusive with this mode.
 *
 * Range bounds are kept in Hz, defaulted to the full audible band.
 */
class AudioRangeStore {
	isFrequencySelectionMode = $state(false);
	fromHz = $state(20);
	toHz = $state(20000);

	setRange(fromHz: number, toHz: number): void {
		const lo = Math.round(Math.max(20, Math.min(20000, Math.min(fromHz, toHz))));
		const hi = Math.round(Math.max(20, Math.min(20000, Math.max(fromHz, toHz))));
		// Clamp to a minimum bandwidth so the bandpass can't fully close.
		this.fromHz = lo;
		this.toHz = Math.max(hi, lo + 1);
	}

	reset(): void {
		this.fromHz = 20;
		this.toHz = 20000;
	}
}

export const audioRangeStore = new AudioRangeStore();
