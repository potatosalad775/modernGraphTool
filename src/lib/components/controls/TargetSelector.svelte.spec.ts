/**
 * The preference-bound row in `TargetSelector`: single-select, deselectable, and rendered only
 * when bounds are configured. Entries are set on the store directly — `hydrate()` runs once per
 * page, so it cannot be re-driven per test.
 *
 * Also the list's initial collapse (per layout, from config) and the user's toggle outliving a
 * remount, since panels unmount on every switch.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import TargetSelector from './TargetSelector.svelte';
import { preferenceBoundStore } from '#lib/stores/preference-bound-store.svelte.js';
import { appStore } from '#lib/stores/app-store.svelte.js';
import * as m from '#lib/paraglide/messages.js';

const ENTRIES = [
	{ name: 'KEMAR DF', target: 'KEMAR DF Target', upper: 'Bounds U.txt', lower: 'Bounds D.txt' },
	{ name: '5128 DF', target: '5128 DF Target', upper: 'Bounds U.txt', lower: 'Bounds D.txt' }
];

describe('TargetSelector preference-bound row', () => {
	beforeEach(() => {
		window.GRAPHTOOL_CONFIG = {
			TARGET_MANIFEST: [{ type: 'Harman', files: ['Harman IE 2019v2'] }]
		} as never;
		preferenceBoundStore.entries = ENTRIES;
		preferenceBoundStore.selectedName = null;
	});

	it('is absent when no bounds are configured', async () => {
		preferenceBoundStore.entries = [];
		render(TargetSelector);

		await expect.element(page.getByText('Harman', { exact: true })).toBeInTheDocument();
		expect(page.getByText(m.pref_bound_row_label()).elements()).toHaveLength(0);
	});

	it('selects one bound at a time and deselects on a second click', async () => {
		render(TargetSelector);
		await expect.element(page.getByText(m.pref_bound_row_label())).toBeInTheDocument();

		await page.getByRole('button', { name: 'KEMAR DF' }).click();
		expect(preferenceBoundStore.selectedName).toBe('KEMAR DF');

		await page.getByRole('button', { name: '5128 DF' }).click();
		expect(preferenceBoundStore.selectedName).toBe('5128 DF');
		await expect
			.element(page.getByRole('button', { name: '5128 DF', pressed: true }))
			.toBeInTheDocument();

		await page.getByRole('button', { name: '5128 DF' }).click();
		expect(preferenceBoundStore.selectedName).toBeNull();
	});
});

describe('TargetSelector collapse', () => {
	const toggle = () => page.getByRole('button', { name: m.target_selector_label() });

	function configure(collapse: unknown) {
		window.GRAPHTOOL_CONFIG = {
			TARGET_MANIFEST: [{ type: 'Harman', files: ['Harman IE 2019v2'] }],
			INTERFACE: { TARGET: { COLLAPSE_TARGET_LIST_ON_INITIAL: collapse } }
		} as never;
	}

	const reset = () => {
		appStore.isMobile = false;
		appStore.targetListOpen = null;
	};

	beforeEach(() => {
		preferenceBoundStore.entries = [];
		reset();
	});
	afterEach(reset);

	it('starts expanded when the key is absent', async () => {
		configure(undefined);
		render(TargetSelector);
		await expect.element(toggle()).toHaveAttribute('aria-expanded', 'true');
	});

	it('applies a boolean to every layout', async () => {
		configure(true);
		appStore.isMobile = true;
		render(TargetSelector);
		await expect.element(toggle()).toHaveAttribute('aria-expanded', 'false');
	});

	it('picks the per-layout value', async () => {
		configure({ DESKTOP: false, MOBILE: true });
		const desktop = await render(TargetSelector);
		await expect.element(toggle()).toHaveAttribute('aria-expanded', 'true');
		desktop.unmount();

		appStore.isMobile = true;
		render(TargetSelector);
		await expect.element(toggle()).toHaveAttribute('aria-expanded', 'false');
	});

	it("keeps the user's toggle across a remount", async () => {
		configure({ DESKTOP: false, MOBILE: true });
		appStore.isMobile = true;
		const first = await render(TargetSelector);
		await toggle().click();
		await expect.element(toggle()).toHaveAttribute('aria-expanded', 'true');
		first.unmount();

		render(TargetSelector);
		await expect.element(toggle()).toHaveAttribute('aria-expanded', 'true');
	});
});
