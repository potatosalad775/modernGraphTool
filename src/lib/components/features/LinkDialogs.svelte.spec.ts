/**
 * `LinkDialogs` shows uniPEQ's questions. These specs cover its write review, which uniPEQ numbers
 * by the list it planned: the store is set as the link service would leave it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { LinkStatus, PlanChange } from 'peq-link/client';
import LinkDialogs from './LinkDialogs.svelte';
import { linkStore } from '#lib/stores/link-store.svelte.js';
import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import type { DeviceConnection } from '#lib/device-peq/types.js';
import type { EQFilter } from '#lib/utils/equalizer.js';

const pk = (freq: number, gain: number): EQFilter => ({
	enabled: true,
	type: 'PK',
	freq,
	q: 1,
	gain
});
/** A band just added: the link leaves it out, so uniPEQ's slots skip it. */
const blank: EQFilter = { enabled: true, type: 'PK', freq: null, q: null, gain: null };

const STATUS: LinkStatus = {
	connected: true,
	knownDevice: 'Test DAC',
	editable: true,
	activeSlot: null,
	deviceSlot: null,
	eqEnabled: true,
	busy: null,
	inSync: false,
	unwritten: true,
	needsReconnect: false,
	auto: { on: false, pending: false, paused: false, stopped: false, clipRisk: false },
	failure: null,
	review: null
};

/** uniPEQ's review at `rev` of one gain change, in slot `band` of its one list. */
function review(rev: number, band: number): LinkStatus {
	const change: PlanChange = { kind: 'field', band, field: 'gain', wanted: 4, written: 3.5 };
	return { ...STATUS, review: { rev, changes: [change], clipRisk: false, infeasible: false } };
}

describe('LinkDialogs', () => {
	afterEach(() => {
		linkStore.reset();
		devicePeqStore.connection = null;
		eqStore.filters = [];
	});

	it('numbers uniPEQ’s review by the band list it came with, while the list moves', async () => {
		eqStore.filters = [pk(100, 3), pk(200, 4)];
		devicePeqStore.connection = { connectionType: 'link', name: 'Test DAC' } as DeviceConnection;
		linkStore.status = review(1, 2);
		await render(LinkDialogs);
		await expect.element(page.getByText('Band 2 · Gain')).toBeInTheDocument();

		// A band added ahead of them while the review is open: slot 2 is now the list's third band,
		// but this review was planned before it.
		eqStore.filters = [blank, pk(100, 3), pk(200, 4)];
		linkStore.status = { ...review(1, 2) };
		await expect.element(page.getByText('Band 2 · Gain')).toBeInTheDocument();

		// uniPEQ's next review is planned on the list as it is now.
		linkStore.status = review(2, 2);
		await expect.element(page.getByText('Band 3 · Gain')).toBeInTheDocument();
	});
});
