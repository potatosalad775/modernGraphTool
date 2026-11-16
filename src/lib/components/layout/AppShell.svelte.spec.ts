import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { toast } from 'svelte-sonner';
import AppShell from './AppShell.svelte';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { menuStore } from '#lib/stores/menu-store.svelte.js';
import { tutorialStore, TOUR_STORAGE_KEYS } from '#lib/stores/tutorial-store.svelte.js';
import { targetAdjustmentStore } from '#lib/stores/target-adjustment-store.svelte.js';
import { commandHistory } from '#lib/services/command-history.svelte.js';
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
 * defaults, 1 to `eqBookmarkStore`. The budget only has to sit below
 * "runaway", so there is plenty of headroom for legitimate growth; see
 * `installWriteBudget` for why this is a throwing breaker rather than a timeout.
 */
const WRITE_BUDGET = 80;

let budget: ReturnType<typeof installWriteBudget>;

describe('AppShell boot', () => {
	beforeEach(async () => {
		frStore.clear();
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

		// Polled: INITIAL_PHONES and INITIAL_TARGETS load concurrently, so the label
		// above can render before the phone has landed in the store.
		await expect.poll(() => frStore.size).toBe(2);

		const target = findTarget(DEMO_TARGET);
		expect(target).toBeDefined();
		expect(targetAdjustmentStore.get(target![0]).values).toEqual({ tilt: -0.8, bass: 6 });

		// The curves actually reached the SVG, not just the store.
		//
		// Polled, not asserted synchronously: `GraphEngine.refreshEveryFRCurves()`
		// coalesces the D3 draw into a `requestAnimationFrame`, while the labels above
		// are Svelte-rendered in the effect flush. The label is therefore on screen a
		// frame *before* the paths are, and a bare `expect` here races that frame — it
		// read 0 curves whenever the run happened to land between the flush and the
		// RAF, which is why this failed intermittently on CI and not locally.
		await expect
			.poll(() => document.querySelectorAll('.fr-graph-phone-curve').length)
			.toBeGreaterThan(0);
		await expect
			.poll(() => document.querySelectorAll('.fr-graph-target-curve').length)
			.toBeGreaterThan(0);

		// Boot settles instead of writing reactive state forever.
		expect(budget.count).toBeLessThan(WRITE_BUDGET);
	}, 30000);

	it('has a site <h1>, one <h2> naming the open panel, and skip links to both regions', async () => {
		render(AppShell);
		await expect.element(page.getByText(ADJUSTED_LABEL).first()).toBeInTheDocument();

		// The default title is `<span>modernGraphTool</span>` as HTML: the <h1> carries its text only.
		await expect
			.element(page.getByRole('heading', { level: 1 }))
			.toHaveTextContent('modernGraphTool');
		await expect
			.element(page.getByRole('region', { name: 'Controls' }).getByRole('heading', { level: 2 }))
			.toHaveTextContent('GRAPH');

		// The heading follows the panel; the old one is not left behind.
		menuStore.currentPanel = 'device';
		await expect
			.element(page.getByRole('region', { name: 'Controls' }).getByRole('heading', { level: 2 }))
			.toHaveTextContent('DEVICES');

		// Accordion headers (`AccordionItem`) sit one level under the panel's <h2>. The Graph
		// panel is the one with accordions; switch back to it.
		menuStore.currentPanel = 'graph';
		await expect
			.poll(() =>
				[...document.querySelectorAll('[data-accordion-header]')].map((h) =>
					h.getAttribute('aria-level')
				)
			)
			.toSatisfy((levels: string[]) => levels.length > 0 && levels.every((l) => l === '3'));
		menuStore.currentPanel = 'device';

		// The skip links come first, and move focus onto their region.
		const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href^="#app-"]')];
		expect(links.map((a) => a.textContent?.trim())).toEqual(['Skip to controls', 'Skip to graph']);
		expect(document.body.querySelector('a, button, input')).toBe(links[0]);
		// A first visit opens the welcome tour, whose dialog traps focus; the skip links are for
		// the page behind it.
		tutorialStore.dismiss();
		await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
		links[1].click();
		expect(document.activeElement?.id).toBe('app-graph-region');
		links[0].click();
		expect(document.activeElement?.id).toBe('app-controls-region');
	}, 30000);

	it('keeps error and warning toasts until dismissed, and folds a repeat into one', async () => {
		render(AppShell);
		await expect.element(page.getByText(ADJUSTED_LABEL).first()).toBeInTheDocument();

		toast.error('Something failed');
		toast.error('Something failed');
		toast.warning('Something was left out');
		toast.success('Done');
		const active = () => toast.getActiveToasts();
		await expect.poll(() => active().length).toBe(3);
		const byTitle = (title: string) => active().find((t) => t.title === title)!;
		expect(byTitle('Something failed').duration).toBe(Infinity);
		expect(byTitle('Something was left out').duration).toBe(Infinity);
		expect(byTitle('Done').duration).toBeUndefined();

		// The close button has a name, and it dismisses.
		const close = page.getByRole('button', { name: 'Dismiss notification' });
		await expect.poll(() => close.elements().length).toBeGreaterThan(0);
		await close.first().click();
		await expect.poll(() => active().length).toBe(2);
		toast.dismiss();
	}, 30000);

	it('holds the version toast back until the welcome tour is closed', async () => {
		tutorialStore.dismiss();
		localStorage.removeItem(TOUR_STORAGE_KEYS.welcome);
		localStorage.setItem('gt-settings-app-version', '0.0.1');
		try {
			render(AppShell);
			await expect.poll(() => tutorialStore.isOpen).toBe(true);
			await expect.element(page.getByText(ADJUSTED_LABEL).first()).toBeInTheDocument();
			const updated = () =>
				toast.getActiveToasts().filter((t) => String(t.title).startsWith('Updated'));
			expect(updated()).toHaveLength(0);

			tutorialStore.dismiss();
			await expect.poll(() => updated().length).toBe(1);
		} finally {
			toast.dismiss();
			localStorage.removeItem('gt-settings-app-version');
		}
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
		// The label can render before the phone lands; see the first case.
		await expect.poll(() => frStore.size).toBe(2);

		const phoneUUID = [...frStore.entries].find(([, d]) => d.type === 'phone')![0];

		// Build a live EQ curve — a third entry alongside the demo phone and target.
		menuStore.currentPanel = 'equalizer';
		eqStore.sourcePhoneUUID = phoneUUID;
		eqStore.filters = [{ enabled: true, type: 'PK', freq: 1000, q: 1, gain: 6 }];
		eqStore.isEnabled = true;
		await expect.poll(() => frStore.size).toBe(3);
		expect(eqStore.eqCurveUUID).not.toBeNull();

		// Leave the Equalizer tab. The panel unmounts, and with it the only reactive
		// caller of eqCurve.rebuild() this app used to have.
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
