import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import SiteSelector from './SiteSelector.svelte';
import { siteIndexService } from '#lib/services/site-index.svelte.js';
import type { SiteIndex } from '#lib/types/site-index-types.js';

/**
 * The listed-deployment half of the site selector: an index that claims this
 * spec's own origin, so `findCurrentDbId` resolves and the default `auto`
 * visibility turns the switcher on.
 *
 * Separate file because `siteIndexService` loads once per page and the sibling
 * spec needs an index that does *not* claim this host.
 */
type ConfigWindow = Window & { GRAPHTOOL_CONFIG?: Record<string, unknown> };

const HERE = window.location.origin + '/';

const INDEX: SiteIndex = {
	v: 1,
	generatedAt: '2026-08-13T08:00:00.000Z',
	sites: [
		{ id: 'home', name: 'This Deployment', url: HERE },
		{ id: 'alice', name: 'Alice Audio', url: 'https://alice.squig.link' }
	],
	dbs: [
		{ id: 'home:iems', siteId: 'home', type: 'IEMs', url: HERE },
		{ id: 'alice:iems', siteId: 'alice', type: 'IEMs', url: 'https://alice.squig.link/' }
	]
};

vi.stubGlobal(
	'fetch',
	vi.fn(async () => new Response(JSON.stringify(INDEX), { status: 200 }))
);

afterEach(() => {
	delete (window as ConfigWindow).GRAPHTOOL_CONFIG;
});

describe('SiteSelector on a listed deployment', () => {
	it('appears on auto and names the current site', async () => {
		(window as ConfigWindow).GRAPHTOOL_CONFIG = {
			SITE_SELECTOR: { ENABLED: 'auto', INDEX_URLS: ['https://index.test/i.json'] }
		};

		render(SiteSelector);
		await siteIndexService.load();

		expect(siteIndexService.currentDbId).toBe('home:iems');

		// `aria-label` stays the generic string, so the site name has to be read off
		// the trigger's text rather than its accessible name.
		const trigger = page.getByRole('button', { name: 'Select a site' });
		await expect.element(trigger).toHaveTextContent('This Deployment');
	});

	it('lists the sites as real links and marks the current one', async () => {
		(window as ConfigWindow).GRAPHTOOL_CONFIG = {
			SITE_SELECTOR: { ENABLED: 'auto', INDEX_URLS: ['https://index.test/i.json'] }
		};

		render(SiteSelector);
		await siteIndexService.load();

		await page.getByRole('button', { name: 'Select a site' }).click();

		// Plain anchors, so Enter follows them and they are announced as links, not options.
		const alice = page.getByRole('link', { name: 'Alice Audio' });
		await expect.element(alice).toHaveAttribute('href', 'https://alice.squig.link/');
		await expect.element(alice).toHaveAttribute('target', '_blank');
		await expect.element(alice).toHaveAttribute('rel', expect.stringContaining('noopener'));
		await expect.element(alice).not.toHaveAttribute('aria-current');

		await expect
			.element(page.getByRole('link', { name: 'This Deployment' }))
			.toHaveAttribute('aria-current', 'page');
	});

	it('skips the filter for a short list, but the arrow keys still rove the links', async () => {
		(window as ConfigWindow).GRAPHTOOL_CONFIG = {
			SITE_SELECTOR: { ENABLED: 'auto', INDEX_URLS: ['https://index.test/i.json'] }
		};

		render(SiteSelector);
		await siteIndexService.load();
		await page.getByRole('button', { name: 'Select a site' }).click();

		// Two entries: a filter field would be clutter.
		await expect.element(page.getByRole('link', { name: 'Alice Audio' })).toBeVisible();
		expect(page.getByRole('searchbox').elements()).toHaveLength(0);

		const [alice, home] = page.getByRole('link').elements();
		alice.focus();

		await userEvent.keyboard('{ArrowDown}');
		expect(document.activeElement).toBe(home);
		await userEvent.keyboard('{ArrowUp}');
		expect(document.activeElement).toBe(alice);
		// No field to return to, so Up on the first link stays put.
		await userEvent.keyboard('{ArrowUp}');
		expect(document.activeElement).toBe(alice);
		await userEvent.keyboard('{End}');
		expect(document.activeElement).toBe(home);
		await userEvent.keyboard('{Home}');
		expect(document.activeElement).toBe(alice);
	});
});
