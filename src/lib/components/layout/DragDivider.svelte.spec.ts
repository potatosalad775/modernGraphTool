import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import DragDivider from './DragDivider.svelte';

/**
 * Specs load no Tailwind, so the host lays itself out with inline styles: a 1000px container, a
 * 600px left pane, the divider, and a flexible right pane.
 */
function mountHost(panelOnLeft = false, containerWidth = 1000, leftWidth = 600) {
	const main = document.createElement('main');
	main.style.cssText = `display:flex;width:${containerWidth}px;height:200px;`;
	const left = document.createElement('div');
	left.style.cssText = `width:${leftWidth}px;flex:none;`;
	const slot = document.createElement('div');
	slot.style.cssText = 'width:5px;flex:none;';
	const right = document.createElement('div');
	right.style.cssText = 'flex:1;';
	main.append(left, slot, right);
	document.body.append(main);
	const ondrag = vi.fn<(cols: string) => void>();
	return { main, left, slot, ondrag, props: { mainEl: main, panelOnLeft, ondrag } };
}

const hosts: HTMLElement[] = [];

async function setup(panelOnLeft = false, containerWidth = 1000, leftWidth = 600) {
	const host = mountHost(panelOnLeft, containerWidth, leftWidth);
	hosts.push(host.main);
	// Render the divider into the host's slot, so its left edge sits where the left pane ends.
	await render(DragDivider, { props: host.props, target: host.slot });
	const separator = page.getByRole('separator');
	await expect.element(separator).toBeInTheDocument();
	return { ...host, separator };
}

afterEach(() => {
	for (const h of hosts.splice(0)) h.remove();
});

describe('DragDivider', () => {
	it('is a focusable, named, vertical separator', async () => {
		const { separator } = await setup();
		await expect.element(separator).toHaveAttribute('aria-orientation', 'vertical');
		await expect.element(separator).toHaveAttribute('tabindex', '0');
		await expect.element(separator).toHaveAccessibleName('Resize graph and panel');
	});

	it('reports the left column as a percentage of the container', async () => {
		// Graph on the left: min 400px, far column keeps 340px + the 5px divider.
		const { separator } = await setup(false);
		await expect.element(separator).toHaveAttribute('aria-valuenow', '60');
		await expect.element(separator).toHaveAttribute('aria-valuemin', '40');
		await expect.element(separator).toHaveAttribute('aria-valuemax', '66');
	});

	it('swaps the limits when the panel is on the left', async () => {
		// Panel on the left: min 340px, far (graph) column keeps 400px + the divider.
		const { separator } = await setup(true, 1000, 500);
		await expect.element(separator).toHaveAttribute('aria-valuenow', '50');
		await expect.element(separator).toHaveAttribute('aria-valuemin', '34');
		await expect.element(separator).toHaveAttribute('aria-valuemax', '60');
	});

	it('moves 15px per arrow press and clamps like a drag', async () => {
		const { separator, ondrag } = await setup(false);
		(separator.element() as HTMLElement).focus();

		await userEvent.keyboard('{ArrowRight}');
		expect(ondrag).toHaveBeenLastCalledWith(
			'clamp(400px, 61.5%, calc(100% - 345px)) 5px minmax(340px, 1fr)'
		);

		await userEvent.keyboard('{ArrowLeft}');
		// The host never resizes the pane, so the divider re-reads the same 600px start.
		expect(ondrag).toHaveBeenLastCalledWith(
			'clamp(400px, 58.5%, calc(100% - 345px)) 5px minmax(340px, 1fr)'
		);
	});

	it('jumps to the limits with Home and End', async () => {
		const { separator, ondrag } = await setup(false);
		(separator.element() as HTMLElement).focus();

		await userEvent.keyboard('{Home}');
		expect(ondrag).toHaveBeenLastCalledWith(
			'clamp(400px, 40%, calc(100% - 345px)) 5px minmax(340px, 1fr)'
		);

		await userEvent.keyboard('{End}');
		// 1000 - 5 - 340 = 655px
		expect(ondrag).toHaveBeenLastCalledWith(
			'clamp(400px, 65.5%, calc(100% - 345px)) 5px minmax(340px, 1fr)'
		);
	});

	it('does not move past a limit', async () => {
		const { separator, ondrag } = await setup(false, 1000, 405);
		(separator.element() as HTMLElement).focus();
		await userEvent.keyboard('{ArrowLeft}');
		expect(ondrag).toHaveBeenLastCalledWith(
			'clamp(400px, 40%, calc(100% - 345px)) 5px minmax(340px, 1fr)'
		);
	});

	it('ignores other keys', async () => {
		const { separator, ondrag } = await setup(false);
		(separator.element() as HTMLElement).focus();
		await userEvent.keyboard('a');
		await userEvent.keyboard('{ArrowUp}');
		expect(ondrag).not.toHaveBeenCalled();
	});

	it('follows the left pane when the parent resizes it', async () => {
		const { separator, left } = await setup(false);
		left.style.width = '500px';
		await expect.element(separator).toHaveAttribute('aria-valuenow', '50');
	});
});
