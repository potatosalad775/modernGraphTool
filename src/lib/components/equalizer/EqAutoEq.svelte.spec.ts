/**
 * `EqAutoEq` is the AutoEQ control surface: four range fieldsets bound to
 * `settingsStore.autoEqOptions`, a Run button and an auto-apply switch over
 * `autoEqService`, and the notices that explain what the service did.
 *
 * What the service does — the request it builds, what lands in the EQ, auto-apply and the
 * guard that switches it off — is covered in `autoeq-service.svelte.spec.ts`. Here the worker
 * is mocked and only the view is under test: the fields, the labels, which controls show and
 * which notice is up.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import EqAutoEq from './EqAutoEq.svelte';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { settingsStore } from '#lib/stores/settings-store.svelte.js';
import {
	eqConstraintsStore,
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID
} from '#lib/stores/eq-constraints-store.svelte.js';
import { eqCommands } from '#lib/services/eq-commands.js';
import { autoEqService } from '#lib/services/autoeq-service.svelte.js';
import {
	DEFAULT_OPTS,
	OUTCOME,
	RESULT,
	curve,
	makeItem,
	resetAutoEqStores,
	seedPair
} from '#lib/services/autoeq-service.fixtures.js';
import { runAutoEQInWorker } from '#lib/workers/autoeq-client.js';
import type { AutoEqOutcome } from '#lib/workers/autoeq-request.js';
import type { EQFilter } from '#lib/utils/equalizer.js';
import * as m from '#lib/paraglide/messages.js';

vi.mock('#lib/workers/autoeq-client.js', () => ({
	runAutoEQInWorker: vi.fn(async () => ({ filters: [] as EQFilter[], engine: 'turboeq' as const }))
}));

const runInWorker = vi.mocked(runAutoEQInWorker);

function runButton() {
	return page.getByRole('button', { name: m.equalizer_autoeq_run_button() });
}

/** The number inputs are unlabelled, so index them in document order. */
function numberInputs(): HTMLInputElement[] {
	return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="number"]'));
}

const FIELD_ORDER = ['freqMin', 'freqMax', 'gainMin', 'gainMax', 'qMin', 'qMax'] as const;

function field(name: (typeof FIELD_ORDER)[number]) {
	return numberInputs()[FIELD_ORDER.indexOf(name)];
}

