import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import Skeleton from './Skeleton.svelte';
import * as m from '#lib/paraglide/messages.js';

describe('Skeleton', () => {
	it('is decorative by default: hidden, no status role', async () => {
		const { container } = await render(Skeleton);

		const el = container.firstElementChild!;
		expect(el.getAttribute('aria-hidden')).toBe('true');
		expect(el.hasAttribute('role')).toBe(false);
		expect(el.hasAttribute('aria-label')).toBe(false);
		expect(page.getByRole('status').elements()).toHaveLength(0);
	});

	it('announces once when one skeleton in a group opts in', async () => {
		const { container } = await render(Skeleton, { status: true });

		expect(container.firstElementChild!.hasAttribute('aria-hidden')).toBe(false);
		await expect
			.element(page.getByRole('status', { name: m.skeleton_loading() }))
			.toBeInTheDocument();
	});

	it('applies the requested size', async () => {
		const { container } = await render(Skeleton, { width: '40px', height: '2rem' });

		const el = container.firstElementChild as HTMLElement;
		expect(el.style.width).toBe('40px');
		expect(el.style.height).toBe('2rem');
	});
});
