import { afterEach, describe, expect, it, vi } from 'vitest';
import { settingsStore } from '$lib/stores/settings-store.svelte.js';
import { volumeWarning } from './volume-warning.svelte.js';

describe('volumeWarning', () => {
	afterEach(() => {
		settingsStore.setVolumeWarning(true);
		volumeWarning.reset();
	});

	it('holds what changes the sound until the user goes on, once per page', () => {
		const play = vi.fn();
		expect(volumeWarning.ask(play)).toBe(true);
		expect(volumeWarning.open).toBe(true);
		expect(play).not.toHaveBeenCalled();

		volumeWarning.answer(true);
		expect(volumeWarning.open).toBe(false);
		expect(play).toHaveBeenCalledOnce();
		expect(volumeWarning.ask(play)).toBe(false);
	});

	it('drops what waited on Not now, and asks again next time', () => {
		const play = vi.fn();
		const notNow = vi.fn();
		volumeWarning.ask(play, notNow);
		volumeWarning.answer(false);
		expect(play).not.toHaveBeenCalled();
		expect(notNow).toHaveBeenCalledOnce();
		expect(volumeWarning.ask(play)).toBe(true);
	});

	it('stops asking for good once told not to show it again', () => {
		volumeWarning.ask();
		volumeWarning.answer(true, true);
		expect(settingsStore.volumeWarning).toBe(false);
		volumeWarning.reset();
		expect(volumeWarning.ask()).toBe(false);
	});
});
