/**
 * `EqAutoEq` is the AutoEQ control surface: four range fieldsets bound to
 * `settingsStore.autoEqOptions`, and a run button that assembles those into a
 * worker request and pushes the result through `eqCommands.replaceFiltersInScope`.
 *
 * The worker is mocked — `autoeq.worker.spec.ts` covers the protocol and
 * `equalizer.spec.ts` the optimization. What matters here is the request this
 * component builds, since a wrong option mapping is silent: AutoEQ still returns
 * filters, just optimized against the wrong constraints.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import EqAutoEq from './EqAutoEq.svelte';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { settingsStore } from '$lib/stores/settings-store.svelte.js';
import {
	eqConstraintsStore,
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID
} from '$lib/stores/eq-constraints-store.svelte.js';
import { eqCommands } from '$lib/services/eq-commands.js';
import { autoEqService } from '$lib/services/autoeq-service.svelte.js';
import { commandHistory } from '$lib/services/command-history.svelte.js';
import { runAutoEQInWorker } from '$lib/workers/autoeq-client.js';
import type { AutoEqOutcome } from '$lib/workers/autoeq-request.js';
import type { FRDataObject } from '$lib/types/data-types.js';
import type { EQFilter } from '$lib/utils/equalizer.js';
import * as m from '$lib/paraglide/messages.js';

vi.mock('$lib/workers/autoeq-client.js', () => ({
	runAutoEQInWorker: vi.fn(async () => ({ filters: [] as EQFilter[], engine: 'turboeq' as const }))
}));

const runInWorker = vi.mocked(runAutoEQInWorker);

const RESULT: EQFilter[] = [{ type: 'PK', freq: 1000, gain: -3, q: 1, enabled: true }];
/** What the worker hands back: the bands, plus which optimizer found them. */
const OUTCOME = { filters: RESULT, engine: 'turboeq' as const, rmse: 0.42, preamp: -3 };

const DEFAULT_OPTS = {
	freqMin: 20,
	freqMax: 15000,
	qMin: 0.5,
	qMax: 2.0,
	gainMin: -12,
	gainMax: 12,
	useShelfFilter: true,
	exactMatch: true
};

function curve(level: number): [number, number][] {
	return [
		[20, level],
		[1000, level],
		[20000, level]
	];
}

function makeItem(
	uuid: string,
	type: FRDataObject['type'],
	data: [number, number][]
): FRDataObject {
	return {
		uuid,
		type,
		identifier: uuid,
		channels: { AVG: { data } }
	} as unknown as FRDataObject;
}

