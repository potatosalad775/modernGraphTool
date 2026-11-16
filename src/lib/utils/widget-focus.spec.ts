import { describe, it, expect } from 'vitest';
import { isWidgetFocused } from './widget-focus.js';

describe('isWidgetFocused', () => {
	it('is true for a native select, by tag name', () => {
		expect(isWidgetFocused({ tagName: 'SELECT' })).toBe(true);
	});

	it('is true when the target sits inside a widget the selector matches', () => {
		const inside = { tagName: 'DIV', closest: (s: string) => (s.includes('listbox') ? {} : null) };
		expect(isWidgetFocused(inside)).toBe(true);
	});

	it('is false for a plain element and for no target', () => {
		expect(isWidgetFocused({ tagName: 'DIV', closest: () => null })).toBe(false);
		expect(isWidgetFocused({ tagName: 'BUTTON' })).toBe(false);
		expect(isWidgetFocused(null)).toBe(false);
	});
});
