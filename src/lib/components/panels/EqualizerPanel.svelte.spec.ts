/**
 * `EqualizerPanel` holds the master Equalizer switch. Its one rule worth a spec: a click made while
 * the `\` key is held is the user's decision about the EQ afterwards, so it has to survive the
 * release instead of being reverted by it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import EqualizerPanel from './EqualizerPanel.svelte';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import type { FRDataObject } from '#lib/types/data-types.js';

vi.mock('#lib/workers/autoeq-client.js', () => ({
	prewarmAutoEQ: vi.fn(),
	runAutoEQInWorker: vi.fn()
}));

function masterSwitch() {
	return page.getByRole('switch', { name: 'EQUALIZER', exact: true });
}

/** A loaded phone to be the EQ source: `EqPhoneSelect` drops a source that isn't in `frStore`. */
function loadSource(): void {
	frStore.set('source', {
		uuid: 'source',
		type: 'phone',
		identifier: 'Source Phone',
		channels: { AVG: { data: [[1000, 80]], metadata: { minFreq: 20, maxFreq: 20000 } } }
	} as unknown as FRDataObject);
	eqStore.sourcePhoneUUID = 'source';
}

function reset() {
	eqStore.releaseMomentary();
	frStore.entries.clear();
	eqStore.filters = [];
	eqStore.isEnabled = false;
	eqStore.momentaryOverride = null;
	eqStore.momentaryRestore = null;
	eqStore.sourcePhoneUUID = null;
}

describe('EqualizerPanel master switch', () => {
	beforeEach(reset);
	afterEach(reset);

	it('switches the equalizer on and off with no hold', async () => {
		render(EqualizerPanel);

		await masterSwitch().click();
		expect(eqStore.isEnabled).toBe(true);

		await masterSwitch().click();
		expect(eqStore.isEnabled).toBe(false);
	});

	it('keeps showing the live state during a hold', async () => {
		loadSource();
		eqStore.isEnabled = true;
		render(EqualizerPanel);

		eqStore.holdMomentary();

		// Bypassed: the switch follows what is heard, not what release will restore.
		await expect.element(masterSwitch()).not.toBeChecked();
	});

	// The switch shows the live state, so a click always asks for the opposite of what is heard:
	// the click is a decision about the state after the key comes up, not about the hold itself.
	it('leaves an audition hold running when the switch is clicked, and lands off on release', async () => {
		loadSource();
		eqStore.isEnabled = false;
		render(EqualizerPanel);

		eqStore.holdMomentary();
		await expect.element(masterSwitch()).toBeChecked();

		await masterSwitch().click();

		// Still auditioning until the key comes up.
		expect(eqStore.isEnabled).toBe(true);
		expect(eqStore.momentaryOverride).toBe('audition');
		eqStore.releaseMomentary();
		expect(eqStore.isEnabled).toBe(false);
	});

	it('leaves a bypass hold running when the switch is clicked, and lands on on release', async () => {
		loadSource();
		eqStore.isEnabled = true;
		render(EqualizerPanel);

		eqStore.holdMomentary();
		await expect.element(masterSwitch()).not.toBeChecked();

		await masterSwitch().click();

		// Still bypassed until the key comes up.
		expect(eqStore.isEnabled).toBe(false);
		expect(eqStore.momentaryOverride).toBe('bypass');
		eqStore.releaseMomentary();
		expect(eqStore.isEnabled).toBe(true);
	});
});
