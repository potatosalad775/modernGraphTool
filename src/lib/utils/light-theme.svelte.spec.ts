import { afterEach, describe, expect, it } from 'vitest';
import { resolveLightTheme } from './light-theme.js';

// The real CSSOM: a stylesheet with a light :root and a .dark block, read while <html> is dark.
describe('resolveLightTheme in a browser', () => {
	let style: HTMLStyleElement | null = null;
	afterEach(() => {
		style?.remove();
		document.documentElement.classList.remove('dark');
	});

	it('returns the :root values even while the page is dark', () => {
		style = document.createElement('style');
		style.textContent = `
			:root { --color-graph-grid-major: rgba(1, 2, 3, 0.4); --color-base-100: oklch(97% 0 0); }
			.dark { --color-graph-grid-major: rgba(255, 255, 255, 0.15); --color-base-100: oklch(30% 0 0); }
		`;
		document.head.appendChild(style);
		document.documentElement.classList.add('dark');

		const vars = resolveLightTheme();
		expect(vars['--color-graph-grid-major']).toBe('rgba(1, 2, 3, 0.4)');
		expect(vars['--color-base-100']).toBe('oklch(97% 0 0)');
		// Never touched the live theme.
		expect(document.documentElement.classList.contains('dark')).toBe(true);
	});
});
