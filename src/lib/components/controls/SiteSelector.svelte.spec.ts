import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import SiteSelector from './SiteSelector.svelte';
import { siteIndexService } from '$lib/services/site-index.svelte.js';
import type { SiteIndex } from '$lib/types/site-index-types.js';

/**
 * `siteIndexService` is a page-lifetime singleton, so the index is fetched once
 * for the whole file and every case below reads the same loaded entries. What
 * varies per case is the operator config, which each component instance reads
 * fresh when it mounts.
 *
 * No fixture site claims this spec's host, so `auto` resolves to hidden here.
 * The listed-deployment half lives in `SiteSelector.current.svelte.spec.ts` —
 * it needs a different index, and the singleton only loads once.
 */
type ConfigWindow = Window & { GRAPHTOOL_CONFIG?: Record<string, unknown> };

const INDEX: SiteIndex = {
	v: 1,
	generatedAt: '2026-08-13T08:00:00.000Z',
	sites: [
		{ id: 'alice', name: 'Alice Audio', url: 'https://alice.squig.link' },
		{ id: 'bob', name: 'Bob Audio', url: 'https://bob.squig.link' }
	],
	dbs: [
		{ id: 'alice:iems', siteId: 'alice', type: 'IEMs', url: 'https://alice.squig.link/' },
		{
			id: 'bob:hp',
			siteId: 'bob',
			type: 'Headphones',
			url: 'https://bob.squig.link/headphones/',
			verified: false
		}
	]
};

function setConfig(siteSelector: Record<string, unknown>) {
	(window as ConfigWindow).GRAPHTOOL_CONFIG = {
		SITE_SELECTOR: { INDEX_URLS: ['https://index.test/i.json'], ...siteSelector }
	};
}

vi.stubGlobal(
	'fetch',
	vi.fn(async () => new Response(JSON.stringify(INDEX), { status: 200 }))
);

afterEach(() => {
	delete (window as ConfigWindow).GRAPHTOOL_CONFIG;
});

/** The trigger's accessible name comes from its `aria-label`, which never varies. */
const trigger = () => page.getByRole('button', { name: 'Select a site' });

/** Mounts and waits for the singleton's fetch to settle. */
async function mount() {
	render(SiteSelector);
	await siteIndexService.load();
}

describe('SiteSelector', () => {
	it('renders the switcher when the operator forces it on', async () => {
		setConfig({ ENABLED: true });

		await mount();

		await expect.element(trigger()).toBeInTheDocument();
	});

	it('labels the trigger generically when no entry is current', async () => {
		setConfig({ ENABLED: true });

		await mount();

		await expect.element(trigger()).toHaveTextContent('Select a site');
	});

	it('stays hidden when the operator turns it off', async () => {
		setConfig({ ENABLED: false });

		await mount();

		expect(trigger().elements()).toHaveLength(0);
	});

	it('stays hidden on auto for a deployment the index does not list', async () => {
		// The spec host is localhost, which neither fixture site claims, and it is
		// not a squig.link host either — so an unregistered standalone deployment
		// gets nothing rather than a dropdown of other people's databases.
		setConfig({ ENABLED: 'auto' });

		await mount();

		expect(siteIndexService.currentDbId).toBeNull();
		expect(trigger().elements()).toHaveLength(0);
	});
});
