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
		let lo = Math.round(Math.max(20, Math.min(20000, Math.min(fromHz, toHz))));
		let hi = Math.round(Math.max(20, Math.min(20000, Math.max(fromHz, toHz))));
		// Enforce a minimum bandwidth so the bandpass can't fully close, without
		// letting `hi` escape the 20 kHz ceiling — at the top of the domain the
		// separation is taken out of `lo` instead.
		if (hi - lo < 1) {
			if (lo < 20000) hi = lo + 1;
			else {
				hi = 20000;
				lo = 19999;
			}
		}
		this.fromHz = lo;
		this.toHz = hi;
	}

	reset(): void {
		this.fromHz = 20;
		this.toHz = 20000;
	}
}

export const audioRangeStore = new AudioRangeStore();
