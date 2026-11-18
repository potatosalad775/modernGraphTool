/**
 * `SelectionList` is the loaded-curves list: one row per curve, each with its own colour
 * picker, baseline / visibility / remove buttons, channel select and Y-offset stepper.
 *
 * The spec seeds `frStore` directly and asserts the accessible names (a screen-reader user
 * must be able to tell the rows apart), the baseline toggle state, and that a keyboard
 * activation of a Y-offset button steps once.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import SelectionList from './SelectionList.svelte';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { baseline } from '#lib/graph/baseline.js';
import { dataProvider } from '#lib/services/data-provider.svelte.js';
import type { FRDataObject } from '#lib/types/data-types.js';

function channel(db = 80) {
	return { data: [[1000, db]] as [number, number][], metadata: { minFreq: 20, maxFreq: 20000 } };
}

function makeItem(uuid: string, identifier: string, overrides: Partial<FRDataObject> = {}) {
	return {
		uuid,
		type: 'phone',
		identifier,
		channels: { L: channel(80), R: channel(78), AVG: channel(79) },
		dispChannel: ['AVG'],
		dispSuffix: '',
		colors: { L: '#f00', R: '#00f', AVG: '#0f0' },
		dash: '1 0',
		...overrides
	} as FRDataObject;
}

describe('SelectionList', () => {
	let updateYOffset: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		updateYOffset = vi.spyOn(dataProvider, 'updateYOffset').mockImplementation(() => {});
		frStore.set('a', makeItem('a', 'Alpha One'));
		frStore.set('b', makeItem('b', 'Beta Two', { dispSuffix: 'Foam' }));
	});

	afterEach(() => {
		baseline.restoreFromURL(null);
		frStore.clear();
		vi.restoreAllMocks();
	});

	it('says so when no curve is loaded', async () => {
		frStore.clear();
		await render(SelectionList);
		await expect.element(page.getByText('No curves loaded.')).toBeVisible();
	});

	it('names every row control after its curve', async () => {
		await render(SelectionList);
		for (const name of ['Alpha One', 'Beta Two Foam']) {
			await expect.element(page.getByRole('button', { name: `Remove ${name}` })).toBeVisible();
			await expect.element(page.getByRole('button', { name: `Hide ${name}` })).toBeVisible();
			await expect
				.element(page.getByRole('button', { name: `Set ${name} as baseline` }))
				.toBeVisible();
			await expect
				.element(page.getByRole('button', { name: `Increase Y offset of ${name}` }))
				.toBeVisible();
			await expect
				.element(page.getByRole('button', { name: `Decrease Y offset of ${name}` }))
				.toBeVisible();
			await expect
				.element(page.getByRole('spinbutton', { name: `Y offset of ${name}` }))
				.toBeVisible();
			await expect
				.element(page.getByRole('combobox', { name: `Channel of ${name}` }))
				.toBeVisible();
			await expect
				.element(page.getByRole('button', { name: `Pick color for ${name}` }))
				.toBeVisible();
		}
	});

	it('keeps the baseline button name constant and exposes its state with aria-pressed', async () => {
		await render(SelectionList);
		const button = page.getByRole('button', { name: 'Set Alpha One as baseline' });
		await expect.element(button).toHaveAttribute('aria-pressed', 'false');
		await button.click();
		await expect
			.element(page.getByRole('button', { name: 'Set Alpha One as baseline' }))
			.toHaveAttribute('aria-pressed', 'true');
		// The other row is untouched.
		await expect
			.element(page.getByRole('button', { name: 'Set Beta Two Foam as baseline' }))
			.toHaveAttribute('aria-pressed', 'false');
	});

	it('steps the Y offset once on Enter, not once per key repeat of a click', async () => {
		await render(SelectionList);
		const plus = page.getByRole('button', { name: 'Increase Y offset of Alpha One' });
		(plus.element() as HTMLElement).focus();
		await userEvent.keyboard('{Enter}');
		expect(updateYOffset).toHaveBeenCalledExactlyOnceWith('a', 1);
	});
});
