import { commandHistory } from './command-history.svelte.js';
import { dataProvider } from './data-provider.svelte.js';
import { eqCommands } from './eq-commands.js';
import { audioPlaybackStore } from '#lib/stores/audio-playback-store.svelte.js';
import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { menuStore } from '#lib/stores/menu-store.svelte.js';
import { settingsStore } from '#lib/stores/settings-store.svelte.js';
import { isWidgetFocused } from '#lib/utils/widget-focus.js';
import * as m from '#lib/paraglide/messages.js';
import { toast } from '#lib/services/toast.js';

/**
 * The app's global keyboard shortcuts. `AppShell` only binds `onKeydown`, `onKeyup` and `onBlur`
 * on `<svelte:window>`, so they fire from any panel; the logic lives here.
 *
 * Every shortcut except the `\` release is ignored while focus is in an INPUT, a TEXTAREA or a
 * contenteditable element. The two bare-key ones (`\` and `1`–`4`) also stand down while a native
 * select or a listbox/combobox/slider-style widget has focus (`isWidgetFocused`: its typeahead owns
 * those characters), and when the user turned `settingsStore.singleKeyShortcuts` off (WCAG 2.1.4).
 * Undo and redo are modifier chords and stay on either way. The `\` release is never gated.
 *
 * - `\` held — flips the equalizer until release (`eqStore.holdMomentary`): a bypass when it was
 *   on, an audition when it was off. Ignored with Meta, or Ctrl without Alt (a chord), and with no
 *   EQ source phone, and while the audio player plays through a device that applies the EQ
 *   (`devicePeqStore.playsEq`): the hold can't reach that sound, so it says so instead of flipping
 *   the graph alone. Alt alone and Ctrl+Alt do not block it: they are how layouts type `\`
 *   (Option on macOS, AltGr on Windows). A repeat is swallowed. Matched on `key`, so it follows the layout; with Shift down the key
 *   reads `|` on a US layout, so a hold cannot start then. One that is running is released by
 *   keyup of `\` (whatever has focus then) or of the physical key that started it (`code`), which
 *   still counts when Shift made it read `|`, and by window blur, which swallows the keyup.
 * - Ctrl/Cmd+Z — undo. Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y — redo. The letter is matched without
 *   case: the browser reports `Z` with Shift or CapsLock down.
 * - `1`–`4` — switch to the Device, Graph, Equalizer or Misc panel. Ignored with Ctrl, Meta, Alt
 *   or Shift.
 */

/**
 * What the handlers read of a keyboard event: a real `KeyboardEvent` is assignable, and so is a
 * plain object in a node spec. A `target` with no `tagName` (the `window`) is not editable.
 */
export interface ShortcutKeyEvent {
	key: string;
	/** The physical key (`'Backslash'`), which does not change with Shift or the layout. */
	code: string;
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

/**
 * The physical key (`code`) that started the running `\` hold, or null. Handler bookkeeping,
 * not state anything reads: it lets the keyup release a hold when Shift changed what the key reads.
 */
let holdCode: string | null = null;

function releaseHold(): void {
	holdCode = null;
	eqStore.releaseMomentary();
}

function isEditable(target: ShortcutKeyEvent['target']): boolean {
	const el = target as EditableTarget | null;
	return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || !!el?.isContentEditable;
}

/**
 * Whether the modifiers make a real shortcut chord rather than part of typing the character. The
 * `\` hold matches the produced character (`key`), and layouts that type `\` with AltGr (German,
 * …) report it on Windows as Ctrl and Alt both down; on macOS they type it with Option (Alt alone).
 * So Alt alone, and Ctrl+Alt together, do not block it — Meta, or Ctrl without Alt, do.
 */
function isShortcutChord(e: Pick<ShortcutKeyEvent, 'metaKey' | 'ctrlKey' | 'altKey'>): boolean {
	return e.metaKey || (e.ctrlKey && !e.altKey);
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
	if (isEditable(e.target)) return;
	if (!isShortcutChord(e) && e.key === '\\') {
		startHold(e);
	} else if (e.metaKey || e.ctrlKey) {
		undoOrRedo(e);
	} else {
		switchPanel(e);
	}
}

/**
 * `\` (backslash) — press-and-hold to flip the EQ state momentarily for A/B
 * comparison. Bidirectional: it bypasses a live EQ and auditions a disabled
 * one, so the comparison can be started from either side. Ignored when there
 * is no EQ source phone to compare against.
 */
function startHold(e: ShortcutKeyEvent): void {
	// A bare key: off with the setting, and not while a select or listbox has focus.
	if (!settingsStore.singleKeyShortcuts || isWidgetFocused(e.target)) return;
	if (e.repeat) {
		e.preventDefault();
		return;
	}
	// The device is applying the EQ to what is playing, and a hold here can't lift it: the
	// graph would flip while the sound stayed the same.
	// Only where a hold would have started: not mid-hold, and not without an EQ source.
	const couldHold = eqStore.momentaryRestore === null && !!eqStore.sourcePhoneUUID;
	if (couldHold && audioPlaybackStore.isPlaying && devicePeqStore.playsEq) {
		e.preventDefault();
		toast.info(m.eq_hold_on_device({ device: devicePeqStore.deviceName ?? '' }), {
			id: 'eq-hold-on-device'
		});
		return;
	}
	if (eqStore.holdMomentary()) {
		holdCode = e.code || null;
		e.preventDefault();
	}
}

/** Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y. The caller checked the modifier. */
function undoOrRedo(e: ShortcutKeyEvent): void {
	// The browser reports `Z` with Shift or CapsLock down, so compare the letter without case and
	// let `shiftKey` alone tell undo from redo.
	const letter = e.key.toLowerCase();
	if (letter === 'z' && !e.shiftKey) {
		e.preventDefault();
		undo();
	} else if (letter === 'z' || letter === 'y') {
		e.preventDefault();
		redo();
	}
}

/** `1`–`4` with no modifier. A bare key, so it is gated like the hold. */
function switchPanel(e: ShortcutKeyEvent): void {
	if (e.altKey || e.shiftKey) return;
	if (!settingsStore.singleKeyShortcuts || isWidgetFocused(e.target)) return;
	const num = parseInt(e.key);
	if (num >= 1 && num <= 4) {
		e.preventDefault();
		menuStore.setPanel(PANELS[num - 1]);
	}
}

export function onKeyup(e: ShortcutKeyEvent): void {
	// Restore EQ regardless of focus target — the keyup may land in an input
	// if the user tabbed during the hold.
	// The physical key also counts: with Shift down before the release it reads `|`, not `\`.
	if (e.key === '\\' || (holdCode !== null && e.code === holdCode)) releaseHold();
}

// Losing window focus mid-hold (alt-tab, devtools) swallows the keyup, which
// would otherwise leave EQ bypassed indefinitely — restore on blur too.
export function onBlur(): void {
	releaseHold();
}
