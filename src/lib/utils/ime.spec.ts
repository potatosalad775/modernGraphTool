import { describe, it, expect } from 'vitest';
import { isImeComposing } from './ime.js';

const key = (init: { isComposing?: boolean; keyCode?: number }) => init as KeyboardEvent;

describe('isImeComposing', () => {
	it('is true while composing', () => {
		expect(isImeComposing(key({ isComposing: true, keyCode: 13 }))).toBe(true);
	});

	it('is true for the Safari keyCode 229 keydown after compositionend', () => {
		expect(isImeComposing(key({ isComposing: false, keyCode: 229 }))).toBe(true);
	});

	it('is false for an ordinary key', () => {
		expect(isImeComposing(key({ isComposing: false, keyCode: 13 }))).toBe(false);
	});
});
