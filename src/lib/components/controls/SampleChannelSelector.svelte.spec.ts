/**
 * `SampleChannelSelector` is the "…" popover on each selection-list row: the
 * L/R/AVG channel radio and the sample-set controls.
 *
 * It is a pure function of its `item` prop and reports every change through
 * `dataProvider`, so the spec renders it for real and asserts the calls it makes.
 * The bits-ui Popover renders into a portal, hence queries go through
 * `page.getBy*` (document-wide) rather than the render result.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import SampleChannelSelector from './SampleChannelSelector.svelte';
import { dataProvider } from '$lib/services/data-provider.svelte.js';
import type { FRDataObject, SampleData } from '$lib/types/data-types.js';

function channel(db = 80) {
	return { data: [[1000, db]] as [number, number][], metadata: { minFreq: 20, maxFreq: 20000 } };
}

function makeItem(overrides: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid: 'p',
		type: 'phone',
		identifier: 'Brand Phone',
		channels: { L: channel(80), R: channel(78), AVG: channel(79) },
		dispChannel: ['AVG'],
		dispSuffix: '',
		colors: { L: '#f00', R: '#00f', AVG: '#0f0' },
		dash: '1 0',
		...overrides
	};
}

/** `count` labelled runs, each carrying L, R and AVG. */
function runs(count: number): SampleData[] {
	return Array.from({ length: count }, (_, i) => ({
		label: `Fit ${String.fromCharCode(65 + i)}`,
		L: channel(80 + i),
		R: channel(78 + i),
		AVG: channel(79 + i)
	}));
}

/** Render, then open the popover so its content is in the document. */
async function open(item: FRDataObject) {
	const result = render(SampleChannelSelector, { uuid: 'p', item });
	await page.getByRole('button').first().click();
	return result;
}

/**
 * Reveal the per-sample curve list, which is collapsed unless the item already
 * displays runs. The run checkboxes and the presets live behind it.
 */
async function openRuns() {
	await page.getByRole('button', { name: /Per-sample curves/ }).click();
}

