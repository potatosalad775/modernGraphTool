import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eqStore, type EQFilter } from '#lib/stores/eq-store.svelte.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { menuStore } from '#lib/stores/menu-store.svelte.js';
import type { FRDataObject } from '#lib/types/data-types.js';
import { AddFRDataCommand } from './commands.js';
import { commandHistory } from './command-history.svelte.js';
import { dataProvider } from './data-provider.svelte.js';
import { eqCommands } from './eq-commands.js';
import {
	onBlur,
	onKeydown,
	onKeyup,
	redo,
	undo,
	type ShortcutKeyEvent
} from './keyboard-shortcuts.js';

type KeyInit = Partial<Omit<ShortcutKeyEvent, 'preventDefault'>>;

/** A key event as a plain object, with `preventDefault` spied. */
function keyEvent(key: string, init: KeyInit = {}) {
	return {
		key,
		code: key === '\\' ? 'Backslash' : `Key${key.toUpperCase()}`,
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		repeat: false,
		target: null,
		preventDefault: vi.fn(),
		...init
	} satisfies ShortcutKeyEvent;
}

function press(key: string, init: KeyInit = {}) {
	const e = keyEvent(key, init);
	onKeydown(e);
	return e;
}

function release(key: string, init: KeyInit = {}) {
	const e = keyEvent(key, init);
	onKeyup(e);
	return e;
}

const INPUT = { tagName: 'INPUT' };
const TEXTAREA = { tagName: 'TEXTAREA' };
const CONTENTEDITABLE = { tagName: 'DIV', isContentEditable: true };
const EDITABLES = [
	['an INPUT', INPUT],
	['a TEXTAREA', TEXTAREA],
	['a contenteditable element', CONTENTEDITABLE]
] as const;

function makeFilter(overrides: Partial<EQFilter> = {}): EQFilter {
	return { enabled: true, type: 'PK', freq: 1000, q: 1.0, gain: 0, ...overrides };
}

function makePhone(uuid: string, dispChannel: FRDataObject['dispChannel']): FRDataObject {
	const channel = {
		data: [[1000, 80]] as [number, number][],
		metadata: { minFreq: 20, maxFreq: 20000 }
	};
	return {
		uuid,
		type: 'phone',
		identifier: `Brand Phone-${uuid}`,
		channels: { L: channel, R: channel, AVG: channel },
		dispChannel,
		dispSuffix: '',
		colors: { L: '#ff0000', R: '#0000ff', AVG: '#00ff00' },
		dash: '1 0'
	};
}

