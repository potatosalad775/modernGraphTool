import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import * as m from '#lib/paraglide/messages.js';
import { menuStore } from '#lib/stores/menu-store.svelte.js';
import MenuCarousel from './MenuCarousel.svelte';

function pointer(type: string, init: PointerEventInit = {}) {
	return new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		pointerId: 7,
		pointerType: 'mouse',
		button: 0,
		...init
	});
}

describe('MenuCarousel', () => {
	beforeEach(() => {
		menuStore.setPanel('graph');
		// A synthetic pointer id is not an active pointer, so the real call would throw.
		vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('is a named navigation landmark of buttons, not a tab list', async () => {
		await render(MenuCarousel);
		await expect
			.element(page.getByRole('navigation', { name: m.menu_carousel_nav_label() }))
			.toBeInTheDocument();
		expect(page.getByRole('tab').elements()).toHaveLength(0);
		expect(page.getByRole('tablist').elements()).toHaveLength(0);
		expect(page.getByRole('button').elements()).toHaveLength(4);
	});

	it('marks only the current panel with aria-current="page"', async () => {
		await render(MenuCarousel);
		const graph = page.getByRole('button', { name: m.menu_item_graph_label() });
		const misc = page.getByRole('button', { name: m.menu_item_misc_label() });
		await expect.element(graph).toHaveAttribute('aria-current', 'page');
		await expect.element(misc).not.toHaveAttribute('aria-current');

		await misc.click();
		expect(menuStore.currentPanel).toBe('misc');
		await expect.element(misc).toHaveAttribute('aria-current', 'page');
		await expect.element(graph).not.toHaveAttribute('aria-current');
	});

	it('switches panels from the keyboard', async () => {
		await render(MenuCarousel);
		const device = page.getByRole('button', { name: m.menu_item_device_label() });
		(device.element() as HTMLElement).focus();
		await userEvent.keyboard('{Enter}');
		expect(menuStore.currentPanel).toBe('device');
		const eq = page.getByRole('button', { name: m.menu_item_equalizer_label() });
		(eq.element() as HTMLElement).focus();
		await userEvent.keyboard(' ');
		expect(menuStore.currentPanel).toBe('equalizer');
	});

	it('draws the selected underline as a border', async () => {
		await render(MenuCarousel);
		const current = page.getByRole('button', { name: m.menu_item_graph_label() }).element();
		const underline = current.querySelector('span.border-b-2');
		expect(underline).toBeInstanceOf(HTMLElement);
		expect(underline?.className).not.toMatch(/\bbg-/);
		const other = page.getByRole('button', { name: m.menu_item_misc_label() }).element();
		expect(other.querySelector('span.border-b-2')).toBeNull();
	});

	describe('dragging the strip', () => {
		it('follows a pointer drag past the threshold and does not fire the click', async () => {
			const { container } = await render(MenuCarousel);
			const nav = container.querySelector('nav') as HTMLElement;
			const graph = page.getByRole('button', { name: m.menu_item_graph_label() }).element();

			graph.dispatchEvent(pointer('pointerdown', { clientX: 400 }));
			// Dragging left pulls the next panel in.
			nav.dispatchEvent(pointer('pointermove', { clientX: 100 }));
			expect(menuStore.currentPanel).not.toBe('graph');
			const dragged = menuStore.currentPanel;
			nav.dispatchEvent(pointer('pointerup', { clientX: 100 }));

			// The click that ends a drag on the button it started on must not switch back.
			(graph as HTMLElement).click();
			expect(menuStore.currentPanel).toBe(dragged);
		});

		it('treats a sub-threshold wobble as a click, not a drag', async () => {
			const { container } = await render(MenuCarousel);
			const nav = container.querySelector('nav') as HTMLElement;
			const misc = page.getByRole('button', { name: m.menu_item_misc_label() }).element();

			misc.dispatchEvent(pointer('pointerdown', { clientX: 400 }));
			nav.dispatchEvent(pointer('pointermove', { clientX: 402 }));
			nav.dispatchEvent(pointer('pointerup', { clientX: 402 }));
			expect(menuStore.currentPanel).toBe('graph');

			(misc as HTMLElement).click();
			expect(menuStore.currentPanel).toBe('misc');
		});

		it('does not swallow a keyboard activation after a drag', async () => {
			const { container } = await render(MenuCarousel);
			const nav = container.querySelector('nav') as HTMLElement;
			const graph = page.getByRole('button', { name: m.menu_item_graph_label() }).element();

			graph.dispatchEvent(pointer('pointerdown', { clientX: 400 }));
			nav.dispatchEvent(pointer('pointermove', { clientX: 100 }));
			nav.dispatchEvent(pointer('pointerup', { clientX: 100 }));
			await new Promise((resolve) => setTimeout(resolve, 10));

			const device = page.getByRole('button', { name: m.menu_item_device_label() });
			(device.element() as HTMLElement).focus();
			await userEvent.keyboard('{Enter}');
			expect(menuStore.currentPanel).toBe('device');
		});

		it('ignores secondary mouse buttons', async () => {
			const { container } = await render(MenuCarousel);
			const nav = container.querySelector('nav') as HTMLElement;
			const graph = page.getByRole('button', { name: m.menu_item_graph_label() }).element();

			graph.dispatchEvent(pointer('pointerdown', { clientX: 400, button: 2 }));
			nav.dispatchEvent(pointer('pointermove', { clientX: 100 }));
			expect(menuStore.currentPanel).toBe('graph');
		});
	});
});
