import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { createRawSnippet } from 'svelte';
import InfoPopover from './InfoPopover.svelte';

const body = createRawSnippet(() => ({ render: () => '<p>What this option does</p>' }));

describe('InfoPopover', () => {
	it('names its trigger with the label', async () => {
		render(InfoPopover, { label: 'About Thing', children: body });

		await expect.element(page.getByRole('button', { name: 'About Thing' })).toBeVisible();
		await expect.element(page.getByText('What this option does')).not.toBeInTheDocument();
	});

	it('shows its content when the trigger is pressed', async () => {
		render(InfoPopover, { label: 'About Thing', children: body });

		const trigger = page.getByRole('button', { name: 'About Thing' });
		await trigger.click();

		await expect.element(page.getByText('What this option does')).toBeVisible();
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'true');
	});
});
