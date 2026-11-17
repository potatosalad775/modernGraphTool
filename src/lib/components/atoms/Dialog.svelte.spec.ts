import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { createRawSnippet } from 'svelte';
import Dialog from './Dialog.svelte';

const actions = createRawSnippet(() => ({
	render: () => '<button type="button">Confirm</button>'
}));
const body = createRawSnippet(() => ({ render: () => '<p>Body text</p>' }));

describe('Dialog', () => {
	it('renders a dialog named by its title, with the description, body and actions', async () => {
		render(Dialog, {
			open: true,
			title: 'Remove bands?',
			description: 'This cannot be undone.',
			children: body,
			actions
		});

		const dialog = page.getByRole('dialog', { name: 'Remove bands?' });
		await expect.element(dialog).toBeVisible();
		await expect.element(dialog).toHaveAccessibleDescription('This cannot be undone.');
		expect(document.querySelector('[data-dialog-description]')).not.toBeNull();
		await expect.element(page.getByText('Body text')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Confirm' })).toBeVisible();
	});

	it('renders nothing while closed', async () => {
		render(Dialog, { open: false, title: 'Remove bands?', actions });

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('closes on Escape and reports it', async () => {
		const onOpenChange = vi.fn();
		render(Dialog, { open: true, title: 'Remove bands?', onOpenChange, actions });

		await expect.element(page.getByRole('dialog')).toBeVisible();
		await userEvent.keyboard('{Escape}');

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(onOpenChange).toHaveBeenCalledTimes(1);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it('stays open on Escape when it is not dismissible', async () => {
		const onOpenChange = vi.fn();
		render(Dialog, {
			open: true,
			dismissible: false,
			title: 'Which EQ?',
			onOpenChange,
			actions
		});

		await expect.element(page.getByRole('dialog')).toBeVisible();
		await userEvent.keyboard('{Escape}');

		await expect.element(page.getByRole('dialog')).toBeVisible();
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it('caps its height to the viewport by default, and a caller can override the cap', async () => {
		render(Dialog, { open: true, title: 'Tall', actions });
		const dialog = page.getByRole('dialog', { name: 'Tall' });
		await expect.element(dialog).toHaveClass('max-h-[calc(100dvh-2rem)]');
		await expect.element(dialog).toHaveClass('overflow-y-auto');
		await expect.element(dialog).toHaveClass('overscroll-contain');
	});

	it('lets the class prop replace the default height cap', async () => {
		render(Dialog, { open: true, title: 'Short', class: 'max-h-[85vh]', actions });
		const dialog = page.getByRole('dialog', { name: 'Short' });
		await expect.element(dialog).toHaveClass('max-h-[85vh]');
		await expect.element(dialog).not.toHaveClass('max-h-[calc(100dvh-2rem)]');
	});

	it('has no description element when none is given', async () => {
		render(Dialog, { open: true, title: 'Remove bands?', actions });

		const dialog = page.getByRole('dialog', { name: 'Remove bands?' });
		await expect.element(dialog).toBeVisible();
		await expect.element(dialog).not.toHaveAttribute('aria-describedby');
		expect(document.querySelector('[data-dialog-description]')).toBeNull();
	});
});
