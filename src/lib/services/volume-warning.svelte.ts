/**
 * The volume warning: before this page first changes what plays — a write to a hardware EQ, a
 * preset switch, or the audio player starting — the user is asked to pause or lower the volume.
 * A write can pop, drop out or jump in level mid-playback. Once per page session, covering both
 * the player and the hardware EQ; the "don't show again" setting silences it.
 *
 * A device connected in uniPEQ is uniPEQ's to warn about (its `status.consent`, shown by
 * `LinkDialogs`), so writes over the link don't come through here.
 */
import { settingsStore } from '$lib/stores/settings-store.svelte.js';

class VolumeWarning {
	/** The warning is up: what asked for it waits for the answer. */
	open = $state(false);
	#given = false;
	#then: (() => void) | null = null;
	#notNow: (() => void) | null = null;

	/** Whether what changes the sound may go ahead now. */
	get given(): boolean {
		return this.#given || !settingsStore.volumeWarning;
	}

	/**
	 * Bring the warning up unless the user has been warned, keeping `then` to run once they go on
	 * and `notNow` for when they don't. Whether it did: the caller stops there.
	 */
	ask(then?: () => void, notNow?: () => void): boolean {
		if (this.given) return false;
		this.open = true;
		if (then) this.#then = then;
		if (notNow) this.#notNow = notNow;
		return true;
	}

	/** The answer: go on runs what waited; `quiet` stops the warning for good. */
	answer(go: boolean, quiet = false): void {
		if (!this.open) return;
		const then = go ? this.#then : this.#notNow;
		this.#then = null;
		this.#notNow = null;
		this.open = false;
		if (go) {
			this.#given = true;
			if (quiet) settingsStore.setVolumeWarning(false);
		}
		then?.();
	}

	/** Specs only: back to a fresh page. */
	reset(): void {
		this.#given = false;
		this.#then = null;
		this.#notNow = null;
		this.open = false;
	}
}

export const volumeWarning = new VolumeWarning();
