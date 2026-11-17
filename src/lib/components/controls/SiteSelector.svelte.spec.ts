import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import SiteSelector from './SiteSelector.svelte';
import { siteIndexService } from '#lib/services/site-index.svelte.js';
import type { SiteIndex } from '#lib/types/site-index-types.js';

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

// Ten entries in two groups, so the list is long enough to earn the filter field (the
// threshold is more than eight). The small-index half lives in the sibling spec.
const FILLER = ['Delta Labs', 'Echo Ears', 'Foxtrot FR', 'Golf Graphs', 'Hotel Hz', 'Ivory IEMs'];

const INDEX: SiteIndex = {
	v: 1,
	generatedAt: '2026-08-13T08:00:00.000Z',
	sites: [
		{ id: 'alice', name: 'Alice Audio', url: 'https://alice.squig.link' },
		{ id: 'bob', name: 'Bob Audio', url: 'https://bob.squig.link' },
		{ id: 'ecole', name: 'École Sonore', url: 'https://ecole.squig.link' },
		...FILLER.map((name, i) => ({ id: `f${i}`, name, url: `https://f${i}.squig.link` }))
	],
	dbs: [
		{ id: 'alice:iems', siteId: 'alice', type: 'IEMs', url: 'https://alice.squig.link/' },
		{
			id: 'bob:hp',
			siteId: 'bob',
			type: 'Headphones',
			url: 'https://bob.squig.link/headphones/',
			verified: false
		},
		{ id: 'ecole:iems', siteId: 'ecole', type: 'IEMs', url: 'https://ecole.squig.link/' },
		...FILLER.map((_, i) => ({
			id: `f${i}:iems`,
			siteId: `f${i}`,
			type: 'IEMs',
			url: `https://f${i}.squig.link/`
		}))
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

/** The trigger's accessible name starts with the generic label; a current site is appended. */
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

	it('names the opened list, and caps it to the viewport', async () => {
		setConfig({ ENABLED: true });

		await mount();
		await trigger().click();

		const panel = page.getByRole('dialog', { name: 'Select a site' });
		await expect.element(panel).toBeVisible();
		await expect
			.element(panel)
			.toHaveClass('max-h-[min(20rem,var(--bits-popover-content-available-height))]');
		await expect.element(panel).not.toHaveClass('max-h-(--bits-popover-content-available-height)');
	});

	describe('filter and keyboard', () => {
		const filter = () => page.getByRole('searchbox', { name: 'Filter sites' });
		const link = (name: string) => page.getByRole('link', { name });
		const focused = () => document.activeElement;

		async function open() {
			setConfig({ ENABLED: true });
			await mount();
			await trigger().click();
		}

		it('shows a labelled search field, focused, with the mobile-keyboard hints', async () => {
			await open();

			await expect.element(filter()).toBeVisible();
			await expect.element(filter()).toHaveFocus();
			await expect.element(filter()).toHaveAttribute('type', 'search');
			await expect.element(filter()).toHaveAttribute('autocomplete', 'off');
			await expect.element(filter()).toHaveAttribute('autocapitalize', 'none');
			await expect.element(filter()).toHaveAttribute('spellcheck', 'false');
		});

		it('narrows by name, ignoring case and accents, and drops empty groups', async () => {
			await open();
			await expect.element(link('Bob Audio')).toBeVisible();

			await filter().fill('ecole');

			await expect.element(link('École Sonore')).toBeVisible();
			expect(link('Alice Audio').elements()).toHaveLength(0);
			// Bob is the only Headphones entry, so its whole group goes with it.
			expect(page.getByRole('heading', { name: 'Headphones' }).elements()).toHaveLength(0);
			await expect.element(page.getByRole('heading', { name: 'IEMs' })).toBeVisible();

			await filter().fill('BOB');
			await expect.element(link('Bob Audio')).toBeVisible();
			expect(page.getByRole('heading', { name: 'IEMs' }).elements()).toHaveLength(0);
		});

		it('shows an empty state when nothing matches', async () => {
			await open();

			await filter().fill('zzzz');

			await expect.element(page.getByText('No sites match.', { exact: true })).toBeVisible();
			expect(page.getByRole('link').elements()).toHaveLength(0);
		});

		it('announces the result count politely once typing settles', async () => {
			await open();
			const status = page.getByRole('status');
			await expect.element(status).toHaveAttribute('aria-live', 'polite');
			await expect.element(status).toHaveTextContent('');

			await filter().fill('audio');
			await expect.element(status, { timeout: 3000 }).toHaveTextContent('2 sites found');

			await filter().fill('ecole');
			await expect.element(status, { timeout: 3000 }).toHaveTextContent('1 site found');

			await filter().fill('zzzz');
			await expect.element(status, { timeout: 3000 }).toHaveTextContent('No sites match.');
		});

		it('moves between links with the arrow keys, Home and End', async () => {
			await open();
			const all = () => page.getByRole('link').elements();

			// Down from the field lands on the first link; headings are skipped.
			await userEvent.keyboard('{ArrowDown}');
			expect(focused()).toBe(all()[0]);

			await userEvent.keyboard('{ArrowDown}');
			expect(focused()).toBe(all()[1]);
			await userEvent.keyboard('{ArrowUp}');
			expect(focused()).toBe(all()[0]);

			await userEvent.keyboard('{End}');
			expect(focused()).toBe(all()[all().length - 1]);
			// Down on the last link stays put rather than wrapping.
			await userEvent.keyboard('{ArrowDown}');
			expect(focused()).toBe(all()[all().length - 1]);

			await userEvent.keyboard('{Home}');
			expect(focused()).toBe(all()[0]);

			// Up from the first link returns to the field.
			await userEvent.keyboard('{ArrowUp}');
			await expect.element(filter()).toHaveFocus();
		});

		it('hands a typed character from a link back to the field', async () => {
			await open();
			await userEvent.keyboard('{ArrowDown}');

			await userEvent.keyboard('z');

			await expect.element(filter()).toHaveFocus();
			await expect.element(filter()).toHaveValue('z');
		});

		it('leaves Enter and clicks to the browser: only the arrows are intercepted', async () => {
			await open();
			const anchor = link('Alice Audio').element();
			anchor.focus();

			const press = (key: string) => {
				const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
				anchor.dispatchEvent(event);
				return event.defaultPrevented;
			};

			expect(press('Enter')).toBe(false);
			expect(press('Tab')).toBe(false);
			expect(press('ArrowDown')).toBe(true);
			// Still a real link, so open-in-new-tab and middle-click are the browser's.
			await expect
				.element(link('Alice Audio'))
				.toHaveAttribute('href', 'https://alice.squig.link/');
		});
	});

	describe('an unverified database', () => {
		const note =
			'This database was unreachable when the index was last built. The link may not work.';

		async function open() {
			setConfig({ ENABLED: true });
			await mount();
			await trigger().click();
		}

		it('is a full-strength link that says so in its name and in view', async () => {
			await open();

			const bob = page.getByRole('link', { name: 'Bob Audio Unverified' });
			await expect.element(bob).toBeVisible();
			expect(bob.element().className).not.toMatch(/opacity/);
			// Plain text, not a tooltip: the badge and the explanation are both on screen.
			await expect.element(page.getByText('Unverified', { exact: true }).first()).toBeVisible();
			await expect.element(page.getByText(note)).toBeVisible();
		});

		it('is described by the explanation, which a verified link does not carry', async () => {
			await open();

			await expect
				.element(page.getByRole('link', { name: 'Bob Audio Unverified' }))
				.toHaveAccessibleDescription(note);
			const alice = page.getByRole('link', { name: 'Alice Audio', exact: true });
			await expect.element(alice).toBeVisible();
			expect(alice.element().hasAttribute('aria-describedby')).toBe(false);
			expect(alice.element().hasAttribute('title')).toBe(false);
		});

		it('drops the explanation once the filter leaves only verified sites', async () => {
			await open();
			await page.getByRole('searchbox', { name: 'Filter sites' }).fill('alice');

			await expect.element(page.getByRole('link', { name: 'Alice Audio' })).toBeVisible();
			expect(page.getByText(note).elements()).toHaveLength(0);
		});
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