describe('EqAutoEq', () => {
	let replaceFilters: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		resetAutoEqStores();
		runInWorker.mockClear();
		runInWorker.mockResolvedValue(OUTCOME);
		replaceFilters = vi
			.spyOn(eqCommands, 'replaceFiltersInScope')
			.mockImplementation(() => undefined as never);
		vi.spyOn(window, 'alert').mockImplementation(() => {});
	});

	afterEach(() => {
		autoEqService.reset();
		vi.restoreAllMocks();
		frStore.entries.clear();
		eqStore.filters = [];
		eqStore.isEnabled = false;
		settingsStore.autoEqOptions = { ...DEFAULT_OPTS };
		delete (window as { GRAPHTOOL_CONFIG?: unknown }).GRAPHTOOL_CONFIG;
	});

	// ── Option fields ────────────────────────────────────────────────────────

	describe('option fields', () => {
		it('shows the stored options as their initial values', async () => {
			settingsStore.autoEqOptions = { ...DEFAULT_OPTS, freqMin: 40, qMax: 4 };
			render(EqAutoEq);

			expect(field('freqMin').value).toBe('40');
			expect(field('qMax').value).toBe('4');
		});

		it('writes an edited frequency bound back to the store', async () => {
			render(EqAutoEq);

			await page.elementLocator(field('freqMax')).fill('12000');

			expect(settingsStore.autoEqOptions.freqMax).toBe(12000);
		});

		it('keeps gain bounds as floats rather than truncating them', async () => {
			// Gain parses with parseFloat while frequency uses parseInt — a copy/paste
			// of the frequency handler here would silently round -7.5 dB to -7.
			render(EqAutoEq);

			await page.elementLocator(field('gainMin')).fill('-7.5');

			expect(settingsStore.autoEqOptions.gainMin).toBe(-7.5);
		});

		it('keeps Q bounds as floats', async () => {
			render(EqAutoEq);

			await page.elementLocator(field('qMin')).fill('0.7');

			expect(settingsStore.autoEqOptions.qMin).toBe(0.7);
		});

		it('leaves the previous value in place when a field is cleared', async () => {
			// An empty box parses to NaN; the `||` fallback keeps the last good value
			// so a mid-edit blank never reaches the optimizer.
			render(EqAutoEq);

			await page.elementLocator(field('freqMin')).fill('');

			expect(settingsStore.autoEqOptions.freqMin).toBe(20);
		});

		it('picks the fit mode through the store', async () => {
			render(EqAutoEq);

			await page.getByRole('radio', { name: m.equalizer_autoeq_treble_safe() }).click();

			expect(settingsStore.autoEqOptions.exactMatch).toBe(false);
			await expect
				.element(page.getByRole('radio', { name: m.equalizer_autoeq_treble_safe() }))
				.toHaveAttribute('aria-checked', 'true');
		});

		// A single toggle group clears its value when the pressed item is pressed
		// again; a fit mode can't be "neither".
		it('keeps the fit mode when the selected one is pressed again', async () => {
			render(EqAutoEq);
			const exact = page.getByRole('radio', { name: m.equalizer_autoeq_exact_match() });

			await exact.click();

			expect(settingsStore.autoEqOptions.exactMatch).toBe(true);
			await expect.element(exact).toHaveAttribute('aria-checked', 'true');
		});

		it('explains both fit modes and links the docs from the help popover', async () => {
			render(EqAutoEq);

			await page.getByRole('button', { name: m.equalizer_autoeq_fit_help() }).click();

			await expect
				.element(page.getByText(m.equalizer_autoeq_exact_match_hint()))
				.toBeInTheDocument();
			await expect
				.element(page.getByText(m.equalizer_autoeq_treble_safe_hint()))
				.toBeInTheDocument();
			await expect
				.element(page.getByRole('link', { name: m.equalizer_autoeq_learn_more() }))
				.toHaveAttribute('href', expect.stringMatching(/\/features\/equalizer\/#fit-mode$/));
		});

		it('toggles the shelf-filter switch through the store', async () => {
			render(EqAutoEq);

			await page.getByRole('switch', { name: m.equalizer_autoeq_use_shelf_filter() }).click();

			expect(settingsStore.autoEqOptions.useShelfFilter).toBe(false);
		});
	});

	// ── Graphic mode ─────────────────────────────────────────────────────────

	describe('graphic mode', () => {
		it('hides the frequency and Q fields in graphic mode', async () => {
			// They would say nothing: the grid is the preset's.
			const graphic = BUILTIN_PRESETS.find((p) => p.id === 'generic-10-band');
			eqConstraintsStore.activeId = graphic!.id;
			seedPair();
			render(EqAutoEq);

			expect(numberInputs().length).toBe(0);
		});
	});

	// ── When turboEQ fails ───────────────────────────────────────────────────

	describe('when turboEQ fails', () => {
		const UNAVAILABLE: AutoEqOutcome = {
			filters: RESULT,
			engine: 'typescript',
			fallback: 'unavailable'
		};
		const REJECTED: AutoEqOutcome = { filters: RESULT, engine: 'typescript', fallback: 'rejected' };

		function fitModeRadios() {
			return page.getByRole('radio', { name: m.equalizer_autoeq_treble_safe() });
		}

		// A worse fit with no indication would be dishonest; the reply names
		// the engine, so the panel can.
		it('says the fast optimizer could not load', async () => {
			runInWorker.mockResolvedValue(UNAVAILABLE);
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await expect
				.element(page.getByText(m.equalizer_autoeq_fallback_notice()))
				.toBeInTheDocument();
		});

		it('hides the fit mode once the module has failed to load', async () => {
			// The fallback has one mode; a treble-safe switch that changes nothing
			// would be a control that lies.
			runInWorker.mockResolvedValue(UNAVAILABLE);
			seedPair();
			render(EqAutoEq);
			await expect.element(fitModeRadios()).toBeInTheDocument();

			await runButton().click();

			await expect.element(fitModeRadios()).not.toBeInTheDocument();
			// The shelf switch shares the fieldset and has nothing to do with turboEQ.
			await expect
				.element(page.getByRole('switch', { name: m.equalizer_autoeq_use_shelf_filter() }))
				.toBeInTheDocument();
		});

		it('keeps the fit mode when turboEQ only refused the request', async () => {
			// Treble-safe with a window above 10 kHz is refused; switching to exact
			// match is how the user gets turboEQ back, so the switch must stay.
			runInWorker.mockResolvedValue(REJECTED);
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await expect
				.element(page.getByText(m.equalizer_autoeq_fallback_rejected_notice()))
				.toBeInTheDocument();
			await expect.element(fitModeRadios()).toBeInTheDocument();
		});

		it('brings the fit mode back when a later run loads turboEQ', async () => {
			// A failed load is not cached, so a transient fetch error clears.
			runInWorker.mockResolvedValueOnce(UNAVAILABLE);
			seedPair();
			render(EqAutoEq);
			await runButton().click();
			await expect.element(fitModeRadios()).not.toBeInTheDocument();

			await page.getByRole('button', { name: m.equalizer_autoeq_recalc_button() }).click();

			await expect.element(fitModeRadios()).toBeInTheDocument();
			expect(page.getByRole('status').element().textContent).toBe('');
		});

		describe('on a graphic preset', () => {
			const NONE: AutoEqOutcome = { filters: [], engine: 'none', fallback: 'unavailable' };

			beforeEach(() => {
				eqConstraintsStore.activeId = BUILTIN_PRESETS.find((p) => p.id === 'generic-10-band')!.id;
			});

			it('says nothing could fit the graphic preset', async () => {
				// The old engine would place bands off the sliders, so there is no
				// answer — and the panel has to say so rather than show an empty fit.
				runInWorker.mockResolvedValue(NONE);
				seedPair();
				render(EqAutoEq);

				await runButton().click();

				await expect
					.element(page.getByText(m.equalizer_autoeq_graphic_unavailable_notice()))
					.toBeInTheDocument();
			});

			it('says turboEQ refused the bands when it only refused', async () => {
				runInWorker.mockResolvedValue({ ...NONE, fallback: 'rejected' });
				seedPair();
				render(EqAutoEq);

				await runButton().click();

				await expect
					.element(page.getByText(m.equalizer_autoeq_graphic_rejected_notice()))
					.toBeInTheDocument();
				await expect.element(fitModeRadios()).toBeInTheDocument();
			});

			it('hides the whole settings fieldset when the module failed to load', async () => {
				// Graphic mode has no shelf switch, so without the fit mode the
				// fieldset would be an empty box.
				runInWorker.mockResolvedValue(NONE);
				seedPair();
				render(EqAutoEq);

				await runButton().click();

				await expect
					.element(page.getByText(m.equalizer_autoeq_filter_setting()))
					.not.toBeInTheDocument();
			});

			it('drops the graphic notice once the preset is parametric again', async () => {
				runInWorker.mockResolvedValue(NONE);
				seedPair();
				render(EqAutoEq);
				await runButton().click();
				await expect
					.element(page.getByText(m.equalizer_autoeq_graphic_unavailable_notice()))
					.toBeInTheDocument();

				eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;

				await expect
					.element(page.getByText(m.equalizer_autoeq_graphic_unavailable_notice()))
					.not.toBeInTheDocument();
			});
		});
	});

	// ── The run button ───────────────────────────────────────────────────────

	describe('the run button', () => {
		// The view's whole contract with the service: a click is a run.
		it('starts a run through the service when clicked', async () => {
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
		});

		it('stays quiet when turboEQ answered', async () => {
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(replaceFilters).toHaveBeenCalledOnce());
			expect(page.getByRole('status').element().textContent).toBe('');
		});

		it('re-enables the button after a failed run', async () => {
			// `isRunning` is cleared in a finally block; without it one worker error
			// would wedge the button for the rest of the session.
			vi.spyOn(console, 'error').mockImplementation(() => {});
			runInWorker.mockRejectedValue(new Error('worker died'));
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runButton().element()).not.toBeDisabled());
		});

		it('disables the button while a run is in flight', async () => {
			let release: (v: typeof OUTCOME) => void = () => {};
			runInWorker.mockReturnValue(
				new Promise<typeof OUTCOME>((resolve) => {
					release = resolve;
				})
			);
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runButton().element()).toBeDisabled());
			release(OUTCOME);
		});
	});

	// ── Auto-apply ───────────────────────────────────────────────────────────

	describe('auto-apply', () => {
		const autoSwitch = () => page.getByRole('switch', { name: m.equalizer_autoeq_auto_apply() });
		const recalcButton = () =>
			page.getByRole('button', { name: m.equalizer_autoeq_recalc_button() });

		beforeEach(() => {
			// The stop notices follow a real run, which has to land in the real command
			// layer for the guard to see the array it wrote.
			replaceFilters.mockRestore();
			replaceFilters = vi.spyOn(eqCommands, 'replaceFiltersInScope');
		});

		/** Switches auto-apply on and waits for the run that doing so starts. */
		async function enable() {
			await autoSwitch().click();
			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(1));
			expect(autoEqService.autoApply).toBe(true);
		}

		// Same element, relabelled — swapping it out would drop keyboard focus.
		it('relabels Run as Recalculate once a result lands', async () => {
			seedPair();
			render(EqAutoEq);
			const before = runButton().element();

			await runButton().click();

			await expect.element(recalcButton()).toBeInTheDocument();
			expect(recalcButton().element()).toBe(before);
		});

		it('is unavailable until a device and a target are picked', async () => {
			render(EqAutoEq);

			await expect.element(autoSwitch()).toBeDisabled();
		});

		// The service owns the loop, so the panel being closed must not end it. The
		// effects are installed from the service, not from the view the switch lives in.
		it('keeps running with the panel closed', async () => {
			seedPair();
			const view = await render(EqAutoEq);
			await enable();
			view.unmount();

			frStore.set('tgt', makeItem('tgt', 'target', curve(3)));

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledTimes(2));
		});

		describe('switches itself off', () => {
			it('when the filters are edited by hand', async () => {
				seedPair();
				render(EqAutoEq);
				await enable();

				eqCommands.addBand({ type: 'PK', freq: 5000, gain: 2, q: 1, enabled: true });

				await expect
					.element(page.getByText(m.equalizer_autoeq_auto_apply_stopped_edited()))
					.toBeInTheDocument();
			});

			it('when the target is swapped for another', async () => {
				seedPair();
				frStore.set('tgt2', makeItem('tgt2', 'target', curve(1)));
				render(EqAutoEq);
				await enable();

				eqStore.autoEqTargetUUID = 'tgt2';

				await expect
					.element(page.getByText(m.equalizer_autoeq_auto_apply_stopped_input()))
					.toBeInTheDocument();
				// A result for another target is no result for this one.
				await expect.element(runButton()).toBeInTheDocument();
			});

			it('when the EQ preset changes', async () => {
				seedPair();
				render(EqAutoEq);
				await enable();

				eqConstraintsStore.activeId = BUILTIN_PRESETS.find(
					(p) => p.id !== DEFAULT_CONSTRAINT_ID
				)!.id;

				await expect
					.element(page.getByText(m.equalizer_autoeq_auto_apply_stopped_preset()))
					.toBeInTheDocument();
			});

			// Too slow to chase every nudge — and the notice already says why.
			it('and stays unavailable once the fallback optimizer answered', async () => {
				runInWorker.mockResolvedValue({
					...OUTCOME,
					engine: 'typescript',
					fallback: 'unavailable'
				});
				seedPair();
				render(EqAutoEq);

				await autoSwitch().click();

				await expect
					.element(page.getByText(m.equalizer_autoeq_fallback_notice()))
					.toBeInTheDocument();
				await expect.element(autoSwitch()).toBeDisabled();
			});
		});

		it('says nothing when the user switches it off', async () => {
			seedPair();
			render(EqAutoEq);
			await enable();

			await autoSwitch().click();

			expect(autoEqService.autoApply).toBe(false);
			expect(page.getByRole('status').element().textContent).toBe('');
		});
	});
});
