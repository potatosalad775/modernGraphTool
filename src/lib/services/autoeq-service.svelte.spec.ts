/**
 * `autoEqService` is where AutoEQ is decided: it assembles the worker request from the stored
 * options, the preset and the stack, runs it, and lands the answer through
 * `eqCommands.replaceFiltersInScope`. A wrong option mapping is silent — AutoEQ still returns
 * filters, just optimized against the wrong constraints — so most of what is pinned here is the
 * request. The view over it is covered in `EqAutoEq.svelte.spec.ts`.
 *
 * The worker is mocked — `autoeq.worker.spec.ts` covers the protocol and `equalizer.spec.ts`
 * the optimization. Timers are real: auto-apply's debounce is 250 ms and the specs wait it out.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { settingsStore } from '#lib/stores/settings-store.svelte.js';
import {
	eqConstraintsStore,
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID
} from '#lib/stores/eq-constraints-store.svelte.js';
import { eqCommands } from '#lib/services/eq-commands.js';
import { autoEqService, activeGraphicBands } from '#lib/services/autoeq-service.svelte.js';
import { commandHistory } from '#lib/services/command-history.svelte.js';
import { runAutoEQInWorker } from '#lib/workers/autoeq-client.js';
import type { AutoEqOutcome } from '#lib/workers/autoeq-request.js';
import type { FRDataObject } from '#lib/types/data-types.js';
import type { EQFilter } from '#lib/utils/equalizer.js';
import { parametricPreset } from '#lib/utils/__fixtures__/eq-profiles.js';
import {
	DEFAULT_OPTS,
	OUTCOME,
	RESULT,
	curve,
	makeItem,
	resetAutoEqStores,
	seedPair
} from './autoeq-service.fixtures.js';

vi.mock('#lib/workers/autoeq-client.js', () => ({
	runAutoEQInWorker: vi.fn(async () => ({ filters: [] as EQFilter[], engine: 'turboeq' as const }))
}));

const runInWorker = vi.mocked(runAutoEQInWorker);

describe('autoEqService', () => {
	let replaceFilters: ReturnType<typeof vi.spyOn>;
	let alertSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		resetAutoEqStores();
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

	// ── Guards ───────────────────────────────────────────────────────────────

	describe('guards', () => {
		it('refuses to run with no source selected', async () => {
			frStore.set('tgt', makeItem('tgt', 'target', curve(0)));
			eqStore.autoEqTargetUUID = 'tgt';

			autoEqService.run();

			expect(alertSpy).toHaveBeenCalledOnce();
			expect(runInWorker).not.toHaveBeenCalled();
		});

		it('refuses to run with no target selected', async () => {
			frStore.set('src', makeItem('src', 'phone', curve(6)));
			eqStore.sourcePhoneUUID = 'src';

			autoEqService.run();

			expect(alertSpy).toHaveBeenCalledOnce();
			expect(runInWorker).not.toHaveBeenCalled();
		});

		it('refuses to run when a selected uuid is no longer in the store', async () => {
			// Removing a curve leaves the id behind on eqStore until something clears
			// it, so the lookup has to fail closed rather than pass undefined along.
			seedPair();
			frStore.delete('tgt');

			autoEqService.run();

			expect(alertSpy).toHaveBeenCalledOnce();
			expect(runInWorker).not.toHaveBeenCalled();
		});

		it('refuses to run when the selected curve carries no channel data', async () => {
			seedPair();
			frStore.set('src', makeItem('src', 'phone', []));

			autoEqService.run();

			expect(alertSpy).toHaveBeenCalledOnce();
			expect(runInWorker).not.toHaveBeenCalled();
		});

		// Graphic mode used to be refused outright, because a freely fitted filter
		// had to be dragged onto the nearest slider afterwards. The optimizer now
		// takes the grid as pinned fc and Q, so the fit lands on it to begin with.
		it('runs in graphic mode, against the preset own bands', async () => {
			const graphic = BUILTIN_PRESETS.find((p) => p.id === 'generic-10-band');
			eqConstraintsStore.activeId = graphic!.id;
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			const request = runInWorker.mock.calls[0][2];
			expect(request.kind).toBe('graphic');
			expect(request.kind === 'graphic' && request.bands.map((b) => b.freq)).toEqual([
				31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000
			]);
		});

		it('offers exact match in graphic mode too', async () => {
			// A slider at 16 kHz is only scored on shape when the fit is exact.
			const graphic = BUILTIN_PRESETS.find((p) => p.id === 'generic-10-band');
			eqConstraintsStore.activeId = graphic!.id;
			settingsStore.autoEqOptions = { ...DEFAULT_OPTS, exactMatch: false };
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ kind: 'graphic', fit: 'autoeq' });
		});
	});

	describe('activeGraphicBands', () => {
		it('is empty on a parametric preset and the preset own grid on a graphic one', () => {
			expect(activeGraphicBands()).toEqual([]);

			eqConstraintsStore.activeId = BUILTIN_PRESETS.find((p) => p.id === 'generic-10-band')!.id;

			expect(activeGraphicBands().map((b) => b.freq)).toEqual([
				31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000
			]);
		});
	});

	// ── Request assembly ─────────────────────────────────────────────────────

	describe('the worker request', () => {
		it('sends the source and target curves as point arrays', async () => {
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			const [source, target] = runInWorker.mock.calls[0];
			expect(source).toEqual(curve(6));
			expect(target).toEqual(curve(0));
		});

		// The average of several insertion depths is a fit nobody wears.
		it('fits the picked run of a sample set, not its average', async () => {
			seedPair();
			const src = frStore.get('src')!;
			frStore.set('src', {
				...src,
				samples: [
					{ label: 'Deep', AVG: { data: curve(9), metadata: { minFreq: 20, maxFreq: 20000 } } }
				]
			});
			eqStore.sourceSample = { index: 0, variant: '' };

			autoEqService.run();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][0]).toEqual(curve(9));
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

			autoEqService.run();

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

			autoEqService.run();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ fit: 'autoeq' });
		});

		// mGT counts rows; turboEQ counts peaking bands with the shelves outside
		// that number. Ten rows is eight peaking plus two shelves, and getting it
		// wrong produces a plausible EQ with the wrong band count.
		it('splits the row budget into peaking bands and shelves', async () => {
			eqStore.filters = Array.from({ length: 10 }, () => ({ ...RESULT[0] }));
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ peaking: 8, shelves: true });
		});

		it('drops the shelves when the preset forbids them', async () => {
			eqConstraintsStore.presets = [
				...BUILTIN_PRESETS,
				parametricPreset('pk-only', { types: ['PK'], gain: { min: -20, max: 20 } })
			];
			eqConstraintsStore.activeId = 'pk-only';
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ peaking: 8, shelves: false });
		});

		it('narrows the requested window to what the preset allows', async () => {
			eqConstraintsStore.presets = [
				...BUILTIN_PRESETS,
				parametricPreset('tight', { gain: { min: -6, max: 6 }, q: { min: 0.1, max: 3 } })
			];
			eqConstraintsStore.activeId = 'tight';
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({
				limits: { minGain: -6, maxGain: 6, maxQ: 2 }
			});
		});

		it('gives the shelves their own gain window where the profile does', async () => {
			eqConstraintsStore.presets = [
				...BUILTIN_PRESETS,
				{
					id: 'split',
					label: 'Split',
					source: 'catalog',
					profile: {
						...parametricPreset('split').profile,
						bandCount: 4,
						band: {
							types: ['PK'],
							freq: { min: 20, max: 20000 },
							q: { min: 0.1, max: 10 },
							gain: { min: -10, max: 10 }
						},
						bands: [
							{ index: 0, types: ['LSC'], gain: { min: -6, max: 6 } },
							{ index: 3, types: ['HSC'], gain: { min: -6, max: 6 } }
						]
					}
				}
			];
			eqConstraintsStore.activeId = 'split';
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({
				shelves: true,
				limits: { minGain: -10, maxGain: 10 },
				shelfLimits: { minGain: -6, maxGain: 6 }
			});
		});

		it('asks for as many filters as the current stack holds', async () => {
			eqStore.filters = Array.from({ length: 5 }, () => ({ ...RESULT[0] }));
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ peaking: 3, shelves: true });
		});

		// This used to resolve to a single band, which made AutoEQ look broken to
		// anyone who pressed Run before adding filters by hand — the common case.
		it('asks for eight filters when the stack is empty and no config is set', async () => {
			expect(window.GRAPHTOOL_CONFIG).toBeUndefined();
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ peaking: 6, shelves: true });
		});

		it('honours EQUALIZER.AUTOEQ_DEFAULT_BAND_COUNT for the empty stack', async () => {
			window.GRAPHTOOL_CONFIG = { EQUALIZER: { AUTOEQ_DEFAULT_BAND_COUNT: 12 } } as never;
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ peaking: 10, shelves: true });
		});

		it('ignores a nonsensical configured band count', async () => {
			window.GRAPHTOOL_CONFIG = { EQUALIZER: { AUTOEQ_DEFAULT_BAND_COUNT: 0 } } as never;
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ peaking: 6, shelves: true });
		});

		// A device's high pass is not something AutoEQ can make: it stays where it
		// was, its slot comes out of the budget, and the fit corrects around it.
		it('keeps the bands it cannot make in place and fits around them', async () => {
			const hp: EQFilter = { enabled: true, type: 'HPQ', freq: 100, q: 0.7071, gain: 0 };
			eqStore.filters = [hp, ...Array.from({ length: 5 }, () => ({ ...RESULT[0] }))];
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(replaceFilters).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][2]).toMatchObject({ peaking: 3, shelves: true });
			// The source the fit sees already carries the high pass.
			const source = runInWorker.mock.calls[0][0];
			expect(source[0][1]).toBeLessThan(6 - 20);
			expect(source[source.length - 1][1]).toBeCloseTo(6, 1);
			expect(replaceFilters.mock.calls[0][0]).toEqual([hp, ...RESULT]);
		});

		// Generating 8 and letting `replaceFilters` trim to 5 fits worse than
		// optimizing for 5 up front, so the cap is applied before the run.
		it('caps the default at the active preset maxBands', async () => {
			eqConstraintsStore.presets = [
				...BUILTIN_PRESETS,
				parametricPreset('five-band', { maxBands: 5, gain: { min: -20, max: 20 } })
			];
			eqConstraintsStore.activeId = 'five-band';
			seedPair();

			autoEqService.run();

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

			autoEqService.run();

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

			autoEqService.run();

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

			autoEqService.run();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(runInWorker.mock.calls[0][0]).toEqual(curve(4));
		});
	});

	// ── When turboEQ fails ───────────────────────────────────────────────────

	describe('when turboEQ fails', () => {
		const UNAVAILABLE: AutoEqOutcome = {
			filters: RESULT,
			engine: 'typescript',
			fallback: 'unavailable'
		};

		// A worse fit with no indication would be dishonest; the reply names
		// the engine, so the panel can.
		it('lands the fallback optimizer bands and records why it was used', async () => {
			runInWorker.mockResolvedValue(UNAVAILABLE);
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(replaceFilters).toHaveBeenCalledWith(RESULT, 'BOTH', null));
			expect(autoEqService.fallback).toBe('unavailable');
			expect(autoEqService.fellBack).toBe(true);
		});

		describe('on a graphic preset', () => {
			const NONE: AutoEqOutcome = { filters: [], engine: 'none', fallback: 'unavailable' };

			beforeEach(() => {
				eqConstraintsStore.activeId = BUILTIN_PRESETS.find((p) => p.id === 'generic-10-band')!.id;
			});

			it('leaves the filters alone when nothing could fit it', async () => {
				// The old engine would place bands off the sliders, so there is no
				// answer — and an empty list written as one would wipe the EQ.
				runInWorker.mockResolvedValue(NONE);
				eqStore.filters = [{ type: 'PK', freq: 1000, gain: 2, q: 1.4, enabled: true }];
				seedPair();

				autoEqService.run();

				await vi.waitFor(() => expect(autoEqService.unfitted).toBe(true));
				expect(replaceFilters).not.toHaveBeenCalled();
				expect(eqStore.isEnabled).toBe(false);
			});
		});
	});

	// ── Result handling ──────────────────────────────────────────────────────

	describe('the result', () => {
		it('replaces the filter stack through the command layer', async () => {
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(replaceFilters).toHaveBeenCalledWith(RESULT, 'BOTH', null));
		});

		// Scoped, so a run on one ear can't delete the shared bands or the other
		// ear's solution — `replaceFilters` would have wiped the whole array.
		it('replaces only the scoped bucket', async () => {
			seedPair();
			eqStore.channelScope = 'L';

			autoEqService.run();

			await vi.waitFor(() => expect(replaceFilters).toHaveBeenCalledWith(RESULT, 'L', null));
		});

		// Without this the run lands silently: filters appear in the list, the
		// graph does not move, and the toggle that would show it is off-screen
		// unless the user is looking at the panel header.
		it('switches the master EQ toggle on', async () => {
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(eqStore.isEnabled).toBe(true));
		});

		it('leaves the stack alone when the worker rejects', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			runInWorker.mockRejectedValue(new Error('worker died'));
			seedPair();

			autoEqService.run();

			await vi.waitFor(() => expect(runInWorker).toHaveBeenCalledOnce());
			expect(replaceFilters).not.toHaveBeenCalled();
			expect(eqStore.isEnabled).toBe(false);
		});

		it('clears isRunning after a failed run', async () => {
			// `isRunning` is cleared in a finally block; without it one worker error
			// would wedge the button for the rest of the session.
			vi.spyOn(console, 'error').mockImplementation(() => {});
			runInWorker.mockRejectedValue(new Error('worker died'));
			seedPair();

			autoEqService.run();
			expect(autoEqService.isRunning).toBe(true);

			await vi.waitFor(() => expect(autoEqService.isRunning).toBe(false));
		});
	});

	// ── Auto-apply ───────────────────────────────────────────────────────────

	describe('auto-apply', () => {
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
			autoEqService.setAutoApply(true);
			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(1));
			expect(autoEqService.autoApply).toBe(true);
		}

		it('runs as soon as it is switched on', async () => {
			seedPair();

			await enable();

			expect(runInWorker).toHaveBeenCalledOnce();
			expect(eqStore.isEnabled).toBe(true);
		});

		it('re-runs when the target curve changes, as one undo entry', async () => {
			seedPair();
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
			await enable();

			frStore.set('tgt', makeItem('tgt', 'target', curve(0)));
			await settle();

			expect(runInWorker).toHaveBeenCalledOnce();
		});

		// Pinned when it was switched on: the list being scoped to L is a view, and
		// the band count is the one the user ran with.
		it('keeps the scope and band count it started with', async () => {
			seedPair();
			await enable();

			eqStore.channelScope = 'L';
			frStore.set('tgt', makeItem('tgt', 'target', curve(3)));

			await vi.waitFor(() => expect(replaceFilters).toHaveBeenCalledTimes(2));
			expect(replaceFilters.mock.calls[1][1]).toBe('BOTH');
			expect(runInWorker.mock.calls[1][2]).toMatchObject({ peaking: 6, shelves: true });
		});

		// Switching EQ off to compare is a real workflow; an answer nobody asked
		// for must not undo it.
		it('leaves the EQ toggle alone on an auto-applied run', async () => {
			seedPair();
			await enable();
			eqStore.isEnabled = false;

			frStore.set('tgt', makeItem('tgt', 'target', curve(3)));

			await vi.waitFor(() => expect(replaceFilters).toHaveBeenCalledTimes(2));
			expect(eqStore.isEnabled).toBe(false);
		});

		describe('switches itself off', () => {
			it('when the filters are edited by hand', async () => {
				seedPair();
				await enable();

				eqCommands.addBand({ type: 'PK', freq: 5000, gain: 2, q: 1, enabled: true });

				await vi.waitFor(() => expect(autoEqService.stopReason).toBe('edited'));
				expect(autoEqService.autoApply).toBe(false);

				frStore.set('tgt', makeItem('tgt', 'target', curve(3)));
				await settle();
				expect(runInWorker).toHaveBeenCalledOnce();
				expect(eqStore.filters).toHaveLength(2);
			});

			it('when the target is swapped for another', async () => {
				seedPair();
				frStore.set('tgt2', makeItem('tgt2', 'target', curve(1)));
				await enable();

				eqStore.autoEqTargetUUID = 'tgt2';

				await vi.waitFor(() => expect(autoEqService.stopReason).toBe('input'));
				expect(autoEqService.autoApply).toBe(false);
				// A result for another target is no result for this one.
				expect(autoEqService.hasResult).toBe(false);
			});

			it('when the target is removed', async () => {
				seedPair();
				await enable();

				frStore.delete('tgt');

				await vi.waitFor(() => expect(autoEqService.stopReason).toBe('input'));
				expect(autoEqService.autoApply).toBe(false);
			});

			it('when the source device changes', async () => {
				seedPair();
				frStore.set('src2', makeItem('src2', 'phone', curve(4)));
				await enable();

				eqStore.sourcePhoneUUID = 'src2';

				await vi.waitFor(() => expect(autoEqService.stopReason).toBe('input'));
			});

			it('when the EQ preset changes', async () => {
				seedPair();
				await enable();

				eqConstraintsStore.activeId = BUILTIN_PRESETS.find(
					(p) => p.id !== DEFAULT_CONSTRAINT_ID
				)!.id;

				await vi.waitFor(() => expect(autoEqService.stopReason).toBe('preset'));
				expect(autoEqService.autoApply).toBe(false);
			});

			// Too slow to chase every nudge — and the notice already says why.
			it('and stays unavailable once the fallback optimizer answered', async () => {
				runInWorker.mockResolvedValue({
					...OUTCOME,
					engine: 'typescript',
					fallback: 'unavailable'
				});
				seedPair();

				autoEqService.setAutoApply(true);

				await vi.waitFor(() => expect(autoEqService.fallback).toBe('unavailable'));
				expect(autoEqService.autoApply).toBe(false);

				autoEqService.setAutoApply(true);
				expect(autoEqService.autoApply).toBe(false);
				expect(runInWorker).toHaveBeenCalledOnce();
			});
		});
	});
});
