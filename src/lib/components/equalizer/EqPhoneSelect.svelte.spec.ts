/**
 * `EqPhoneSelect` picks what the EQ is applied to: a device, or one run of a
 * device's sample set — EQ'ing the average of several insertion depths fits
 * nobody's ear. The runs sit nested under their device in the same picker; the
 * header has no room for a second one.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import EqPhoneSelect from './EqPhoneSelect.svelte';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import type { FRDataObject } from '#lib/types/data-types.js';
import * as m from '#lib/paraglide/messages.js';

const curve = { data: [[1000, 0]] as [number, number][] };

function addSampleSet(): void {
	frStore.set('set', {
		uuid: 'set',
		type: 'phone',
		identifier: 'IEM',
		dispSuffix: 'Depths',
		channels: { AVG: curve },
		samples: [{ label: 'Shallow', AVG: curve }, { label: 'Deep', AVG: curve }, {}]
	} as unknown as FRDataObject);
}

function addPhone(uuid: string, identifier: string): void {
	frStore.set(uuid, {
		uuid,
		type: 'phone',
		identifier,
		channels: { AVG: curve }
	} as unknown as FRDataObject);
}

function trigger() {
	return page.getByRole('combobox');
}

async function open(): Promise<void> {
	await trigger().click();
	await expect.element(page.getByRole('listbox')).toBeInTheDocument();
}

describe('EqPhoneSelect', () => {
	beforeEach(() => {
		frStore.entries.clear();
		eqStore.sourcePhoneUUID = null;
	});

	afterEach(() => {
		frStore.entries.clear();
		eqStore.sourcePhoneUUID = null;
	});

	it('nests the runs that have data under their device', async () => {
		addSampleSet();
		addPhone('other', 'Other');
		render(EqPhoneSelect);
		await open();

		const labels = Array.from(document.querySelectorAll('[role="option"]')).map(
			(o) => o.textContent?.replace(/\s+/g, ' ').trim() ?? ''
		);
		// The empty third run is left out.
		expect(labels).toEqual([
			`IEM Depths ${m.selection_list_channel_average()}`,
			'Shallow',
			'Deep',
			'Other'
		]);
	});

	it('names a run by its device as well', async () => {
		addSampleSet();
		render(EqPhoneSelect);
		await open();

		await expect.element(page.getByRole('option', { name: 'IEM Depths · Deep' })).toBeVisible();
	});

	it('stores the run with the variant it was picked on', async () => {
		addSampleSet();
		addPhone('other', 'Other');
		render(EqPhoneSelect);
		await open();

		await page.getByRole('option', { name: 'IEM Depths · Deep' }).click();

		await expect.poll(() => eqStore.sourcePhoneUUID).toBe('set');
		expect(eqStore.sourceSample).toEqual({ index: 1, variant: 'Depths' });
		await expect
			.element(trigger())
			.toHaveAccessibleName(`${m.equalizer_phone_select_source_label()} IEM Depths · Deep`);
	});

	it('picks the average again from the device row', async () => {
		addSampleSet();
		addPhone('other', 'Other');
		eqStore.sourcePhoneUUID = 'set';
		eqStore.sourceSample = { index: 0, variant: 'Depths' };
		render(EqPhoneSelect);
		await open();

		await page
			.getByRole('option', { name: /^IEM Depths/ })
			.first()
			.click();

		await expect.poll(() => eqStore.sourceSample).toBeNull();
		expect(eqStore.sourcePhoneUUID).toBe('set');
	});

	it('shows a pick from another variant as the average', async () => {
		addSampleSet();
		addPhone('other', 'Other');
		eqStore.sourcePhoneUUID = 'set';
		eqStore.sourceSample = { index: 1, variant: 'Repeat Runs' };
		render(EqPhoneSelect);

		await expect
			.element(trigger())
			.toHaveTextContent(`IEM Depths · ${m.selection_list_channel_average()}`);
	});
});
