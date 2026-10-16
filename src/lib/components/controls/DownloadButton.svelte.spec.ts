/**
 * `DownloadButton` is the per-row download control. A plain curve downloads on
 * click; a sample set opens a two-option menu (average only / all samples).
 * The bits-ui Popover renders into a portal, hence `page.getBy*`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import DownloadButton from './DownloadButton.svelte';
import { dataProvider } from '#lib/services/data-provider.svelte.js';
import type { FRDataObject } from '#lib/types/data-types.js';

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

describe('DownloadButton', () => {
	let download: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		download = vi.spyOn(dataProvider, 'downloadFRDataWithUUID').mockResolvedValue();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('downloads a plain curve on click, without a menu', async () => {
		render(DownloadButton, { uuid: 'p', item: makeItem() });
		await page.getByRole('button', { name: 'Download' }).click();
		expect(download).toHaveBeenCalledExactlyOnceWith('p', { runs: false });
		await expect.element(page.getByRole('button', { name: 'All samples' })).not.toBeInTheDocument();
	});

	describe('a sample set', () => {
		const item = makeItem({ samples: [{ L: channel(80) }, { L: channel(81) }] });

		it('asks before downloading', async () => {
			render(DownloadButton, { uuid: 'p', item });
			await page.getByRole('button', { name: 'Download' }).click();
			expect(download).not.toHaveBeenCalled();
			await expect.element(page.getByRole('button', { name: 'Average only' })).toBeVisible();
		});

		it('"Average only" exports the average alone', async () => {
			render(DownloadButton, { uuid: 'p', item });
			await page.getByRole('button', { name: 'Download' }).click();
			await page.getByRole('button', { name: 'Average only' }).click();
			expect(download).toHaveBeenCalledExactlyOnceWith('p', { runs: false });
		});

		it('"All samples" exports the runs too, and closes the menu', async () => {
			render(DownloadButton, { uuid: 'p', item });
			await page.getByRole('button', { name: 'Download' }).click();
			await page.getByRole('button', { name: 'All samples' }).click();
			expect(download).toHaveBeenCalledExactlyOnceWith('p', { runs: true });
			await expect
				.element(page.getByRole('button', { name: 'All samples' }))
				.not.toBeInTheDocument();
		});

		it('describes each option to assistive tech', async () => {
			render(DownloadButton, { uuid: 'p', item });
			await page.getByRole('button', { name: 'Download' }).click();
			await expect
				.element(page.getByRole('button', { name: 'All samples' }))
				.toHaveAccessibleDescription('The average plus every sample, as a .zip');
		});
	});
});
