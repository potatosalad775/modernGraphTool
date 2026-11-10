/**
 * `KeyboardShortcutBar` spells out the undo and redo chords. The modifier is joined to the key
 * with one `+`, whichever platform's modifier it is.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import KeyboardShortcutBar from './KeyboardShortcutBar.svelte';

/** The chord in the `kbd` of the row whose text ends in `label` ("Undo", "Redo"). */
function chord(label: string): string {
	const row = page.getByText(label).element();
	return row.querySelector('kbd')!.textContent!;
}

describe('KeyboardShortcutBar', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('spells the undo and redo chords with Ctrl on a non-Mac platform', async () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
		await render(KeyboardShortcutBar);

		await expect.poll(() => chord('Undo')).toBe('Ctrl+Z');
		expect(chord('Redo')).toBe('Ctrl+Shift+Z');
	});

	it('spells them with the command and shift glyphs on a Mac', async () => {
		vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
		await render(KeyboardShortcutBar);

		await expect.poll(() => chord('Undo')).toBe('⌘+Z');
		expect(chord('Redo')).toBe('⌘+⇧+Z');
	});
});
