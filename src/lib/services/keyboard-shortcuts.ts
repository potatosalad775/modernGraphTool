import { commandHistory } from './command-history.svelte.js';
import { dataProvider } from './data-provider.svelte.js';
import { eqCommands } from './eq-commands.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { menuStore } from '#lib/stores/menu-store.svelte.js';

/**
 * The app's global keyboard shortcuts. `AppShell` only binds `onKeydown`, `onKeyup` and `onBlur`
 * on `<svelte:window>`, so they fire from any panel; the logic lives here.
 *
 * Every shortcut except the `\` release is ignored while focus is in an INPUT, a TEXTAREA or a
 * contenteditable element.
 *
 * - `\` held — flips the equalizer until release (`eqStore.holdMomentary`): a bypass when it was
 *   on, an audition when it was off. Ignored with Ctrl, Meta or Alt (Shift is allowed), and with
 *   no EQ source phone. A repeat is swallowed. Released by keyup of `\` (whatever has focus then)
 *   and by window blur, which swallows the keyup.
 * - Ctrl/Cmd+Z — undo. Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y — redo.
 * - `1`–`4` — switch to the Device, Graph, Equalizer or Misc panel. Ignored with Ctrl, Meta, Alt
 *   or Shift.
 */

/**
 * What the handlers read of a keyboard event: a real `KeyboardEvent` is assignable, and so is a
 * plain object in a node spec. A `target` with no `tagName` (the `window`) is not editable.
 */
export interface ShortcutKeyEvent {
	key: string;
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
	repeat: boolean;
	target: EventTarget | EditableTarget | null;
	preventDefault(): void;
}

/** The part of an element the editable check reads. */
export interface EditableTarget {
	tagName?: string;
	isContentEditable?: boolean;
}

const PANELS = ['device', 'graph', 'equalizer', 'misc'] as const;

function isEditable(target: ShortcutKeyEvent['target']): boolean {
	const el = target as EditableTarget | null;
	return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || !!el?.isContentEditable;
}

/** Undo the last command. Flushes pending EQ edits first, then re-syncs the phones' channels. */
export function undo(): void {
	// Flush any pending EQ-edit burst so undo doesn't land between
	// a coalescer's capture and its deferred commit.
	eqCommands.flushAll();
	commandHistory.undo(frStore);
	// Add/Remove change the phone count that channel display depends on —
	// re-sync since that derived display state isn't itself command-tracked.
	dataProvider.syncPhoneChannels();
}

/** Redo the next command, the same way `undo` goes about it. */
export function redo(): void {
	eqCommands.flushAll();
	commandHistory.redo(frStore);
	dataProvider.syncPhoneChannels();
}

export function onKeydown(e: ShortcutKeyEvent): void {
	const inEditable = isEditable(e.target);

	const mod = e.metaKey || e.ctrlKey;

	// `\` (backslash) — press-and-hold to flip the EQ state momentarily for A/B
	// comparison. Bidirectional: it bypasses a live EQ and auditions a disabled
	// one, so the comparison can be started from either side. Ignored inside text
	// inputs, and when there is no EQ source phone to compare against.
	if (!inEditable && !mod && !e.altKey && e.key === '\\') {
		if (e.repeat) {
			e.preventDefault();
			return;
		}
		if (eqStore.holdMomentary()) e.preventDefault();
		return;
	}

	if (inEditable) return;

	if (mod && e.key === 'z' && !e.shiftKey) {
		e.preventDefault();
		undo();
		return;
	}

	if (mod && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
		e.preventDefault();
		redo();
		return;
	}

	if (!mod && !e.altKey && !e.shiftKey) {
		const num = parseInt(e.key);
		if (num >= 1 && num <= 4) {
			e.preventDefault();
			menuStore.setPanel(PANELS[num - 1]);
		}
	}
}

export function onKeyup(e: ShortcutKeyEvent): void {
	// Restore EQ regardless of focus target — the keyup may land in an input
	// if the user tabbed during the hold.
	if (e.key === '\\') eqStore.releaseMomentary();
}

// Losing window focus mid-hold (alt-tab, devtools) swallows the keyup, which
// would otherwise leave EQ bypassed indefinitely — restore on blur too.
export function onBlur(): void {
	eqStore.releaseMomentary();
}