describe('SampleChannelSelector', () => {
	let updateDisplayChannel: ReturnType<typeof vi.spyOn>;
	let updateSampleDisplay: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		updateDisplayChannel = vi
			.spyOn(dataProvider, 'updateDisplayChannel')
			.mockImplementation(() => {});
		updateSampleDisplay = vi
			.spyOn(dataProvider, 'updateSampleDisplay')
			.mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ── Trigger ──────────────────────────────────────────────────────────────

	describe('trigger label', () => {
		it('names the current single channel', async () => {
			render(SampleChannelSelector, { uuid: 'p', item: makeItem({ dispChannel: ['L'] }) });
			await expect.element(page.getByRole('button').first()).toHaveTextContent('L');
		});

		it('collapses L+R into one label', async () => {
			render(SampleChannelSelector, { uuid: 'p', item: makeItem({ dispChannel: ['L', 'R'] }) });
			await expect.element(page.getByRole('button').first()).toHaveTextContent('L + R');
		});

		it('falls back to the raw value when the channel has no option', async () => {
			render(SampleChannelSelector, {
				uuid: 'p',
				item: makeItem({ channels: { AVG: channel(79) }, dispChannel: ['L'] })
			});
			await expect.element(page.getByRole('button').first()).toHaveTextContent('L');
		});
	});

	// ── Channel radios ───────────────────────────────────────────────────────

	describe('channel options', () => {
		it('offers L, R, L+R and AVG for a full-channel entry', async () => {
			await open(makeItem());
			const radios = page.getByRole('radio');
			await expect.element(radios.first()).toBeInTheDocument();
			expect(await radios.all()).toHaveLength(4);
		});

		it('offers only AVG when that is the sole channel', async () => {
			await open(makeItem({ channels: { AVG: channel(79) } }));
			expect(await page.getByRole('radio').all()).toHaveLength(1);
		});

		it('omits the combined option when only one side exists', async () => {
			await open(makeItem({ channels: { L: channel(80), AVG: channel(79) } }));
			expect(await page.getByRole('radio').all()).toHaveLength(2);
		});

		it('checks the radio matching the current dispChannel', async () => {
			await open(makeItem({ dispChannel: ['L', 'R'] }));
			const checked = (await page.getByRole('radio').all()).map(
				(r) => (r.element() as HTMLInputElement).checked
			);
			expect(checked.filter(Boolean)).toHaveLength(1);
		});

		it('reports a single-channel pick through dataProvider', async () => {
			await open(makeItem());
			await page.getByRole('radio').first().click();
			expect(updateDisplayChannel).toHaveBeenCalledWith('p', ['L']);
		});

		it('expands the combined option back into two channels', async () => {
			await open(makeItem());
			await page.getByRole('radio').nth(2).click();
			expect(updateDisplayChannel).toHaveBeenCalledWith('p', ['L', 'R']);
		});
	});

	// ── Sample set ───────────────────────────────────────────────────────────
	//
	// One section for every kind of set. The checkbox order in the popover is:
	// average, fill (only when the set has more than one run), then — once the
	// per-sample disclosure is open — one checkbox per channel each run loaded.

	describe('sample set', () => {
		/** Two runs, each with L, R and AVG. */
		const withSamples = (overrides: Partial<FRDataObject> = {}) =>
			makeItem({
				samples: runs(2),
				showAvg: true,
				showFill: false,
				dispSamples: [],
				...overrides
			});

		it('is absent for an entry with no samples', async () => {
			await open(makeItem());
			expect(await page.getByRole('checkbox').all()).toHaveLength(0);
		});

		it('offers the average and fill toggles plus one box per run channel', async () => {
			await open(withSamples());
			await openRuns();
			// avg + fill + (L, R, AVG) × 2 runs
			expect(await page.getByRole('checkbox').all()).toHaveLength(8);
			await expect.element(page.getByText('Fit A', { exact: true })).toBeInTheDocument();
			await expect.element(page.getByText('Fit B', { exact: true })).toBeInTheDocument();
		});

		it('hides the fill toggle for a single-run set — there is no spread to fill', async () => {
			await open(withSamples({ samples: runs(1) }));
			await openRuns();
			// avg + (L, R, AVG) × 1 run
			expect(await page.getByRole('checkbox').all()).toHaveLength(4);
		});

		it('offers only the channels a run actually loaded', async () => {
			await open(withSamples({ samples: [{ label: 'Fit A', L: channel(81) }] }));
			await openRuns();
			// avg + L only
			expect(await page.getByRole('checkbox').all()).toHaveLength(2);
		});

		it('falls back to a 1-based ordinal for an unlabelled run', async () => {
			await open(withSamples({ samples: [{ L: channel(81) }] }));
			await openRuns();
			await expect.element(page.getByText('Sample 1', { exact: true })).toBeInTheDocument();
		});

		it('reflects the current average and fill state', async () => {
			await open(withSamples({ showAvg: false, showFill: true }));
			const checked = (await page.getByRole('checkbox').all()).map(
				(c) => (c.element() as HTMLInputElement).checked
			);
			expect(checked.slice(0, 2)).toEqual([false, true]);
		});

		it('checks the run keys that are currently displayed', async () => {
			await open(withSamples({ dispSamples: ['sample0_L', 'sample1_AVG'] }));
			const checked = (await page.getByRole('checkbox').all()).map(
				(c) => (c.element() as HTMLInputElement).checked
			);
			// avg, fill, then run 0 (L,R,AVG), run 1 (L,R,AVG)
			expect(checked).toEqual([true, false, true, false, false, false, false, true]);
		});

		// The bug this rewrite fixes: the old HpTF control emitted `_AVG` for every
		// per-sample tick, so an individual curve was always the L/R mean no matter
		// which channel the user asked for. The renderer always understood all three.

		it('emits the L key when a run L box is ticked', async () => {
			await open(withSamples());
			await openRuns();
			await page.getByLabelText('Fit A L', { exact: true }).click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', ['sample0_L']);
		});

		it('emits the R key when a run R box is ticked', async () => {
			await open(withSamples());
			await openRuns();
			await page.getByLabelText('Fit B R', { exact: true }).click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', ['sample1_R']);
		});

		it('emits the AVG key when a run AVG box is ticked', async () => {
			await open(withSamples());
			await openRuns();
			await page.getByLabelText('Fit A AVG', { exact: true }).click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', ['sample0_AVG']);
		});

		it('removes a key when a checked box is unticked', async () => {
			await open(withSamples({ dispSamples: ['sample0_L', 'sample0_R'] }));
			await page.getByLabelText('Fit A L', { exact: true }).click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', ['sample0_R']);
		});

		it('toggles the fill without disturbing the run picks or the average', async () => {
			await open(withSamples({ dispSamples: ['sample0_AVG'], showFill: false, showAvg: true }));
			await page.getByLabelText('Show Deviation Fill').click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', ['sample0_AVG'], true, true);
		});

		it('toggles the average off — impossible for multi-sample before unification', async () => {
			await open(withSamples({ dispSamples: ['sample0_AVG'], showFill: true, showAvg: true }));
			await page.getByLabelText('Show all-sample average').click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', ['sample0_AVG'], true, false);
		});

		it('selects every left channel from the All L preset', async () => {
			await open(withSamples());
			await openRuns();
			await page.getByRole('button', { name: /^Select All L$/ }).click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', ['sample0_L', 'sample1_L']);
		});

		it('selects every right channel from the All R preset', async () => {
			await open(withSamples());
			await openRuns();
			await page.getByRole('button', { name: /^Select All R$/ }).click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', ['sample0_R', 'sample1_R']);
		});

		it('selects every channel of every run from the All preset', async () => {
			await open(withSamples({ samples: runs(1) }));
			await openRuns();
			await page.getByRole('button', { name: /^Select All$/ }).click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', [
				'sample0_L',
				'sample0_R',
				'sample0_AVG'
			]);
		});

		it('skips channels a run did not load in the presets', async () => {
			await open(withSamples({ samples: [{ label: 'Fit A', L: channel(81) }] }));
			await openRuns();
			await page.getByRole('button', { name: /^Select All R$/ }).click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', []);
		});

		it('clears the selection from the None preset', async () => {
			await open(withSamples({ dispSamples: ['sample0_L'] }));
			await page.getByRole('button', { name: /^Deselect All$/ }).click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', []);
		});
	});

	// ── Per-sample disclosure ────────────────────────────────────────────────
	//
	// The run list is collapsed by default and capped in height. An unbounded
	// list pushed the popover past the viewport on sets with many runs, and most
	// visitors only ever want the averaged curve.

	describe('per-sample disclosure', () => {
		const withSamples = (overrides: Partial<FRDataObject> = {}) =>
			makeItem({ samples: runs(2), showAvg: true, showFill: false, dispSamples: [], ...overrides });

		it('starts collapsed, leaving only the average and fill toggles', async () => {
			await open(withSamples());
			expect(await page.getByRole('checkbox').all()).toHaveLength(2);
			expect(await page.getByRole('button', { name: /^Select All L$/ }).all()).toHaveLength(0);
		});

		it('starts open when the item already displays runs', async () => {
			await open(withSamples({ dispSamples: ['sample0_L'] }));
			// avg + fill + (L, R, AVG) × 2 runs, with no disclosure click
			expect(await page.getByRole('checkbox').all()).toHaveLength(8);
		});

		it('collapses again on a second click', async () => {
			await open(withSamples());
			await openRuns();
			expect(await page.getByRole('checkbox').all()).toHaveLength(8);
			await openRuns();
			expect(await page.getByRole('checkbox').all()).toHaveLength(2);
		});

		it('reports its state to assistive tech', async () => {
			await open(withSamples());
			const toggle = page.getByRole('button', { name: /Per-sample curves/ });
			await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');
			await openRuns();
			await expect.element(toggle).toHaveAttribute('aria-expanded', 'true');
		});

		it('counts the displayed runs while collapsed', async () => {
			await open(withSamples({ dispSamples: ['sample0_L', 'sample1_R'] }));
			await openRuns(); // starts open here, so this collapses it
			await expect
				.element(page.getByRole('button', { name: /Per-sample curves/ }))
				.toHaveTextContent('2');
		});
	});

	// ── Channel radios vs. the sample toggles ────────────────────────────────

	describe('channel radios stay reachable', () => {
		// `dispChannel` does not only gate the averaged curve: `_buildEnvelopePath`
		// picks which side of the deviation fill to draw from it. Hiding the radios
		// when the average is off would strand a user with a combined L+R band and
		// no way to narrow it.
		it('offers the channel radios with the average off and the fill on', async () => {
			await open(
				makeItem({
					samples: runs(2),
					showAvg: false,
					showFill: true,
					dispSamples: []
				})
			);
			expect(await page.getByRole('radio').all()).toHaveLength(4);
		});
	});
});
