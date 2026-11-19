import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, generateFullPalette } from './oklch';
import { EXTREME_INPUTS } from './oklch.fixtures';
import { renderThemeCss } from './theme-css';

const SHIPPED = readFileSync(new URL('../../../defaults/theme.css', import.meta.url), 'utf8');

/**
 * The `--color-*` names each rule declares, keyed by its selector path
 * (`@media (prefers-contrast: more) .dark`). Comments are stripped first: the
 * shipped file names `--color-warning` inside one.
 */
function declaredNames(css: string): Map<string, Set<string>> {
	const blocks = new Map<string, Set<string>>();
	const selectors: string[] = [];
	let text = '';
	for (const char of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
		if (char === '{') {
			selectors.push(text.trim());
			text = '';
		} else if (char === '}') {
			const names = [...text.matchAll(/(--color-[\w-]+)\s*:/g)].map((match) => match[1]);
			if (names.length > 0) blocks.set(selectors.join(' '), new Set(names));
			selectors.pop();
			text = '';
		} else {
			text += char;
		}
	}
	return blocks;
}

describe('renderThemeCss', () => {
	it('declares the same tokens in each block as the shipped defaults/theme.css', () => {
		// Fails the next time a token lands in the shipped theme and not in the
		// generator, which is how the generator fell behind the contrast block.
		const shipped = declaredNames(SHIPPED);
		expect([...shipped.keys()]).toEqual([
			':root',
			'.dark',
			'@media (prefers-contrast: more) :root',
			'@media (prefers-contrast: more) .dark'
		]);
		expect(declaredNames(renderThemeCss(generateFullPalette(DEFAULT_INPUTS)))).toEqual(shipped);
	});

	it('writes no NaN or undefined for extreme inputs', () => {
		for (const [i, inputs] of EXTREME_INPUTS.entries()) {
			const css = renderThemeCss(generateFullPalette(inputs));
			expect(css, `case${i}`).not.toMatch(/NaN|undefined/);
		}
	});
});