describe('keyboard shortcuts', () => {
	beforeEach(() => {
		eqStore.filters = [];
		eqStore.preamp = 0;
		eqStore.isEnabled = false;
		eqStore.momentaryOverride = null;
		eqStore.momentaryRestore = null;
		eqStore.sourcePhoneUUID = 'source-phone';
		frStore.clear();
		commandHistory.clear();
		eqCommands.flushAll();
		menuStore.currentPanel = 'graph';
	});

	describe('\\ momentary override', () => {
		it('bypasses a live EQ while held and restores it on release', () => {
			eqStore.isEnabled = true;

			const down = press('\\');

			expect(down.preventDefault).toHaveBeenCalledOnce();
			expect(eqStore.isEnabled).toBe(false);
			expect(eqStore.momentaryOverride).toBe('bypass');
			expect(eqStore.momentaryRestore).toBe(true);

			release('\\');

			expect(eqStore.isEnabled).toBe(true);
			expect(eqStore.momentaryOverride).toBeNull();
			expect(eqStore.momentaryRestore).toBeNull();
		});

		it('auditions a disabled EQ while held and turns it off again on release', () => {
			eqStore.isEnabled = false;

			const down = press('\\');

			expect(down.preventDefault).toHaveBeenCalledOnce();
			expect(eqStore.isEnabled).toBe(true);
			expect(eqStore.momentaryOverride).toBe('audition');
			expect(eqStore.momentaryRestore).toBe(false);

			release('\\');

			expect(eqStore.isEnabled).toBe(false);
			expect(eqStore.momentaryOverride).toBeNull();
			expect(eqStore.momentaryRestore).toBeNull();
		});

		it.each(EDITABLES)('is ignored in %s', (_name, target) => {
			eqStore.isEnabled = true;

			const e = press('\\', { target });

			expect(e.preventDefault).not.toHaveBeenCalled();
			expect(eqStore.isEnabled).toBe(true);
			expect(eqStore.momentaryRestore).toBeNull();
		});

		// A real shortcut chord. Alt alone is not one: it can be how the layout types `\`.
		it.each([
			['Ctrl', { ctrlKey: true }],
			['Meta', { metaKey: true }],
			['Meta+Alt', { metaKey: true, altKey: true }],
			['Ctrl+Meta+Alt', { ctrlKey: true, metaKey: true, altKey: true }]
		])('is ignored with %s held', (_name, init) => {
			eqStore.isEnabled = true;

			const e = press('\\', init);

			expect(e.preventDefault).not.toHaveBeenCalled();
			expect(eqStore.isEnabled).toBe(true);
			expect(eqStore.momentaryRestore).toBeNull();
		});

		// The match is on the produced character, so the modifier a layout types it with must not
		// block it: AltGr reaches the browser as Ctrl+Alt on Windows, Option as Alt on macOS.
		it.each([
			['AltGr (Ctrl+Alt)', { ctrlKey: true, altKey: true }],
			['Alt alone (Option)', { altKey: true }]
		])('starts with %s held', (_name, init) => {
			eqStore.isEnabled = true;

			const e = press('\\', init);

			expect(e.preventDefault).toHaveBeenCalledOnce();
			expect(eqStore.isEnabled).toBe(false);
			expect(eqStore.momentaryOverride).toBe('bypass');
		});

		it('releases an AltGr hold on the keyup of the same physical key, whatever it reads', () => {
			eqStore.isEnabled = true;
			press('\\', { code: 'KeyQ', ctrlKey: true, altKey: true });

			// AltGr came up first, so the keyup reads as the plain letter.
			release('q', { code: 'KeyQ' });

			expect(eqStore.isEnabled).toBe(true);
			expect(eqStore.momentaryOverride).toBeNull();
		});

		it('is allowed with Shift held', () => {
			eqStore.isEnabled = true;

			const e = press('\\', { shiftKey: true });

			expect(e.preventDefault).toHaveBeenCalledOnce();
			expect(eqStore.momentaryOverride).toBe('bypass');
		});

		it('works when the event target is the window, which has no tagName', () => {
			eqStore.isEnabled = true;

			press('\\', { target: {} });

			expect(eqStore.momentaryOverride).toBe('bypass');
		});

		it('is ignored with no EQ source, and does not preventDefault', () => {
			eqStore.sourcePhoneUUID = null;
			eqStore.isEnabled = true;

			const e = press('\\');

			expect(e.preventDefault).not.toHaveBeenCalled();
			expect(eqStore.isEnabled).toBe(true);
			expect(eqStore.momentaryOverride).toBeNull();
			expect(eqStore.momentaryRestore).toBeNull();
		});

		it('swallows a key repeat without changing anything', () => {
			eqStore.isEnabled = true;
			press('\\');

			const e = press('\\', { repeat: true });

			expect(e.preventDefault).toHaveBeenCalledOnce();
			expect(eqStore.isEnabled).toBe(false);
			expect(eqStore.momentaryOverride).toBe('bypass');
			expect(eqStore.momentaryRestore).toBe(true);
		});

		it('swallows a repeat even when no hold is active', () => {
			eqStore.sourcePhoneUUID = null;

			const e = press('\\', { repeat: true });

			expect(e.preventDefault).toHaveBeenCalledOnce();
			expect(eqStore.momentaryRestore).toBeNull();
		});

		it('ignores a second press during a hold', () => {
			eqStore.isEnabled = true;
			press('\\');

			const second = press('\\');

			expect(second.preventDefault).not.toHaveBeenCalled();
			expect(eqStore.isEnabled).toBe(false);
			expect(eqStore.momentaryOverride).toBe('bypass');
			// Had it flipped again, the release would restore the bypassed state.
			expect(eqStore.momentaryRestore).toBe(true);
		});

		it('releases on keyup even when focus has moved into an input', () => {
			eqStore.isEnabled = true;
			press('\\');

			release('\\', { target: INPUT });

			expect(eqStore.isEnabled).toBe(true);
			expect(eqStore.momentaryOverride).toBeNull();
		});

		it('releases on the keyup of the physical key even when Shift made it report "|"', () => {
			eqStore.isEnabled = true;
			press('\\', { code: 'Backslash' });

			// Shift went down before `\` came up: the layout now reports `|`, the key is the same.
			release('|', { code: 'Backslash', shiftKey: true });

			expect(eqStore.isEnabled).toBe(true);
			expect(eqStore.momentaryOverride).toBeNull();
			expect(eqStore.momentaryRestore).toBeNull();
		});

		it('does not release on the keyup of a different physical key during a hold', () => {
			eqStore.isEnabled = true;
			press('\\', { code: 'Backslash' });

			release('|', { code: 'KeyA', shiftKey: true });

			expect(eqStore.isEnabled).toBe(false);
			expect(eqStore.momentaryOverride).toBe('bypass');
		});

		it('forgets the physical key once the hold is over', () => {
			eqStore.isEnabled = true;
			press('\\', { code: 'Backslash' });
			onBlur();
			// A hold begun by another physical key: the old key's code must not release it.
			press('\\', { code: 'IntlBackslash' });

			release('|', { code: 'Backslash', shiftKey: true });

			expect(eqStore.momentaryOverride).toBe('bypass');
			release('\\', { code: 'IntlBackslash' });
			expect(eqStore.momentaryOverride).toBeNull();
		});

		it('ignores the keyup of other keys', () => {
			eqStore.isEnabled = true;
			press('\\');

			release('a');

			expect(eqStore.isEnabled).toBe(false);
			expect(eqStore.momentaryOverride).toBe('bypass');
		});

		it('releases on window blur', () => {
			eqStore.isEnabled = true;
			press('\\');

			onBlur();

			expect(eqStore.isEnabled).toBe(true);
			expect(eqStore.momentaryOverride).toBeNull();
			expect(eqStore.momentaryRestore).toBeNull();
		});

		it('does nothing on blur without a hold', () => {
			eqStore.isEnabled = true;

			onBlur();

			expect(eqStore.isEnabled).toBe(true);
		});

		it('does nothing on a keyup that follows a blur release', () => {
			eqStore.isEnabled = true;
			press('\\');
			onBlur();
			// The user toggled the EQ off between the blur and the keyup.
			eqStore.isEnabled = false;

			release('\\');

			expect(eqStore.isEnabled).toBe(false);
			expect(eqStore.momentaryOverride).toBeNull();
		});

		it('keeps an enable made through ensureEnabled() during an audition hold', () => {
			eqStore.isEnabled = false;
			press('\\');

			eqCommands.ensureEnabled();
			release('\\');

			expect(eqStore.isEnabled).toBe(true);
			expect(eqStore.momentaryOverride).toBeNull();
			expect(eqStore.momentaryRestore).toBeNull();
		});

		it('keeps an enable made through ensureEnabled() during a bypass hold', () => {
			eqStore.isEnabled = true;
			press('\\');

			eqCommands.ensureEnabled();
			// Still bypassed until the key comes up.
			expect(eqStore.isEnabled).toBe(false);
			release('\\');

			expect(eqStore.isEnabled).toBe(true);
		});
	});

	describe('undo', () => {
		it.each([
			['Ctrl', { ctrlKey: true }],
			['Meta', { metaKey: true }]
		])('%s+z undoes the last command and prevents the default', (_name, init) => {
			eqCommands.addBand(makeFilter({ freq: 500 }));
			expect(eqStore.filters).toHaveLength(1);

			const e = press('z', init);

			expect(e.preventDefault).toHaveBeenCalledOnce();
			expect(eqStore.filters).toHaveLength(0);
		});

		it.each(EDITABLES)('is ignored in %s', (_name, target) => {
			eqCommands.addBand(makeFilter());

			const e = press('z', { ctrlKey: true, target });

			expect(e.preventDefault).not.toHaveBeenCalled();
			expect(eqStore.filters).toHaveLength(1);
		});

		it('does nothing on a bare z', () => {
			eqCommands.addBand(makeFilter());

			const e = press('z');

			expect(e.preventDefault).not.toHaveBeenCalled();
			expect(eqStore.filters).toHaveLength(1);
		});

		it('commits pending coalesced EQ edits before undoing', () => {
			eqCommands.addBand(makeFilter({ gain: 0 }));
			// Applied to the store at once, committed to history only when the burst settles.
			eqCommands.updateBand(0, { gain: 3 });
			expect(eqStore.filters[0].gain).toBe(3);

			press('z', { ctrlKey: true });

			// The undo reversed the gain edit, not the add: the burst was flushed first.
			expect(eqStore.filters).toHaveLength(1);
			expect(eqStore.filters[0].gain).toBe(0);

			press('y', { ctrlKey: true });
			expect(eqStore.filters[0].gain).toBe(3);
		});
	});

	describe('redo', () => {
		it('Ctrl+y redoes the last undone command and prevents the default', () => {
			eqCommands.addBand(makeFilter({ freq: 500 }));
			press('z', { ctrlKey: true });
			expect(eqStore.filters).toHaveLength(0);

			const e = press('y', { ctrlKey: true });

			expect(e.preventDefault).toHaveBeenCalledOnce();
			expect(eqStore.filters).toHaveLength(1);
			expect(eqStore.filters[0].freq).toBe(500);
		});

		it('Meta+y redoes too', () => {
			eqCommands.addBand(makeFilter());
			press('z', { metaKey: true });

			press('y', { metaKey: true });

			expect(eqStore.filters).toHaveLength(1);
		});

		it.each([
			['Ctrl', { ctrlKey: true }],
			['Meta', { metaKey: true }]
		])('%s+Shift+Z redoes (the browser reports "Z")', (_name, init) => {
			eqCommands.addBand(makeFilter({ freq: 500 }));
			press('z', init);
			expect(eqStore.filters).toHaveLength(0);

			const e = press('Z', { ...init, shiftKey: true });

			expect(e.preventDefault).toHaveBeenCalledOnce();
			expect(eqStore.filters).toHaveLength(1);
		});

		it('Ctrl+Z undoes with CapsLock on (key "Z", no Shift)', () => {
			eqCommands.addBand(makeFilter());

			const e = press('Z', { ctrlKey: true });

			expect(e.preventDefault).toHaveBeenCalledOnce();
			expect(eqStore.filters).toHaveLength(0);
		});

		it('Ctrl+Y redoes with CapsLock on (key "Y")', () => {
			eqCommands.addBand(makeFilter());
			press('z', { ctrlKey: true });

			const e = press('Y', { ctrlKey: true });

			expect(e.preventDefault).toHaveBeenCalledOnce();
			expect(eqStore.filters).toHaveLength(1);
		});

		it.each(EDITABLES)('is ignored in %s', (_name, target) => {
			eqCommands.addBand(makeFilter());
			press('z', { ctrlKey: true });

			const e = press('y', { ctrlKey: true, target });

			expect(e.preventDefault).not.toHaveBeenCalled();
			expect(eqStore.filters).toHaveLength(0);
		});
	});

	describe('phone channels after undo and redo', () => {
		it('re-syncs the remaining phone to the phone count', () => {
			commandHistory.execute(new AddFRDataCommand(makePhone('a', ['AVG'])), frStore);
			commandHistory.execute(new AddFRDataCommand(makePhone('b', ['AVG'])), frStore);

			// Undoing the second add leaves one phone, which shows L+R rather than the average.
			press('z', { ctrlKey: true });
			expect(frStore.has('b')).toBe(false);
			expect(frStore.get('a')!.dispChannel).toEqual(['L', 'R']);

			// Redoing it makes two again: both collapse back to AVG.
			press('y', { ctrlKey: true });
			expect(frStore.has('b')).toBe(true);
			expect(frStore.get('a')!.dispChannel).toEqual(['AVG']);
			expect(frStore.get('b')!.dispChannel).toEqual(['AVG']);
		});

		it('calls syncPhoneChannels after the history step', () => {
			const order: string[] = [];
			const flush = vi
				.spyOn(eqCommands, 'flushAll')
				.mockImplementation(() => void order.push('flush'));
			const step = vi.spyOn(commandHistory, 'undo').mockImplementation(() => {
				order.push('undo');
				return null;
			});
			const sync = vi
				.spyOn(dataProvider, 'syncPhoneChannels')
				.mockImplementation(() => void order.push('sync'));
			try {
				press('z', { ctrlKey: true });
			} finally {
				flush.mockRestore();
				step.mockRestore();
				sync.mockRestore();
			}

			expect(order).toEqual(['flush', 'undo', 'sync']);
		});
	});

	describe('panel digits', () => {
		it.each([
			['1', 'device'],
			['2', 'graph'],
			['3', 'equalizer'],
			['4', 'misc']
		])('%s switches to the %s panel and prevents the default', (digit, panel) => {
			menuStore.currentPanel = panel === 'graph' ? 'device' : 'graph';

			const e = press(digit);

			expect(e.preventDefault).toHaveBeenCalledOnce();
			expect(menuStore.currentPanel).toBe(panel);
		});

		it.each([
			['Ctrl', { ctrlKey: true }],
			['Meta', { metaKey: true }],
			['Alt', { altKey: true }],
			['Shift', { shiftKey: true }]
		])('is ignored with %s held', (_name, init) => {
			const e = press('3', init);

			expect(e.preventDefault).not.toHaveBeenCalled();
			expect(menuStore.currentPanel).toBe('graph');
		});

		it('is ignored with AltGr (Ctrl+Alt) held', () => {
			const e = press('3', { ctrlKey: true, altKey: true });

			expect(e.preventDefault).not.toHaveBeenCalled();
			expect(menuStore.currentPanel).toBe('graph');
		});

		it.each(EDITABLES)('is ignored in %s', (_name, target) => {
			const e = press('3', { target });

			expect(e.preventDefault).not.toHaveBeenCalled();
			expect(menuStore.currentPanel).toBe('graph');
		});

		it.each(['0', '5', '9', 'a'])('ignores %s', (key) => {
			const e = press(key);

			expect(e.preventDefault).not.toHaveBeenCalled();
			expect(menuStore.currentPanel).toBe('graph');
		});
	});

	describe('undo() and redo()', () => {
		it('undo() reverses the last command and redo() re-applies it', () => {
			eqCommands.addBand(makeFilter({ freq: 700 }));

			undo();
			expect(eqStore.filters).toHaveLength(0);

			redo();
			expect(eqStore.filters).toHaveLength(1);
			expect(eqStore.filters[0].freq).toBe(700);
		});

		it('undo() flushes pending EQ edits first', () => {
			eqCommands.addBand(makeFilter({ gain: 0 }));
			eqCommands.updateBand(0, { gain: 4 });

			undo();

			expect(eqStore.filters).toHaveLength(1);
			expect(eqStore.filters[0].gain).toBe(0);
		});

		it('re-syncs phone channels', () => {
			commandHistory.execute(new AddFRDataCommand(makePhone('a', ['AVG'])), frStore);
			commandHistory.execute(new AddFRDataCommand(makePhone('b', ['AVG'])), frStore);

			undo();

			expect(frStore.get('a')!.dispChannel).toEqual(['L', 'R']);
		});

		it('do nothing on an empty history', () => {
			expect(() => {
				undo();
				redo();
			}).not.toThrow();
		});
	});
});
