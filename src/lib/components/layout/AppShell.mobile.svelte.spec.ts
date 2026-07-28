import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import AppShell from './AppShell.svelte';
import { appStore } from '$lib/stores/app-store.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
import { menuStore } from '$lib/stores/menu-store.svelte.js';
import { preferenceBoundStore } from '$lib/stores/preference-bound-store.svelte.js';
import { commandHistory } from '$lib/services/command-history.svelte.js';
import { loadDefaultConfig, installWriteBudget } from './app-boot-harness.js';

/**
 * Mobile boot, in its own file so the page-lifetime stores hydrate fresh.
 *
 * `preferenceBoundStore.hydrate()` is guarded to run once per page, so a mobile
 * assertion sharing a file with the desktop tests would read whatever the first
 * boot left behind rather than what a mobile visitor actually gets.
 *
 * What this covers: on mobile the graph toolbar lives inside a collapsed
 * accordion, and bits-ui renders accordion content under `{#if open}` — it
 * genuinely unmounts. Any initial-load default owned by a component in there
 * silently never applies. That is why the preference-bound state lives in a store
 * hydrated from `AppShell.onMount` instead.
 */

const ADJUSTED_LABEL = '(Tilt: -0.8dB/oct, Bass: +6.0dB)';
const WRITE_BUDGET = 80;

let budget: ReturnType<typeof installWriteBudget>;

describe('AppShell boot (mobile)', () => {
	beforeEach(async () => {
		frStore.clear();
		graphStore.targetOriginalData.clear();
		commandHistory.clear();
		menuStore.currentPanel = 'graph';
		budget = installWriteBudget(WRITE_BUDGET);
		await loadDefaultConfig((cfg) => {
			// Off in the shipped defaults; the point of the test is that an operator
			// who turns it on gets it on mobile too.
			(cfg.PREFERENCE_BOUND as Record<string, unknown>).ENABLE_BOUND_ON_INITIAL_LOAD = true;
		});
		await page.viewport(414, 896);
	});

	afterEach(() => {
		budget.restore();
	});

	it('applies the preference-bound initial-load default with the toolbar collapsed', async () => {
		render(AppShell);
		await expect.element(page.getByText(ADJUSTED_LABEL).first()).toBeInTheDocument();

		expect(appStore.isMobile).toBe(true);

		// The toggle button itself is inside the collapsed accordion, so it is not in
		// the document — which is exactly the condition that used to swallow the
		// default. The store must carry it regardless.
		expect(preferenceBoundStore.isEnabled).toBe(true);
		expect(preferenceBoundStore.isVisible).toBe(true);
	}, 30000);

	it('renders the operator defaults on a phone-sized viewport', async () => {
		render(AppShell);
		await expect.element(page.getByText(ADJUSTED_LABEL).first()).toBeInTheDocument();

		expect(frStore.size).toBe(2);
		// Polled for the same reason as the desktop boot test: the D3 curve draw is
		// coalesced into a `requestAnimationFrame`, so it lands a frame after the
		// Svelte-rendered label this test waits on.
		await expect
			.poll(() => document.querySelectorAll('.fr-graph-phone-curve').length)
			.toBeGreaterThan(0);
		expect(budget.count).toBeLessThan(WRITE_BUDGET);
	}, 30000);
});
