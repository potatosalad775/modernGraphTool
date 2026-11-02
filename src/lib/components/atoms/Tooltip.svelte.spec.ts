/**
 * Tooltips run through one root (`TooltipHost`) tethered to every `Button`, so each case
 * mounts the host beside the buttons it hovers, the way `AppShell` does.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { createRawSnippet } from 'svelte';
import Button from './Button.svelte';
import InfoPopover from './InfoPopover.svelte';
import Switch from './Switch.svelte';
import TooltipHost from './TooltipHost.svelte';

const tooltip = () => page.getByRole('tooltip');
const text = (label: string) => createRawSnippet(() => ({ render: () => `<span>${label}</span>` }));

describe('Tooltip', () => {
	it('shows the title on hover in place of the native one', async () => {
		render(TooltipHost);
		render(Button, { title: 'Remove' });

		const button = page.getByRole('button', { name: 'Remove' });
		await expect.element(button).not.toHaveAttribute('title');
		await button.hover();

		await expect.element(tooltip()).toHaveTextContent('Remove');
	});

	it('shows the hint as a second line and as the accessible description', async () => {
		render(TooltipHost);
		render(Button, { title: 'Read', hint: 'Switch the device to this preset first.' });

		const button = page.getByRole('button', { name: 'Read' });
		await expect
			.element(button)
			.toHaveAccessibleDescription('Switch the device to this preset first.');
		await button.hover();

		await expect.element(tooltip().getByText('Read', { exact: true })).toBeVisible();
		await expect
			.element(tooltip().getByText('Switch the device to this preset first.'))
			.toBeVisible();
	});

	// Most long titles explain why a button is disabled, so a disabled button must still
	// open one. bits-ui would refuse if the trigger itself were disabled.
	it('opens on a disabled button', async () => {
		render(TooltipHost);
		render(Button, {
			title: 'Add band',
			hint: 'The graphic preset fixes the bands.',
			disabled: true
		});

		await page.getByRole('button', { name: 'Add band' }).hover();

		await expect.element(tooltip().getByText('The graphic preset fixes the bands.')).toBeVisible();
	});

	it('opens on keyboard focus and closes on Escape', async () => {
		render(TooltipHost);
		render(Button, { title: 'Share' });

		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByRole('button', { name: 'Share' })).toHaveFocus();
		await expect.element(tooltip()).toHaveTextContent('Share');

		await userEvent.keyboard('{Escape}');
		await expect.element(tooltip()).not.toBeInTheDocument();
	});

	it('shows nothing for an empty title', async () => {
		render(TooltipHost);
		render(Button, { title: '', 'aria-label': 'More' });

		await page.getByRole('button', { name: 'More' }).hover();
		// Give the open delay time to pass before asserting absence.
		await new Promise((r) => setTimeout(r, 500));

		expect(tooltip().elements()).toHaveLength(0);
	});

	it('stays quiet when the visible label already says the title', async () => {
		render(TooltipHost);
		render(Button, { title: 'Share', children: text('Share') });

		await page.getByRole('button', { name: 'Share' }).hover();
		await new Promise((r) => setTimeout(r, 500));

		expect(tooltip().elements()).toHaveLength(0);
	});

	it('still shows when the label differs from the title', async () => {
		render(TooltipHost);
		render(Button, { title: 'Average all visible curves', children: text('Average') });

		await page.getByRole('button', { name: 'Average all visible curves' }).hover();

		await expect.element(tooltip()).toHaveTextContent('Average all visible curves');
	});

	it('gives a switch named by aria-label its title as tooltip and description', async () => {
		render(TooltipHost);
		render(Switch, { 'aria-label': 'EQUALIZER', title: 'Turn the equalizer on or off' });

		const toggle = page.getByRole('switch', { name: 'EQUALIZER' });
		await expect.element(toggle).toHaveAccessibleDescription('Turn the equalizer on or off');
		await toggle.hover();

		await expect.element(tooltip()).toHaveTextContent('Turn the equalizer on or off');
	});

	// A popover trigger hands `Button` its own `data-state` and handlers; the tooltip's
	// must not displace them.
	it('leaves a popover trigger working', async () => {
		render(TooltipHost);
		const body = createRawSnippet(() => ({ render: () => '<p>What this option does</p>' }));
		render(InfoPopover, { label: 'About Thing', children: body });

		const trigger = page.getByRole('button', { name: 'About Thing' });
		await trigger.hover();
		await expect.element(tooltip()).toHaveTextContent('About Thing');

		await trigger.click();
		await expect.element(page.getByText('What this option does')).toBeVisible();
		await expect.element(trigger).toHaveAttribute('data-state', 'open');
		await expect.element(tooltip()).not.toBeInTheDocument();
	});
});
