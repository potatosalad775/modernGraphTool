/**
 * `EqAutoEq` is the AutoEQ control surface: four range fieldsets bound to
 * `settingsStore.autoEqOptions`, and a run button that assembles those into a
 * worker request and pushes the result through `eqCommands.replaceFilters`.
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
import { runAutoEQInWorker } from '$lib/workers/autoeq-client.js';
import type { FRDataObject } from '$lib/types/data-types.js';
import type { EQFilter } from '$lib/utils/equalizer.js';
import * as m from '$lib/paraglide/messages.js';

vi.mock('$lib/workers/autoeq-client.js', () => ({
	runAutoEQInWorker: vi.fn(async () => [] as EQFilter[])
}));

const runInWorker = vi.mocked(runAutoEQInWorker);

const RESULT: EQFilter[] = [{ type: 'PK', freq: 1000, gain: -3, q: 1, enabled: true }];

const DEFAULT_OPTS = {
	freqMin: 20,
	freqMax: 15000,
	qMin: 0.5,
	qMax: 2.0,
	gainMin: -12,
	gainMax: 12,
	useShelfFilter: true
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
		eqStore.sourcePhoneUUID = null;
		eqStore.autoEqTargetUUID = null;
		settingsStore.autoEqOptions = { ...DEFAULT_OPTS };
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		runInWorker.mockClear();
		runInWorker.mockResolvedValue(RESULT);
		replaceFilters = vi.spyOn(eqCommands, 'replaceFilters').mockImplementation(() => {});
		alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		frStore.entries.clear();
		eqStore.filters = [];
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

		it('is disabled in graphic mode, and says why', async () => {
			// Graphic EQ locks frequency and Q per band, so an AutoEQ result has
			// nowhere to land. `Button` mirrors `title` into `aria-label`, so the
			// explanation is also the accessible name here — hence the different
			// query from the enabled case.
			const graphic = BUILTIN_PRESETS.find((p) => p.mode === 'graphic');
			eqConstraintsStore.activeId = graphic!.id;
			seedPair();
			render(EqAutoEq);

			await expect
				.element(page.getByRole('button', { name: /unavailable in graphic mode/ }))
				.toBeDisabled();
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

		it('maps the stored options onto the optimizer ranges', async () => {
			settingsStore.autoEqOptions = {
				freqMin: 30,
				freqMax: 16000,
				qMin: 0.4,
				qMax: 5,
				gainMin: -9,
				gainMax: 9,
				useShelfFilter: false
			};
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({
				freqRange: [30, 16000],
				qRange: [0.4, 5],
				gainRange: [-9, 9],
				useShelfFilter: false
			});
		});

		it('asks for as many filters as the current stack holds', async () => {
			eqStore.filters = Array.from({ length: 5 }, () => ({ ...RESULT[0] }));
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2].maxFilters).toBe(5);
		});

		// This used to resolve to a single band, which made AutoEQ look broken to
		// anyone who pressed Run before adding filters by hand — the common case.
		it('asks for eight filters when the stack is empty and no config is set', async () => {
			expect(window.GRAPHTOOL_CONFIG).toBeUndefined();
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2].maxFilters).toBe(8);
		});

		it('honours EQUALIZER.AUTOEQ_DEFAULT_BAND_COUNT for the empty stack', async () => {
			window.GRAPHTOOL_CONFIG = { EQUALIZER: { AUTOEQ_DEFAULT_BAND_COUNT: 12 } } as never;
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2].maxFilters).toBe(12);
		});

		it('ignores a nonsensical configured band count', async () => {
			window.GRAPHTOOL_CONFIG = { EQUALIZER: { AUTOEQ_DEFAULT_BAND_COUNT: 0 } } as never;
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2].maxFilters).toBe(8);
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
			expect(runInWorker.mock.calls[0][2].maxFilters).toBe(5);
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

	describe('the result', () => {
		it('replaces the filter stack through the command layer', async () => {
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(replaceFilters).toHaveBeenCalledWith(RESULT));
		});

		it('leaves the stack alone when the worker rejects', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			runInWorker.mockRejectedValue(new Error('worker died'));
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(replaceFilters).not.toHaveBeenCalled();
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
			let release: (v: EQFilter[]) => void = () => {};
			runInWorker.mockReturnValue(
				new Promise<EQFilter[]>((resolve) => {
					release = resolve;
				})
			);
			seedPair();
			render(EqAutoEq);

			await runButton().click();

			await vi.waitFor(() => expect(page.getByRole('button').element()).toBeDisabled());
			release(RESULT);
		});
	});
});
