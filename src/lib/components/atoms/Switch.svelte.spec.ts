import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import Switch from './Switch.svelte';

describe('Switch', () => {
	it('flips state on click', async () => {
		await render(Switch, { labelText: 'Enable', checked: false });

		const sw = page.getByRole('switch', { name: 'Enable' });
		await expect.element(sw).toHaveAttribute('aria-checked', 'false');
		await sw.click();
		await expect.element(sw).toHaveAttribute('aria-checked', 'true');
	});

	it.each(['accent', 'muted'] as const)(
		'paints the %s off state from semantic tokens',
		async (v) => {
			await render(Switch, { labelText: 'Enable', variant: v, checked: false });

			const root = page.getByRole('switch', { name: 'Enable' }).element();
			const thumb = root.querySelector('[data-switch-thumb]') as HTMLElement;
			expect(root.className).toContain('data-[state=unchecked]:bg-base-content/60');
			expect(thumb.className).toContain('data-[state=unchecked]:bg-base-100');
			expect(thumb.className).not.toContain('bg-white');
		}
	);

	it('stays focusable while blocked, says it is unavailable, and ignores a press', async () => {
		const onCheckedChange = vi.fn();
		await render(Switch, { labelText: 'Enable', checked: false, blocked: true, onCheckedChange });

		const sw = page.getByRole('switch', { name: 'Enable' });
		await expect.element(sw).not.toHaveAttribute('disabled');
		await expect.element(sw).toHaveAttribute('aria-disabled', 'true');
		await sw.click({ force: true });
		await userEvent.keyboard(' ');
		await userEvent.keyboard('{Enter}');

		expect(document.activeElement).toBe(sw.element());
		await expect.element(sw).toHaveAttribute('aria-checked', 'false');
		expect(onCheckedChange).not.toHaveBeenCalled();
	});
});
