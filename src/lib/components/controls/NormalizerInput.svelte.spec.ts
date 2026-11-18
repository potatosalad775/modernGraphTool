/**
 * `NormalizerInput` is the toolbar's Avg / Hz toggle and the frequency box beside it. Each commit
 * renormalizes every curve, so the box must commit once per edit, never per keystroke.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import NormalizerInput from './NormalizerInput.svelte';
import { graphStore } from '#lib/stores/graph-store.svelte.js';
import { dataProvider } from '#lib/services/data-provider.svelte.js';
import * as m from '#lib/paraglide/messages.js';

function hzInput() {
	return page.getByRole('spinbutton', { name: m.normalizer_input_hz_label() });
}

/** `fill()` fires `input` only; the blur is what commits, as leaving the field would. */
async function fillAndCommit(text: string) {
	await hzInput().fill(text);
	(hzInput().element() as HTMLInputElement).blur();
}

describe('NormalizerInput', () => {
	let renormalizeAll: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		graphStore.normType = 'Hz';
		graphStore.normHzValue = 500;
		renormalizeAll = vi.spyOn(dataProvider, 'renormalizeAll').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		graphStore.normType = 'Hz';
		graphStore.normHzValue = 500;
	});

	describe('frequency box', () => {
		it('has an accessible name', async () => {
			await render(NormalizerInput);

			await expect.element(hzInput()).toHaveValue(500);
		});

		it('commits once on change, not per keystroke', async () => {
			await render(NormalizerInput);

			await hzInput().fill('1000');
			expect(graphStore.normHzValue).toBe(500);
			expect(renormalizeAll).not.toHaveBeenCalled();

			(hzInput().element() as HTMLInputElement).blur();

			expect(graphStore.normHzValue).toBe(1000);
			expect(renormalizeAll).toHaveBeenCalledOnce();
		});

		it('clamps a committed value to 20-20000 Hz', async () => {
			await render(NormalizerInput);

			await fillAndCommit('5');
			expect(graphStore.normHzValue).toBe(20);
			await expect.element(hzInput()).toHaveValue(20);

			await fillAndCommit('99999');
			expect(graphStore.normHzValue).toBe(20000);
		});

		it('keeps the stored value when the box is emptied', async () => {
			await render(NormalizerInput);

			await fillAndCommit('');

			expect(graphStore.normHzValue).toBe(500);
			expect(renormalizeAll).not.toHaveBeenCalled();
			await expect.element(hzInput()).toHaveValue(500);
		});

		it('does not renormalize when the value did not change', async () => {
			await render(NormalizerInput);

			await fillAndCommit('500');

			expect(renormalizeAll).not.toHaveBeenCalled();
		});

		it('is disabled in average mode', async () => {
			graphStore.normType = 'Avg';
			await render(NormalizerInput);

			await expect.element(hzInput()).toBeDisabled();
		});
	});

	describe('Avg / Hz toggle', () => {
		const avg = () => page.getByRole('button', { name: m.normalizer_input_avg_btn() });
		const hz = () => page.getByRole('button', { name: m.normalizer_input_hz_btn() });

		it('states the active mode, not only colours it', async () => {
			await render(NormalizerInput);

			await expect.element(hz()).toHaveAttribute('aria-pressed', 'true');
			await expect.element(avg()).toHaveAttribute('aria-pressed', 'false');
		});

		it('switches mode and renormalizes', async () => {
			await render(NormalizerInput);

			await avg().click();

			expect(graphStore.normType).toBe('Avg');
			expect(renormalizeAll).toHaveBeenCalledOnce();
			await expect.element(avg()).toHaveAttribute('aria-pressed', 'true');
			await expect.element(hz()).toHaveAttribute('aria-pressed', 'false');
		});
	});
});
