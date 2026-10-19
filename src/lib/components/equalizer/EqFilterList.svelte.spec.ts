/**
 * `EqFilterList` is the band editor: preamp readout, add/remove/sort controls,
 * the filter cards, and import/export.
 *
 * Covered here is the master-toggle rule the component owns, which the store
 * and command layer cannot express on their own: **the first** band added to an
 * empty stack switches EQ on, later ones do not. Adding a band to a stack the
 * user has deliberately bypassed is an edit, and re-enabling under them would
 * fight the `\` momentary-compare workflow.
 *
 * `eqCommands.ensureEnabled` itself — including its momentary-hold redirect —
 * is unit-tested in `services/eq-commands.spec.ts`.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import EqFilterList from './EqFilterList.svelte';
import { eqStore, type EQFilter } from '#lib/stores/eq-store.svelte.js';
import {
	eqConstraintsStore,
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID
} from '#lib/stores/eq-constraints-store.svelte.js';
import { commandHistory } from '#lib/services/command-history.svelte.js';
import { eqCommands } from '#lib/services/eq-commands.js';
import { eqHistoryStore } from '#lib/stores/eq-history-store.svelte.js';
import { dataProvider } from '#lib/services/data-provider.svelte.js';
import { toast } from 'svelte-sonner';
import { downloadText } from '#lib/utils/download-text.js';

vi.mock('svelte-sonner', async (importOriginal) => ({
	...(await importOriginal<typeof import('svelte-sonner')>()),
	toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}));

vi.mock('#lib/utils/download-text.js', () => ({ downloadText: vi.fn(), downloadBlob: vi.fn() }));

function makeFilter(overrides: Partial<EQFilter> = {}): EQFilter {
	return { enabled: true, type: 'PK', freq: 1000, q: 1.0, gain: 0, ...overrides };
}

const addButton = () => page.getByRole('button', { name: 'Add EQ Band' });
const removeButton = () => page.getByRole('button', { name: 'Remove EQ Band' });

describe('EqFilterList', () => {
	// The preamp is derived by the page-lifetime sync AppShell installs, not by
	// this component; the readout and the toast only follow it.
	beforeAll(() => dataProvider.installEqCurveSync());

	beforeEach(() => {
		eqStore.filters = [];
		eqStore.preamp = 0;
		eqStore.isEnabled = false;
		eqStore.channelScope = 'BOTH';
		eqStore.momentaryOverride = null;
		eqStore.momentaryRestore = null;
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		commandHistory.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		eqStore.filters = [];
		eqStore.isEnabled = false;
		eqStore.channelScope = 'BOTH';
	});

	describe('the preamp', () => {
		it('covers the full peak of a narrow boost that falls between grid points', async () => {
			// 2070 Hz sits halfway between two points of the old 100-point grid,
			// which read this +6 dB, Q 6 peak as about +5.1 dB and let it clip.
			eqStore.filters = [makeFilter({ freq: 2070, q: 6, gain: 6 })];
			render(EqFilterList);

			await vi.waitFor(() => expect(eqStore.preamp).toBe(-6));
		});

		/** Walks one band's gain through `gains` the way a slider drag would. */
		async function drag(gains: number[]) {
			for (const gain of gains) {
				eqStore.filters = [makeFilter({ gain })];
				await new Promise((resolve) => setTimeout(resolve, 30));
			}
		}

		it('announces a reduction once, after the edits stop', async () => {
			// Every step of a drag lowers the preamp; one toast should say where it
			// ended, not one per step.
			vi.mocked(toast.info).mockClear();
			render(EqFilterList);

			await drag([1, 2, 3, 4, 5, 6]);

			expect(eqStore.preamp).toBe(-6);
			expect(toast.info).not.toHaveBeenCalled();
			await vi.waitFor(() => expect(toast.info).toHaveBeenCalledOnce(), { timeout: 2000 });
			expect(vi.mocked(toast.info).mock.calls[0][0]).toContain('-6.0');
		});

		it('stays quiet when a drag dips and comes back', async () => {
			vi.mocked(toast.info).mockClear();
			render(EqFilterList);

			await drag([3, 6, 3, 0]);
			await new Promise((resolve) => setTimeout(resolve, 1200));

			expect(toast.info).not.toHaveBeenCalled();
		});

		it('stays quiet when an A/B switch lowers it', async () => {
			// Switching sides restores a finished EQ; its preamp is part of it.
			const a = [makeFilter({ gain: 1 })];
			const b = [makeFilter({ gain: 6 })];
			eqHistoryStore.snapshots = [
				{ id: 'h-a', timestamp: 1, filters: a, preamp: -1, summary: '' },
				{ id: 'h-b', timestamp: 2, filters: b, preamp: -6, summary: '' }
			];
			eqHistoryStore.setA('h-a');
			eqHistoryStore.setB('h-b');
			eqStore.filters = a;
			vi.mocked(toast.info).mockClear();
			render(EqFilterList);

			eqCommands.applySnapshot(b, -6);
			await vi.waitFor(() => expect(eqStore.preamp).toBe(-6));
			await new Promise((resolve) => setTimeout(resolve, 1200));

			expect(toast.info).not.toHaveBeenCalled();
			eqHistoryStore.snapshots = [];
			eqHistoryStore.setA(null);
			eqHistoryStore.setB(null);
		});
	});

	describe('the master toggle', () => {
		it('switches on when the first band is added to an empty stack', async () => {
			render(EqFilterList);

			await addButton().click();

			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(1));
			expect(eqStore.isEnabled).toBe(true);
		});

		it('stays off when a band joins a stack the user has bypassed', async () => {
			eqStore.filters = [makeFilter()];
			render(EqFilterList);

			await addButton().click();

			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(2));
			expect(eqStore.isEnabled).toBe(false);
		});

		// Emptying the stack and adding again is a fresh start, so the rule is
		// "the stack was empty", not "this is the first add of the session".
		it('switches on again after the stack has been emptied', async () => {
			eqStore.filters = [makeFilter()];
			render(EqFilterList);

			await removeButton().click();
			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(0));
			expect(eqStore.isEnabled).toBe(false);

			await addButton().click();

			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(1));
			expect(eqStore.isEnabled).toBe(true);
		});
	});

	// ── Channel scoping ──────────────────────────────────────────────────────

	describe('the Graphic EQ export', () => {
		const exportButton = () =>
			page.getByRole('button', { name: 'Export filters as Graphic EQ File' });

		/** The `<freq> <gain>` pairs of the one file written. */
		function exportedCurve(): [number, number][] {
			expect(downloadText).toHaveBeenCalledOnce();
			const text = vi.mocked(downloadText).mock.calls[0][0];
			expect(text.startsWith('GraphicEQ: ')).toBe(true);
			return text
				.slice('GraphicEQ: '.length)
				.split('; ')
				.map((pair) => pair.split(' ').map(Number) as [number, number]);
		}

		/** Peak-to-trough of a curve, dB. Flat is 0 — the export normalizes its top to 0. */
		const spread = (curve: [number, number][]) =>
			Math.max(...curve.map(([, g]) => g)) - Math.min(...curve.map(([, g]) => g));

		beforeEach(() => {
			vi.mocked(downloadText).mockClear();
			vi.mocked(toast.warning).mockClear();
		});

		// A GraphicEQ line has no per-band ON/OFF, so a disabled band can only be
		// honoured by leaving it out of the summed curve.
		it('leaves disabled bands out of the curve', async () => {
			eqStore.filters = [
				makeFilter({ freq: 1000, gain: 6 }),
				makeFilter({ freq: 100, gain: -12, enabled: false })
			];
			render(EqFilterList);
			await exportButton().click();

			const curve = exportedCurve();
			// Only the +6 dB peak remains: well short of the 18 dB a −12 dB
			// band would add, and the bass sits at the flat floor of the curve.
			expect(spread(curve)).toBeCloseTo(6, 0);
			const bass = curve.find(([f]) => f >= 100)!;
			expect(bass[1]).toBeCloseTo(-6, 0);
		});

		it('is unavailable while no shared band is on', async () => {
			eqStore.filters = [makeFilter({ gain: 6, enabled: false })];
			render(EqFilterList);
			await expect.element(exportButton()).toBeDisabled();

			eqStore.filters = [makeFilter({ gain: 6, enabled: false }), makeFilter({ gain: 3 })];
			await expect.element(exportButton()).toBeEnabled();
		});

		// Wavelet applies one curve to both ears, so an L/R-only band has nowhere
		// to go. It is dropped — with a warning — rather than split into files.
		it('writes one file of the shared bands and warns about L/R-only ones', async () => {
			eqStore.filters = [
				makeFilter({ freq: 1000, gain: 6 }),
				makeFilter({ freq: 100, gain: -12, channel: 'L' }),
				makeFilter({ freq: 5000, gain: 4, channel: 'R', enabled: false })
			];
			render(EqFilterList);
			await exportButton().click();

			expect(spread(exportedCurve())).toBeCloseTo(6, 0);
			expect(toast.warning).toHaveBeenCalledOnce();
			// The disabled R band was never going to be written; only the live L one counts.
			expect(vi.mocked(toast.warning).mock.calls[0][0]).toContain('1');
		});

		it('stays unavailable when every live band is per-channel', async () => {
			eqStore.filters = [makeFilter({ gain: 6, channel: 'L' })];
			render(EqFilterList);
			await expect.element(exportButton()).toBeDisabled();
		});

		it('does not warn when there is nothing per-channel to drop', async () => {
			eqStore.filters = [makeFilter({ gain: 6 })];
			render(EqFilterList);
			await exportButton().click();

			expect(downloadText).toHaveBeenCalledOnce();
			expect(toast.warning).not.toHaveBeenCalled();
		});
	});

	describe('importing a filter file', () => {
		/** Hand the hidden file input a file, the way the picker would. */
		function importText(text: string) {
			const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
			const transfer = new DataTransfer();
			transfer.items.add(new File([text], 'filters.txt', { type: 'text/plain' }));
			input.files = transfer.files;
			input.dispatchEvent(new Event('change', { bubbles: true }));
		}

		beforeEach(() => {
			vi.mocked(toast.success).mockClear();
			vi.mocked(toast.warning).mockClear();
		});

		// A band the EQ can't model is left out; without a word, the EQ on
		// screen would quietly differ from the file the user chose.
		it('warns how many filter lines it had to skip', async () => {
			render(EqFilterList);
			importText(
				[
					'Filter: ON PK Fc 100 Hz Gain 3.0 dB Q 1.000',
					// No Q: nothing to build. A notch with one would import.
					'Filter: ON NO Fc 200 Hz',
					'Filter: ON LS 6dB Fc 300 Hz Gain 3.0 dB'
				].join('\n')
			);

			await vi.waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
			expect(eqStore.filters).toHaveLength(1);
			expect(toast.warning).toHaveBeenCalledOnce();
			expect(vi.mocked(toast.warning).mock.calls[0][0]).toContain('2');
		});

		it('does not warn when the whole file imports', async () => {
			render(EqFilterList);
			importText('Filter 1: ON PK Fc 100 Hz Gain 3.0 dB Q 1.000');

			await vi.waitFor(() => expect(toast.success).toHaveBeenCalledOnce());
			expect(toast.warning).not.toHaveBeenCalled();
		});
	});

	describe('channel scope', () => {
		/** Number-input triples, one per rendered band card. */
		const cardCount = () => document.querySelectorAll('input[type="number"]').length / 3;

		/** The scope segments are the only radio items in this component. */
		const scopeButton = (label: string) =>
			[...document.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].find((b) =>
				b.textContent!.trim().startsWith(label)
			)!;

		// The switch lives on the list, not in the panel header: it scopes this
		// list and decides which bucket `+` fills, and in the header it both read
		// as part of "what am I equalizing" and wrapped that row on a phone.
		it('renders the channel switch at the head of the list', async () => {
			render(EqFilterList);

			await vi.waitFor(() => expect(scopeButton('L+R')).toBeTruthy());
			expect(scopeButton('L+R').getAttribute('aria-checked')).toBe('true');
			expect(scopeButton('R').getAttribute('aria-checked')).toBe('false');
		});

		it('switches scope from the list and shows each bucket count', async () => {
			eqStore.filters = [makeFilter({ freq: 100 }), makeFilter({ freq: 200, channel: 'R' })];
			render(EqFilterList);

			await vi.waitFor(() => expect(cardCount()).toBe(1));
			expect(scopeButton('L+R').textContent!.trim()).toBe('L+R (1)');
			expect(scopeButton('R').textContent!.trim()).toBe('R (1)');

			scopeButton('R').click();

			await vi.waitFor(() => expect(eqStore.channelScope).toBe('R'));
			expect(document.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('200');
		});

		it('renders only the active bucket', async () => {
			eqStore.filters = [
				makeFilter({ freq: 100 }),
				makeFilter({ freq: 200, channel: 'L' }),
				makeFilter({ freq: 300, channel: 'R' })
			];
			eqStore.channelScope = 'L';
			render(EqFilterList);

			await vi.waitFor(() => expect(cardCount()).toBe(1));
			expect(document.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('200');
		});

		it('says how many shared bands also reach the scoped ear', async () => {
			eqStore.filters = [
				makeFilter({ freq: 100 }),
				makeFilter({ freq: 150 }),
				makeFilter({ freq: 200, channel: 'L' })
			];
			eqStore.channelScope = 'L';
			render(EqFilterList);

			await expect.element(page.getByText(/2 shared band/)).toBeInTheDocument();
		});

		it('does not show the hint in the shared bucket', async () => {
			eqStore.filters = [makeFilter({ freq: 100 })];
			render(EqFilterList);

			await vi.waitFor(() => expect(cardCount()).toBe(1));
			expect(document.body.textContent).not.toMatch(/shared band/);
		});

		it('stamps the active scope onto a newly added band', async () => {
			eqStore.channelScope = 'R';
			render(EqFilterList);

			await addButton().click();

			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(1));
			expect(eqStore.filters[0].channel).toBe('R');
		});

		// The minus button sits under the scoped list, so it has to remove from
		// that list — popping the flat array's tail would delete another ear's band.
		it('removes the last band of the active bucket, not of the whole array', async () => {
			eqStore.filters = [
				makeFilter({ freq: 100, channel: 'L' }),
				makeFilter({ freq: 200, channel: 'R' })
			];
			eqStore.channelScope = 'L';
			render(EqFilterList);

			await removeButton().click();

			await vi.waitFor(() => expect(eqStore.filters).toHaveLength(1));
			expect(eqStore.filters[0]).toMatchObject({ freq: 200, channel: 'R' });
		});

		// Cards are addressed by their index in the flat array; if narrowing the
		// view renumbered them, an edit in the R bucket would hit an L band.
		it('edits the right band when the view is narrowed', async () => {
			eqStore.filters = [
				makeFilter({ freq: 100, channel: 'L' }),
				makeFilter({ freq: 200, channel: 'R' })
			];
			eqStore.channelScope = 'R';
			render(EqFilterList);

			await vi.waitFor(() => expect(cardCount()).toBe(1));
			const freqBox = document.querySelector<HTMLInputElement>('input[type="number"]')!;
			freqBox.focus();
			await page.getByRole('spinbutton').first().fill('250');
			freqBox.blur();

			await vi.waitFor(() => expect(eqStore.filters[1].freq).toBe(250));
			expect(eqStore.filters[0].freq).toBe(100);
		});
	});
});
