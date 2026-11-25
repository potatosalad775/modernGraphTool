import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import SegmentedControl from './SegmentedControl.svelte';

const OPTIONS = [
	{ value: 'a', label: 'Alpha' },
	{ value: 'b', label: 'Beta' },
	{ value: 'c', label: 'Gamma', disabled: true }
];

describe('SegmentedControl', () => {
	it('shows each option as a radio, with the value checked', async () => {
		await render(SegmentedControl, { value: 'a', options: OPTIONS, label: 'Pick' });

		await expect.element(page.getByRole('group', { name: 'Pick' })).toBeInTheDocument();
		await expect.element(page.getByRole('radio', { name: 'Alpha' })).toBeChecked();
		await expect.element(page.getByRole('radio', { name: 'Beta' })).not.toBeChecked();
	});

	it('picks another option on a click, and reports it', async () => {
		const onValueChange = vi.fn();
		await render(SegmentedControl, { value: 'a', options: OPTIONS, label: 'Pick', onValueChange });

		await page.getByRole('radio', { name: 'Beta' }).click();

		await expect.element(page.getByRole('radio', { name: 'Beta' })).toBeChecked();
		expect(onValueChange).toHaveBeenCalledExactlyOnceWith('b');
	});

	it('holds one option back while the rest can be picked', async () => {
		const onValueChange = vi.fn();
		await render(SegmentedControl, { value: 'a', options: OPTIONS, label: 'Pick', onValueChange });

		const held = page.getByRole('radio', { name: 'Gamma' });
		await expect.element(held).toBeDisabled();
		await expect.element(page.getByRole('radio', { name: 'Alpha' })).toBeEnabled();
		await expect.element(page.getByRole('radio', { name: 'Beta' })).toBeEnabled();

		await held.click({ force: true });
		expect(onValueChange).not.toHaveBeenCalled();
		await expect.element(page.getByRole('radio', { name: 'Alpha' })).toBeChecked();
	});

	it('can show the disabled option as the value', async () => {
		await render(SegmentedControl, { value: 'c', options: OPTIONS, label: 'Pick' });
		await expect.element(page.getByRole('radio', { name: 'Gamma' })).toBeChecked();
	});

	it('disables every option with the whole control', async () => {
		await render(SegmentedControl, { value: 'a', options: OPTIONS, label: 'Pick', disabled: true });
		await expect.element(page.getByRole('radio', { name: 'Alpha' })).toBeDisabled();
		await expect.element(page.getByRole('radio', { name: 'Beta' })).toBeDisabled();
	});

	it('keeps its value when the checked option is pressed again', async () => {
		const onValueChange = vi.fn();
		await render(SegmentedControl, { value: 'a', options: OPTIONS, label: 'Pick', onValueChange });

		await page.getByRole('radio', { name: 'Alpha' }).click();

		await expect.element(page.getByRole('radio', { name: 'Alpha' })).toBeChecked();
		expect(onValueChange).not.toHaveBeenCalled();
	});
});
