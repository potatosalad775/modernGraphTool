/**
 * `SmoothingButton` cycles the graph-wide smoothing: the five octave fractions, then REW's
 * Variable and Psychoacoustic smoothing under REW's own labels.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import SmoothingButton from './SmoothingButton.svelte';
import { dataProvider } from '#lib/services/data-provider.svelte.js';
import { graphStore } from '#lib/stores/graph-store.svelte.js';

// `Button` mirrors `title` into `aria-label`, and the title names the variable smoothings
// in full, so match the word every title shares.
const button = () => page.getByRole('button', { name: /smoothing/i });
const label = () => button().element().textContent;

describe('SmoothingButton', () => {
	afterEach(() => {
		graphStore.smoothValue = '1/48';
		vi.restoreAllMocks();
	});

	it('cycles through the fractions, then Var and Psy, and back', async () => {
		const reSmooth = vi.spyOn(dataProvider, 'reSmoothAll').mockImplementation(() => {});
		render(SmoothingButton);
		await expect.poll(label).toMatch(/1\/48oct/);

		const seen = [];
		for (let i = 0; i < 7; i++) {
			await button().click();
			seen.push(graphStore.smoothValue);
		}
		expect(seen).toEqual(['1/24', '1/12', '1/6', '1/3', 'Var', 'Psy', '1/48']);
		expect(reSmooth).toHaveBeenCalledTimes(7);
	});

	it('shows REW labels without "oct" and names them in the title', async () => {
		vi.spyOn(dataProvider, 'reSmoothAll').mockImplementation(() => {});
		render(SmoothingButton);
		for (let i = 0; i < 5; i++) await button().click();

		await expect.poll(label).toMatch(/Var\s*$/);
		await expect.element(button()).toHaveAttribute('title', 'Variable smoothing');
		await button().click();
		await expect.poll(label).toMatch(/Psy\s*$/);
		await expect.element(button()).toHaveAttribute('title', 'Psychoacoustic smoothing');
	});
});
