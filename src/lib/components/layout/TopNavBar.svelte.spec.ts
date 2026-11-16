import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import TopNavBar from './TopNavBar.svelte';
import { appStore } from '#lib/stores/app-store.svelte.js';

type ConfigWindow = Window & { GRAPHTOOL_CONFIG?: Record<string, unknown> };

const LINKS = [
	{ TITLE: 'Github', URL: 'https://example.test/github' },
	{ TITLE: 'Docs', URL: 'https://example.test/docs' }
];

function setConfig(title: Record<string, unknown> = { TYPE: 'TEXT', CONTENT: 'Test Graphs' }) {
	(window as ConfigWindow).GRAPHTOOL_CONFIG = { TOPBAR: { TITLE: title, LINK_LIST: LINKS } };
}

afterEach(() => {
	delete (window as ConfigWindow).GRAPHTOOL_CONFIG;
	appStore.isMobile = false;
});

describe('TopNavBar title', () => {
	it('names an image title after the home link instead of hard-coded English', async () => {
		setConfig({ TYPE: 'IMAGE', CONTENT: '/logo.png' });
		await render(TopNavBar);
		await expect.element(page.getByRole('link', { name: 'Home' })).toBeInTheDocument();
		expect(document.querySelector('img[alt="topbar title"]')).toBeNull();
	});

	it('labels the top bar navigation', async () => {
		setConfig();
		await render(TopNavBar);
		await expect.element(page.getByRole('navigation', { name: 'Top bar' })).toBeInTheDocument();
	});
});

describe('TopNavBar mobile link drawer', () => {
	beforeEach(() => {
		appStore.isMobile = true;
		setConfig();
	});

	it('opens as a named modal dialog, with the trigger reflecting its state', async () => {
		await render(TopNavBar);
		const trigger = page.getByRole('button', { name: 'Open menu' });
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
		expect(page.getByRole('dialog').elements()).toHaveLength(0);

		await trigger.click();

		const dialog = page.getByRole('dialog', { name: 'LINKS' });
		await expect.element(dialog).toBeInTheDocument();
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'true');
		await expect.element(page.getByRole('navigation', { name: 'Site links' })).toBeInTheDocument();
	});

	it('moves focus in, closes on Escape and returns focus to the trigger', async () => {
		await render(TopNavBar);
		const trigger = page.getByRole('button', { name: 'Open menu' });
		await trigger.click();
		const dialog = page.getByRole('dialog', { name: 'LINKS' });
		await expect.element(dialog).toBeInTheDocument();
		await expect.poll(() => dialog.element().contains(document.activeElement)).toBe(true);

		await userEvent.keyboard('{Escape}');

		await expect.poll(() => page.getByRole('dialog').elements().length).toBe(0);
		await expect.poll(() => document.activeElement).toBe(trigger.element());
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
	});

	it('closes from the close button and when a link is followed', async () => {
		await render(TopNavBar);
		const trigger = page.getByRole('button', { name: 'Open menu' });

		await trigger.click();
		await page.getByRole('button', { name: 'Close menu' }).click();
		await expect.poll(() => page.getByRole('dialog').elements().length).toBe(0);

		await trigger.click();
		const link = page.getByRole('dialog').getByRole('link', { name: 'Docs' });
		// Stop the new tab the real link would open.
		link.element().addEventListener('click', (e) => e.preventDefault());
		await link.click();
		await expect.poll(() => page.getByRole('dialog').elements().length).toBe(0);
	});
});
