import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import AppShell from './AppShell.svelte';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
import { menuStore } from '$lib/stores/menu-store.svelte.js';
import { targetAdjustmentStore } from '$lib/stores/target-adjustment-store.svelte.js';
import { commandHistory } from '$lib/services/command-history.svelte.js';
import { loadDefaultConfig, installWriteBudget, findTarget } from './app-boot-harness.js';

/**
 * Whole-app boot tests against the shipped `defaults/config.js`.
 *
 * Every other spec in the suite drives stores and services directly and never
 * mounts a component, so nothing covered the path an ordinary visitor takes:
 * load the page with no `?share=` parameter and let `INITIAL_PHONES` /
 * `INITIAL_TARGETS` populate the graph. Regressions there are invisible to unit
 * tests and total for the user.
 *
 * The viewport is set explicitly here rather than relying on the project default
 * (`browser.viewport` in vite.config.ts), since `appStore.isMobile` keys off
 * `window.innerWidth < 1000` and which layout renders is load-bearing for these
 * assertions.
 */

/** Loaded by `INITIAL_TARGETS`; listed in `TARGET_CUSTOMIZER.CUSTOMIZABLE_TARGETS`. */
const DEMO_TARGET = 'KEMAR DF (KB006x) Target';
/** `INITIAL_TARGET_FILTERS` seeds `{ tilt: -0.8, bass: 6 }` for that target. */
const ADJUSTED_LABEL = '(Tilt: -0.8dB/oct, Bass: +6.0dB)';

/**
 * A healthy desktop boot costs 11 instrumented writes: 5 to `frStore` (insert,
 * normalize, apply the customizer stack), 5 to `graphStore` from the config
 * defaults, 1 caching the pre-adjustment target. The budget only has to sit below
 * "runaway", so there is plenty of headroom for legitimate growth; see
 * `installWriteBudget` for why this is a throwing breaker rather than a timeout.
 */
const WRITE_BUDGET = 80;

let budget: ReturnType<typeof installWriteBudget>;

describe('AppShell boot', () => {
	beforeEach(async () => {
		frStore.clear();
		graphStore.targetOriginalData.clear();
		commandHistory.clear();
		menuStore.currentPanel = 'graph';
		eqStore.filters = [];
		eqStore.preamp = 0;
		eqStore.isEnabled = false;
		eqStore.sourcePhoneUUID = null;
		eqStore.eqCurveUUID = null;
		budget = installWriteBudget(WRITE_BUDGET);
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

		// Boot settles instead of writing reactive state forever.
		expect(budget.count).toBeLessThan(WRITE_BUDGET);
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

	it('syncs the on-graph EQ curve when `\\` is pressed from another panel', async () => {
		render(AppShell);
		await expect.element(page.getByText(ADJUSTED_LABEL).first()).toBeInTheDocument();

		const phoneUUID = [...frStore.entries].find(([, d]) => d.type === 'phone')![0];

		// Build a live EQ curve — a third entry alongside the demo phone and target.
		menuStore.currentPanel = 'equalizer';
		eqStore.sourcePhoneUUID = phoneUUID;
		eqStore.filters = [{ enabled: true, type: 'PK', freq: 1000, q: 1, gain: 6 }];
		eqStore.isEnabled = true;
		await expect.poll(() => frStore.size).toBe(3);
		expect(eqStore.eqCurveUUID).not.toBeNull();

		// Leave the Equalizer tab. The panel unmounts, and with it the only reactive
		// caller of rebuildEqCurve() this app used to have.
		menuStore.currentPanel = 'graph';
		await expect.poll(() => page.getByText(ADJUSTED_LABEL).elements().length).toBe(2);

		// `\` is bound on AppShell's <svelte:window>, so it fires from any panel and
		// flips eqStore.isEnabled. The curve on screen has to follow — it used to
		// keep showing the EQ'd response until the user reopened the Equalizer tab,
		// which made the audio and the graph disagree for the whole hold.
		window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', bubbles: true }));
		await expect.poll(() => frStore.size).toBe(2);
		expect(eqStore.isEnabled).toBe(false);
		expect(eqStore.momentaryOverride).toBe('bypass');
		expect(eqStore.eqCurveUUID).toBeNull();

		// Releasing restores both the EQ state and the curve.
		window.dispatchEvent(new KeyboardEvent('keyup', { key: '\\', bubbles: true }));
		await expect.poll(() => frStore.size).toBe(3);
		expect(eqStore.isEnabled).toBe(true);
		expect(eqStore.eqCurveUUID).not.toBeNull();
	}, 30000);
});
