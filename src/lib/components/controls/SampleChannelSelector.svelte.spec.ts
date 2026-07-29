/**
 * `SampleChannelSelector` is the "…" popover on each selection-list row: the
 * L/R/AVG channel radio, the multi-sample trace checkboxes and the HpTF section.
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
import type { FRDataObject, HpTFSampleData } from '$lib/types/data-types.js';

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

function hptfSamples(count: number, withAvg = true): HpTFSampleData[] {
	return Array.from({ length: count }, (_, i) => ({
		label: `Fit ${String.fromCharCode(65 + i)}`,
		L: channel(80 + i),
		R: channel(78 + i),
		...(withAvg && { AVG: channel(79 + i) })
	}));
}

/** Render, then open the popover so its content is in the document. */
async function open(item: FRDataObject) {
	const result = render(SampleChannelSelector, { uuid: 'p', item });
	await page.getByRole('button').first().click();
	return result;
}

describe('SampleChannelSelector', () => {
	let updateDisplayChannel: ReturnType<typeof vi.spyOn>;
	let updateSampleDisplay: ReturnType<typeof vi.spyOn>;
	let updateHpTFDisplay: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		updateDisplayChannel = vi
			.spyOn(dataProvider, 'updateDisplayChannel')
			.mockImplementation(() => {});
		updateSampleDisplay = vi
			.spyOn(dataProvider, 'updateSampleDisplay')
			.mockImplementation(() => {});
		updateHpTFDisplay = vi.spyOn(dataProvider, 'updateHpTFDisplay').mockImplementation(() => {});
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

	// ── Multi-sample ─────────────────────────────────────────────────────────

	describe('sample traces', () => {
		const withSamples = (dispSamples: string[] = []) =>
			makeItem({
				sampleCount: 2,
				samples: [
					{ L: channel(81), R: channel(79) },
					{ L: channel(82), R: channel(80) }
				],
				dispSamples: dispSamples as never
			});

		it('is absent for an entry with no samples', async () => {
			await open(makeItem());
			expect(await page.getByRole('checkbox').all()).toHaveLength(0);
		});

		it('lists an L and an R checkbox per sample slot', async () => {
			await open(withSamples());
			expect(await page.getByRole('checkbox').all()).toHaveLength(4);
			await expect.element(page.getByText('L1', { exact: true })).toBeInTheDocument();
			await expect.element(page.getByText('R2', { exact: true })).toBeInTheDocument();
		});

		it('checks the keys that are currently displayed', async () => {
			await open(withSamples(['L1', 'R2']));
			const checked = (await page.getByRole('checkbox').all()).map(
				(c) => (c.element() as HTMLInputElement).checked
			);
			expect(checked).toEqual([true, false, false, true]);
		});

		it('adds a key when an unchecked box is ticked', async () => {
			await open(withSamples(['L1']));
			await page.getByRole('checkbox').nth(1).click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', ['L1', 'R1']);
		});

		it('removes a key when a checked box is unticked', async () => {
			await open(withSamples(['L1', 'R1']));
			await page.getByRole('checkbox').first().click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', ['R1']);
		});

		it('selects every left channel from the All L preset', async () => {
			await open(withSamples());
			await page.getByRole('button', { name: /^Select All L$/ }).click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', ['L1', 'L2']);
		});

		it('selects every right channel from the All R preset', async () => {
			await open(withSamples());
			await page.getByRole('button', { name: /^Select All R$/ }).click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', ['R1', 'R2']);
		});

		it('selects everything from the All preset', async () => {
			await open(withSamples());
			await page.getByRole('button', { name: /^Select All$/ }).click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', ['L1', 'R1', 'L2', 'R2']);
		});

		it('clears the selection from the None preset', async () => {
			await open(withSamples(['L1', 'R1']));
			await page.getByRole('button', { name: /^Deselect All$/ }).click();
			expect(updateSampleDisplay).toHaveBeenCalledWith('p', []);
		});
	});

	// ── HpTF ─────────────────────────────────────────────────────────────────

	describe('HpTF section', () => {
		const withHptf = (
			overrides: Partial<FRDataObject> = {},
			fillOnly = false,
			count = 2,
			withAvg = true
		) =>
			makeItem({
				hptf: {
					samples: hptfSamples(count, withAvg),
					envelope: {
						L: { upper: [], lower: [] },
						R: { upper: [], lower: [] },
						AVG: { upper: [], lower: [] }
					},
					labels: hptfSamples(count).map((s) => s.label),
					fillOnly
				},
				hptfFillVisible: true,
				hptfAvgVisible: false,
				...overrides
			});

		it('always shows the fill and average toggles', async () => {
			await open(withHptf({}, true));
			// fill + average, and no per-sample rows while fillOnly
			expect(await page.getByRole('checkbox').all()).toHaveLength(2);
		});

		it('reflects the current fill and average visibility', async () => {
			await open(withHptf({ hptfFillVisible: true, hptfAvgVisible: true }, true));
			const checked = (await page.getByRole('checkbox').all()).map(
				(c) => (c.element() as HTMLInputElement).checked
			);
			expect(checked).toEqual([true, true]);
		});

		it('flips the fill flag without disturbing the rest', async () => {
			await open(withHptf({ dispHptf: ['sample0_AVG'] as never }, true));
			await page.getByRole('checkbox').first().click();
			expect(updateHpTFDisplay).toHaveBeenCalledWith('p', ['sample0_AVG'], false, false);
		});

		it('flips the average flag without disturbing the rest', async () => {
			await open(withHptf({ dispHptf: ['sample0_AVG'] as never }, true));
			await page.getByRole('checkbox').nth(1).click();
			expect(updateHpTFDisplay).toHaveBeenCalledWith('p', ['sample0_AVG'], true, true);
		});

		it('adds per-sample rows once the variant is not fill-only', async () => {
			await open(withHptf());
			// fill + average + one per sample
			expect(await page.getByRole('checkbox').all()).toHaveLength(4);
			await expect.element(page.getByText('Fit A')).toBeInTheDocument();
		});

		it('adds the AVG key when a sample row is ticked', async () => {
			await open(withHptf());
			await page.getByRole('checkbox').nth(2).click();
			expect(updateHpTFDisplay).toHaveBeenCalledWith('p', ['sample0_AVG'], true, false);
		});

		it('falls back to the L key for a sample with no AVG channel', async () => {
			await open(withHptf({}, false, 2, false));
			await page.getByRole('checkbox').nth(2).click();
			expect(updateHpTFDisplay).toHaveBeenCalledWith('p', ['sample0_L'], true, false);
		});

		it('drops every key for a sample when its row is unticked', async () => {
			await open(withHptf({ dispHptf: ['sample0_AVG', 'sample1_AVG'] as never }));
			await page.getByRole('checkbox').nth(2).click();
			expect(updateHpTFDisplay).toHaveBeenCalledWith('p', ['sample1_AVG'], true, false);
		});

		it('selects every sample from the All preset', async () => {
			await open(withHptf());
			await page.getByRole('button', { name: /^Select All$/ }).click();
			expect(updateHpTFDisplay).toHaveBeenCalledWith(
				'p',
				['sample0_AVG', 'sample1_AVG'],
				true,
				false
			);
		});

		it('clears every sample from the None preset, keeping fill and average', async () => {
			await open(withHptf({ dispHptf: ['sample0_AVG'] as never }));
			await page.getByRole('button', { name: /^Deselect All$/ }).click();
			expect(updateHpTFDisplay).toHaveBeenCalledWith('p', [], true, false);
		});
	});
});
