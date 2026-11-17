/**
 * Widgets that consume character keys, Delete/Backspace or the arrows themselves: a native
 * `<select>` (typeahead), and the composite widgets bits-ui renders (sliders, listboxes,
 * comboboxes, menus, spinbuttons).
 */
const WIDGET_SELECTOR =
	'select,[role="slider"],[role="listbox"],[role="combobox"],[role="option"],[role="spinbutton"],[role="menu"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]';

/** The part of an element the check reads, so a node spec can pass a plain object. */
export interface WidgetTarget {
	tagName?: string;
	closest?: (selector: string) => unknown;
}

/**
 * True when the event target or the focused element is such a widget. The window-level keyboard
 * shortcuts (`services/keyboard-shortcuts.ts`, `graph/GraphEqOverlay.ts`) stand down for it:
 * typing "1" to jump to an option must not also switch the panel.
 */
export function isWidgetFocused(target: WidgetTarget | EventTarget | null): boolean {
	const el = target as WidgetTarget | null;
	if (el?.tagName === 'SELECT' || el?.closest?.(WIDGET_SELECTOR)) return true;
	if (typeof document === 'undefined') return false;
	const active = document.activeElement;
	return !!(active && active !== target && active.closest(WIDGET_SELECTOR));
}
