import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import AppShell from './AppShell.svelte';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
import { menuStore } from '$lib/stores/menu-store.svelte.js';
import { targetAdjustmentStore } from '$lib/stores/target-adjustment-store.svelte.js';
import { commandHistory } from '$lib/services/command-history.svelte.js';
import { loadDefaultConfig, installFrWriteBudget, findTarget } from './app-boot-harness.js';

/**
 * Whole-app boot tests against the shipped `defaults/config.js`.
 *
 * Every other spec in the suite drives stores and services directly and never
 * mounts a component, so nothing covered the path an ordinary visitor takes:
 * load the page with no `?share=` parameter and let `INITIAL_PHONES` /
 * `INITIAL_TARGETS` populate the graph. Regressions there are invisible to unit
 * tests and total for the user.
 *
 * The viewport is set explicitly on every test. `appStore.isMobile` keys off
 * `window.innerWidth < 1000` and the browser-mode iframe defaults to 414×896, so
 * without this the desktop layout is never exercised at all.
 */

/** Loaded by `INITIAL_TARGETS`; listed in `TARGET_CUSTOMIZER.CUSTOMIZABLE_TARGETS`. */
const DEMO_TARGET = 'KEMAR DF (KB006x) Target';
/** `INITIAL_TARGET_FILTERS` seeds `{ tilt: -0.8, bass: 6 }` for that target. */
const ADJUSTED_LABEL = '(Tilt: -0.8dB/oct, Bass: +6.0dB)';

/**
 * A healthy boot writes each curve a handful of times — insert, normalize, apply
 * the customizer stack; 5 in total at the time of writing. The budget only has to
 * sit below "runaway"; see `installFrWriteBudget` for why this is a throwing
 * breaker rather than a timeout.
 */
const FR_WRITE_BUDGET = 80;

let budget: ReturnType<typeof installFrWriteBudget>;

describe('AppShell boot', () => {
	beforeEach(async () => {
		frStore.clear();
		graphStore.targetOriginalData.clear();
		commandHistory.clear();
		menuStore.currentPanel = 'graph';
		budget = installFrWriteBudget(FR_WRITE_BUDGET);
		await loadDefaultConfig();
		await page.viewport(1280, 800);
	});

	afterEach(() => {
		budget.restore();
	});

	it('renders the operator defaults when there is no share parameter', async () => {
		render(AppShell);

		// The single most load-bearing assertion in the suite: reaching this means
		// config.js parsed, the phone book resolved, INITIAL_PHONES/INITIAL_TARGETS
		// loaded, and the target customizer applied INITIAL_TARGET_FILTERS.
		await expect.element(page.getByText(ADJUSTED_LABEL).first()).toBeInTheDocument();

		expect(frStore.size).toBe(2);

		const target = findTarget(DEMO_TARGET);
		expect(target).toBeDefined();
		expect(targetAdjustmentStore.get(target![0]).values).toEqual({ tilt: -0.8, bass: 6 });

		// The curves actually reached the SVG, not just the store.
		expect(document.querySelectorAll('.fr-graph-phone-curve').length).toBeGreaterThan(0);
		expect(document.querySelectorAll('.fr-graph-target-curve').length).toBeGreaterThan(0);

		// Boot settles instead of rewriting curves forever.
		expect(budget.count).toBeLessThan(FR_WRITE_BUDGET);
	}, 30000);

	it('keeps target customizer adjustments across a panel switch', async () => {
		render(AppShell);
		await expect.element(page.getByText(ADJUSTED_LABEL).first()).toBeInTheDocument();

		const uuid = findTarget(DEMO_TARGET)![0];
		const before = targetAdjustmentStore.get(uuid).values;

		// The label renders twice on the Graph tab: once in the panel's selection
		// list, once as the curve label on the SVG. Only the panel copy unmounts on a
		// switch — AppShell tears that subtree down via `{#key menuStore.currentPanel}`,
		// which is what used to discard the sliders. Counting occurrences proves the
		// teardown really happened rather than assuming it.
		menuStore.currentPanel = 'device';
		await expect.poll(() => page.getByText(ADJUSTED_LABEL).elements().length).toBe(1);

		menuStore.currentPanel = 'graph';
		await expect.poll(() => page.getByText(ADJUSTED_LABEL).elements().length).toBe(2);

		expect(targetAdjustmentStore.get(uuid).values).toEqual(before);
		expect(frStore.size).toBe(2);
	}, 30000);
});