/** Seeds a source phone and an AutoEQ target and points the store at both. */
function seedPair(): void {
	frStore.set('src', makeItem('src', 'phone', curve(6)));
	frStore.set('tgt', makeItem('tgt', 'target', curve(0)));
	eqStore.sourcePhoneUUID = 'src';
	eqStore.autoEqTargetUUID = 'tgt';
}

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
	let alertSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		frStore.entries.clear();
		eqStore.filters = [];
		eqStore.channelScope = 'BOTH';
		eqStore.sourcePhoneUUID = null;
		eqStore.autoEqTargetUUID = null;
		eqStore.isEnabled = false;
		eqStore.momentaryOverride = null;
		eqStore.momentaryRestore = null;
		settingsStore.autoEqOptions = { ...DEFAULT_OPTS };
		autoEqService.reset();
		commandHistory.clear();
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		runInWorker.mockClear();
		runInWorker.mockResolvedValue(OUTCOME);
		replaceFilters = vi
			.spyOn(eqCommands, 'replaceFiltersInScope')
			.mockImplementation(() => undefined as never);
		alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
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

	// ── Guards ───────────────────────────────────────────────────────────────

	describe('guards', () => {
		it('refuses to run with no source selected', async () => {
			frStore.set('tgt', makeItem('tgt', 'target', curve(0)));
			eqStore.autoEqTargetUUID = 'tgt';
			render(EqAutoEq);

			await runButton().click();

			expect(alertSpy).toHaveBeenCalledOnce();
			expect(runInWorker).not.toHaveBeenCalled();
		});

		it('refuses to run with no target selected', async () => {
			frStore.set('src', makeItem('src', 'phone', curve(6)));
			eqStore.sourcePhoneUUID = 'src';
			render(EqAutoEq);

			await runButton().click();

			expect(alertSpy).toHaveBeenCalledOnce();
			expect(runInWorker).not.toHaveBeenCalled();
		});

		it('refuses to run when a selected uuid is no longer in the store', async () => {
			// Removing a curve leaves the id behind on eqStore until something clears
			// it, so the lookup has to fail closed rather than pass undefined along.
			seedPair();
			frStore.delete('tgt');
			render(EqAutoEq);

			await runButton().click();

			expect(alertSpy).toHaveBeenCalledOnce();
			expect(runInWorker).not.toHaveBeenCalled();
		});

		it('refuses to run when the selected curve carries no channel data', async () => {
			seedPair();
			frStore.set('src', makeItem('src', 'phone', []));
			render(EqAutoEq);

			await runButton().click();

			expect(alertSpy).toHaveBeenCalledOnce();
			expect(runInWorker).not.toHaveBeenCalled();
		});

		// Graphic mode used to be refused outright, because a freely fitted filter
		// had to be dragged onto the nearest slider afterwards. The optimizer now
		// takes the grid as pinned fc and Q, so the fit lands on it to begin with.
		it('runs in graphic mode, against the preset own bands', async () => {
			const graphic = BUILTIN_PRESETS.find((p) => p.mode === 'graphic');
			eqConstraintsStore.activeId = graphic!.id;
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			const request = runInWorker.mock.calls[0][2];
			expect(request.kind).toBe('graphic');
			expect(request.kind === 'graphic' && request.bands.map((b) => b.freq)).toEqual(
				graphic!.graphicBands!.map((b) => b.freq)
			);
		});

		it('offers exact match in graphic mode too', async () => {
			// A slider at 16 kHz is only scored on shape when the fit is exact.
			const graphic = BUILTIN_PRESETS.find((p) => p.mode === 'graphic');
			eqConstraintsStore.activeId = graphic!.id;
			settingsStore.autoEqOptions = { ...DEFAULT_OPTS, exactMatch: false };
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ kind: 'graphic', fit: 'autoeq' });
		});

		it('hides the frequency and Q fields in graphic mode', async () => {
			// They would say nothing: the grid is the preset's.
			const graphic = BUILTIN_PRESETS.find((p) => p.mode === 'graphic');
			eqConstraintsStore.activeId = graphic!.id;
			seedPair();
			render(EqAutoEq);

			expect(numberInputs().length).toBe(0);
		});
	});

	// ── Request assembly ─────────────────────────────────────────────────────

	describe('the worker request', () => {
		it('sends the source and target curves as point arrays', async () => {
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			const [source, target] = runInWorker.mock.calls[0];
			expect(source).toEqual(curve(6));
			expect(target).toEqual(curve(0));
		});

		// The ranges are bounds the fit lands inside, not a clamp applied to the
		// answer, so a wrong mapping here is silent: the run still returns bands.
		it('maps the stored options onto per-band bounds', async () => {
			settingsStore.autoEqOptions = {
				freqMin: 30,
				freqMax: 16000,
				qMin: 0.4,
				qMax: 5,
				gainMin: -9,
				gainMax: 9,
				useShelfFilter: false,
				exactMatch: true
			};
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({
				kind: 'parametric',
				shelves: false,
				limits: { minFc: 30, maxFc: 16000, minQ: 0.4, maxQ: 5, minGain: -9, maxGain: 9 },
				fit: 'exact'
			});
		});

		it('asks for AutoEq fitting when exact match is off', async () => {
			settingsStore.autoEqOptions = { ...DEFAULT_OPTS, exactMatch: false };
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ fit: 'autoeq' });
		});

		it('stays quiet when turboEQ answered', async () => {
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(replaceFilters).toHaveBeenCalledOnce());
			expect(page.getByRole('status').element().textContent).toBe('');
		});

		// mGT counts rows; turboEQ counts peaking bands with the shelves outside
		// that number. Ten rows is eight peaking plus two shelves, and getting it
		// wrong produces a plausible EQ with the wrong band count.
		it('splits the row budget into peaking bands and shelves', async () => {
			eqStore.filters = Array.from({ length: 10 }, () => ({ ...RESULT[0] }));
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ peaking: 8, shelves: true });
		});

		it('drops the shelves when the preset forbids them', async () => {
			eqConstraintsStore.presets = [
				...BUILTIN_PRESETS,
				{ ...BUILTIN_PRESETS[0], id: 'pk-only', label: 'PK only', allowLsq: false, allowHsq: false }
			];
			eqConstraintsStore.activeId = 'pk-only';
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ peaking: 8, shelves: false });
		});

		it('narrows the requested window to what the preset allows', async () => {
			eqConstraintsStore.presets = [
				...BUILTIN_PRESETS,
				{ ...BUILTIN_PRESETS[0], id: 'tight', label: 'Tight', gainMin: -6, gainMax: 6, qMax: 3 }
			];
			eqConstraintsStore.activeId = 'tight';
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({
				limits: { minGain: -6, maxGain: 6, maxQ: 2 }
			});
		});

		it('asks for as many filters as the current stack holds', async () => {
			eqStore.filters = Array.from({ length: 5 }, () => ({ ...RESULT[0] }));
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ peaking: 3, shelves: true });
		});

		// This used to resolve to a single band, which made AutoEQ look broken to
		// anyone who pressed Run before adding filters by hand — the common case.
		it('asks for eight filters when the stack is empty and no config is set', async () => {
			expect(window.GRAPHTOOL_CONFIG).toBeUndefined();
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ peaking: 6, shelves: true });
		});

		it('honours EQUALIZER.AUTOEQ_DEFAULT_BAND_COUNT for the empty stack', async () => {
			window.GRAPHTOOL_CONFIG = { EQUALIZER: { AUTOEQ_DEFAULT_BAND_COUNT: 12 } } as never;
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ peaking: 10, shelves: true });
		});

		it('ignores a nonsensical configured band count', async () => {
			window.GRAPHTOOL_CONFIG = { EQUALIZER: { AUTOEQ_DEFAULT_BAND_COUNT: 0 } } as never;
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ peaking: 6, shelves: true });
		});

		// Generating 8 and letting `replaceFilters` trim to 5 fits worse than
		// optimizing for 5 up front, so the cap is applied before the run.
		it('caps the default at the active preset maxBands', async () => {
			eqConstraintsStore.presets = [
				...BUILTIN_PRESETS,
				{ ...BUILTIN_PRESETS[0], id: 'five-band', label: 'Five Band', maxBands: 5 }
			];
			eqConstraintsStore.activeId = 'five-band';
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ peaking: 3, shelves: true });
		});

		// Scoped to one ear, AutoEQ has to optimize against that ear's curve —
		// against AVG it would solve for a response neither channel has, and
		// correcting channel imbalance (the point of per-channel EQ) becomes
		// impossible.
		it('optimizes against the scoped channel of both source and target', async () => {
			frStore.set('src', {
				uuid: 'src',
				type: 'phone',
				identifier: 'src',
				channels: { L: { data: curve(6) }, R: { data: curve(9) }, AVG: { data: curve(7.5) } }
			} as unknown as FRDataObject);
			frStore.set('tgt', {
				uuid: 'tgt',
				type: 'target',
				identifier: 'tgt',
				channels: { L: { data: curve(1) }, R: { data: curve(2) }, AVG: { data: curve(1.5) } }
			} as unknown as FRDataObject);
			eqStore.sourcePhoneUUID = 'src';
			eqStore.autoEqTargetUUID = 'tgt';
			eqStore.channelScope = 'R';
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][0]).toEqual(curve(9));
			expect(runInWorker.mock.calls[0][1]).toEqual(curve(2));
		});

		// A target measured as one curve is the common case, and it still has to
		// be usable for a per-ear run.
		it('falls back to the average when the scoped channel is missing', async () => {
			frStore.set('src', {
				uuid: 'src',
				type: 'phone',
				identifier: 'src',
				channels: { L: { data: curve(6) }, R: { data: curve(9) } }
			} as unknown as FRDataObject);
			frStore.set('tgt', makeItem('tgt', 'target', curve(0)));
			eqStore.sourcePhoneUUID = 'src';
			eqStore.autoEqTargetUUID = 'tgt';
			eqStore.channelScope = 'R';
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][0]).toEqual(curve(9));
			expect(runInWorker.mock.calls[0][1]).toEqual(curve(0));
		});

		it('falls back to the L channel when there is no average', async () => {
			frStore.set('src', {
				uuid: 'src',
				type: 'phone',
				identifier: 'src',
				channels: { L: { data: curve(4) } }
			} as unknown as FRDataObject);
			frStore.set('tgt', makeItem('tgt', 'target', curve(0)));
			eqStore.sourcePhoneUUID = 'src';
			eqStore.autoEqTargetUUID = 'tgt';
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][0]).toEqual(curve(4));
		});
	});

	// ── Result handling ──────────────────────────────────────────────────────

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
			expect(replaceFilters).toHaveBeenCalledWith(RESULT, 'BOTH', null);
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
				eqConstraintsStore.activeId = BUILTIN_PRESETS.find((p) => p.mode === 'graphic')!.id;
			});

			it('leaves the filters alone when nothing could fit it', async () => {
				// The old engine would place bands off the sliders, so there is no
				// answer — and an empty list written as one would wipe the EQ.
				runInWorker.mockResolvedValue(NONE);
				eqStore.filters = [{ type: 'PK', freq: 1000, gain: 2, q: 1.4, enabled: true }];
				seedPair();
				render(EqAutoEq);

				await runButton().click();

				await expect
					.element(page.getByText(m.equalizer_autoeq_graphic_unavailable_notice()))
					.toBeInTheDocument();
				expect(replaceFilters).not.toHaveBeenCalled();
				expect(eqStore.isEnabled).toBe(false);
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

	describe('the result', () => {
		it('replaces the filter stack through the command layer', async () => {
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(replaceFilters).toHaveBeenCalledWith(RESULT, 'BOTH', null));
		});

		// Scoped, so a run on one ear can't delete the shared bands or the other
		// ear's solution — `replaceFilters` would have wiped the whole array.
		it('replaces only the scoped bucket', async () => {
			seedPair();
			eqStore.channelScope = 'L';
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(replaceFilters).toHaveBeenCalledWith(RESULT, 'L', null));
		});

		// Without this the run lands silently: filters appear in the list, the
		// graph does not move, and the toggle that would show it is off-screen
		// unless the user is looking at the panel header.
		it('switches the master EQ toggle on', async () => {
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(eqStore.isEnabled).toBe(true));
		});

		it('leaves the stack alone when the worker rejects', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			runInWorker.mockRejectedValue(new Error('worker died'));
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(replaceFilters).not.toHaveBeenCalled();
			expect(eqStore.isEnabled).toBe(false);
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

		/** Waits out the debounce, then asserts nothing else was queued. */
		const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

		beforeEach(() => {
			// These need the real command layer: the guard compares the array a run
			// wrote against the live one, and undo has to see the entries.
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

		it('runs as soon as it is switched on', async () => {
			seedPair();
			render(EqAutoEq);

			await enable();

			expect(runInWorker).toHaveBeenCalledOnce();
			expect(eqStore.isEnabled).toBe(true);
		});

		it('re-runs when the target curve changes, as one undo entry', async () => {
			seedPair();
			render(EqAutoEq);
			await enable();

			// A tilt rewrites the target's channels under the same uuid.
			frStore.set('tgt', makeItem('tgt', 'target', curve(3)));

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledTimes(2));
			expect(runInWorker.mock.calls[1][1]).toEqual(curve(3));
			await vi.waitFor(() => expect(replaceFilters).toHaveBeenCalledTimes(2));

			commandHistory.undo(frStore);
			expect(eqStore.filters).toEqual([]);
			expect(commandHistory.canUndo).toBe(false);
		});

		it('coalesces a burst of option edits into one run', async () => {
			seedPair();
			render(EqAutoEq);
			await enable();

			settingsStore.autoEqOptions.freqMin = 30;
			await new Promise((resolve) => setTimeout(resolve, 50));
			settingsStore.autoEqOptions.freqMin = 40;

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledTimes(2));
			await settle();
			expect(runInWorker).toHaveBeenCalledTimes(2);
			expect(runInWorker.mock.calls[1][2]).toMatchObject({ limits: { minFc: 40 } });
		});

		it('ignores changes that leave the curves and options as they were', async () => {
			seedPair();
			render(EqAutoEq);
			await enable();

			// Same channel arrays under a new item, the way a recolor lands.
			const item = frStore.get('src')!;
			frStore.set('src', { ...item, colors: {} } as unknown as FRDataObject);
			await settle();

			expect(runInWorker).toHaveBeenCalledOnce();
		});

		// Opening the Graph panel re-applies the stored tilt, which hands the
		// target fresh arrays holding the same numbers.
		it('ignores a target rebuilt with the same numbers', async () => {
			seedPair();
			render(EqAutoEq);
			await enable();

			frStore.set('tgt', makeItem('tgt', 'target', curve(0)));
			await settle();

			expect(runInWorker).toHaveBeenCalledOnce();
		});

		// Pinned when it was switched on: the list being scoped to L is a view, and
		// the band count is the one the user ran with.
		it('keeps the scope and band count it started with', async () => {
			seedPair();
			render(EqAutoEq);
			await enable();

			eqStore.channelScope = 'L';
			frStore.set('tgt', makeItem('tgt', 'target', curve(3)));

			await vi.waitFor(() => expect(replaceFilters).toHaveBeenCalledTimes(2));
			expect(replaceFilters.mock.calls[1][1]).toBe('BOTH');
			expect(runInWorker.mock.calls[1][2]).toMatchObject({ peaking: 6, shelves: true });
		});

		it('keeps running with the panel closed', async () => {
			seedPair();
			const view = await render(EqAutoEq);
			await enable();
			view.unmount();

			frStore.set('tgt', makeItem('tgt', 'target', curve(3)));

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledTimes(2));
		});

		// Switching EQ off to compare is a real workflow; an answer nobody asked
		// for must not undo it.
		it('leaves the EQ toggle alone on an auto-applied run', async () => {
			seedPair();
			render(EqAutoEq);
			await enable();
			eqStore.isEnabled = false;

			frStore.set('tgt', makeItem('tgt', 'target', curve(3)));

			await vi.waitFor(() => expect(replaceFilters).toHaveBeenCalledTimes(2));
			expect(eqStore.isEnabled).toBe(false);
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
				expect(autoEqService.autoApply).toBe(false);

				frStore.set('tgt', makeItem('tgt', 'target', curve(3)));
				await settle();
				expect(runInWorker).toHaveBeenCalledOnce();
				expect(eqStore.filters).toHaveLength(2);
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

			it('when the target is removed', async () => {
				seedPair();
				render(EqAutoEq);
				await enable();

				frStore.delete('tgt');

				await vi.waitFor(() => expect(autoEqService.stopReason).toBe('input'));
				expect(autoEqService.autoApply).toBe(false);
			});

			it('when the source device changes', async () => {
				seedPair();
				frStore.set('src2', makeItem('src2', 'phone', curve(4)));
				render(EqAutoEq);
				await enable();

				eqStore.sourcePhoneUUID = 'src2';

				await vi.waitFor(() => expect(autoEqService.stopReason).toBe('input'));
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
				expect(autoEqService.autoApply).toBe(false);
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
