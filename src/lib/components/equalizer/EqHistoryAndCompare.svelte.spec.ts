/**
 * `EqHistoryAndCompare` is the session snapshot log plus the A/B switcher.
 *
 * The store's own debounce/coalesce rules are covered in
 * `eq-history-store.svelte.spec.ts`; this spec drives the view, so snapshots are
 * written straight into `eqHistoryStore.snapshots` rather than recorded through
 * the timer path. What matters here is which snapshot each row nominates, when
 * the A/B buttons are live, and that applying one goes through `eqCommands`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import EqHistoryAndCompare from './EqHistoryAndCompare.svelte';
import { eqHistoryStore, type EqSnapshot } from '$lib/stores/eq-history-store.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { eqCommands } from '$lib/services/eq-commands.js';
import type { EQFilter } from '$lib/utils/equalizer.js';
import * as m from '$lib/paraglide/messages.js';

function makeFilter(overrides: Partial<EQFilter> = {}): EQFilter {
	return { enabled: true, type: 'PK', freq: 1000, q: 1, gain: 3, ...overrides };
}

function makeSnapshot(overrides: Partial<EqSnapshot> = {}): EqSnapshot {
	return {
		id: 's1',
		timestamp: Date.UTC(2026, 0, 1, 9, 30, 0),
		filters: [makeFilter()],
		preamp: -3,
		summary: 'PK 1k Hz +3.0 dB, preamp -3.0 dB',
		...overrides
	};
}

/** The same local-time formatting the component applies to `snap.timestamp`. */
function expectedTime(ts: number): string {
	const d = new Date(ts);
	return [d.getHours(), d.getMinutes(), d.getSeconds()]
		.map((n) => String(n).padStart(2, '0'))
		.join(':');
}

function button(name: string) {
	return page.getByRole('button', { name });
}

describe('EqHistoryAndCompare', () => {
	let applySnapshot: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		eqHistoryStore.clear();
		eqStore.filters = [];
		eqStore.preamp = 0;
		applySnapshot = vi.spyOn(eqCommands, 'applySnapshot').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		eqHistoryStore.clear();
	});

	// ── Empty state ──────────────────────────────────────────────────────────

	describe('with no snapshots', () => {
		it('shows the empty placeholder instead of the list', async () => {
			render(EqHistoryAndCompare);

			await expect.element(page.getByText(m.eq_history_empty())).toBeInTheDocument();
			expect(page.getByRole('listitem').elements()).toHaveLength(0);
		});

		it('disables both A/B apply buttons and labels them as unset', async () => {
			render(EqHistoryAndCompare);

			await expect.element(button(m.eq_history_pick_a_first())).toBeDisabled();
			await expect.element(button(m.eq_history_pick_b_first())).toBeDisabled();
		});

		it('disables Clear', async () => {
			render(EqHistoryAndCompare);

			await expect.element(button(m.eq_history_clear())).toBeDisabled();
		});
	});

	// ── The list ─────────────────────────────────────────────────────────────

	describe('snapshot list', () => {
		it('renders newest first', async () => {
			eqHistoryStore.snapshots = [
				makeSnapshot({ id: 'old', summary: 'oldest entry' }),
				makeSnapshot({ id: 'new', summary: 'newest entry' })
			];
			render(EqHistoryAndCompare);

			await expect.element(page.getByText('newest entry')).toBeInTheDocument();
			const rows = page.getByRole('listitem').elements();
			expect(rows[0].textContent).toContain('newest entry');
			expect(rows[1].textContent).toContain('oldest entry');
		});

		it('prints the snapshot time in local hh:mm:ss', async () => {
			const snap = makeSnapshot();
			eqHistoryStore.snapshots = [snap];
			render(EqHistoryAndCompare);

			await expect
				.element(page.getByText(expectedTime(snap.timestamp), { exact: true }))
				.toBeInTheDocument();
		});
	});

	// ── Nominating A / B ─────────────────────────────────────────────────────

	describe('A/B nomination', () => {
		beforeEach(() => {
			eqHistoryStore.snapshots = [makeSnapshot({ id: 'a' }), makeSnapshot({ id: 'b' })];
		});

		it('sets the A side from the row button', async () => {
			render(EqHistoryAndCompare);
			// Newest first, so the first "Set as A mode" belongs to snapshot `b`.
			await button(m.eq_history_set_a()).first().click();

			expect(eqHistoryStore.aSnapshotId).toBe('b');
		});

		it('flips the row button to unset once nominated', async () => {
			render(EqHistoryAndCompare);
			await button(m.eq_history_set_a()).first().click();

			await expect.element(button(m.eq_history_unset_a())).toBeInTheDocument();
		});

		it('clears the selection when the nominated row is clicked again', async () => {
			render(EqHistoryAndCompare);
			await button(m.eq_history_set_a()).first().click();
			await button(m.eq_history_unset_a()).click();

			expect(eqHistoryStore.aSnapshotId).toBeNull();
		});

		it('keeps A and B independent', async () => {
			render(EqHistoryAndCompare);
			await button(m.eq_history_set_a()).first().click();
			await button(m.eq_history_set_b()).last().click();

			expect(eqHistoryStore.aSnapshotId).toBe('b');
			expect(eqHistoryStore.bSnapshotId).toBe('a');
		});

		it('enables the apply button for the nominated side only', async () => {
			render(EqHistoryAndCompare);
			await button(m.eq_history_set_a()).first().click();

			await expect.element(button(m.eq_history_apply_a_title())).toBeEnabled();
			await expect.element(button(m.eq_history_pick_b_first())).toBeDisabled();
		});
	});

	// ── Applying ─────────────────────────────────────────────────────────────

	describe('applying a side', () => {
		it('sends the nominated snapshot to eqCommands', async () => {
			const snap = makeSnapshot({ id: 'a', preamp: -4.5 });
			eqHistoryStore.snapshots = [snap];
			render(EqHistoryAndCompare);

			await button(m.eq_history_set_a()).click();
			await button(m.eq_history_apply_a_title()).click();

			expect(applySnapshot).toHaveBeenCalledWith(snap.filters, -4.5);
		});

		it('applies the B side from the B button', async () => {
			const snap = makeSnapshot({ id: 'a', preamp: -1 });
			eqHistoryStore.snapshots = [snap];
			render(EqHistoryAndCompare);

			await button(m.eq_history_set_b()).click();
			await button(m.eq_history_apply_b_title()).click();

			expect(applySnapshot).toHaveBeenCalledWith(snap.filters, -1);
		});

		it('marks the side active while the live filters still match it', async () => {
			const snap = makeSnapshot({ id: 'a' });
			eqHistoryStore.snapshots = [snap];
			eqStore.filters = snap.filters.map((f) => ({ ...f }));
			eqStore.preamp = snap.preamp;
			render(EqHistoryAndCompare);

			await button(m.eq_history_set_a()).click();
			// `aActive` swaps the variant from outline to primary — the only
			// user-visible signal that the live stack is the A snapshot.
			await expect.element(button(m.eq_history_apply_a_title())).toHaveClass(/bg-primary/);
		});

		it('drops the active marking once the live filters diverge', async () => {
			const snap = makeSnapshot({ id: 'a' });
			eqHistoryStore.snapshots = [snap];
			eqStore.filters = snap.filters.map((f) => ({ ...f }));
			eqStore.preamp = snap.preamp;
			render(EqHistoryAndCompare);

			await button(m.eq_history_set_a()).click();
			eqStore.preamp = snap.preamp - 1;

			await expect.element(button(m.eq_history_apply_a_title())).not.toHaveClass(/bg-primary/);
		});
	});

	// ── Clearing ─────────────────────────────────────────────────────────────

	it('empties the log from the Clear button', async () => {
		eqHistoryStore.snapshots = [makeSnapshot()];
		render(EqHistoryAndCompare);

		await button(m.eq_history_clear()).click();

		expect(eqHistoryStore.snapshots).toEqual([]);
		await expect.element(page.getByText(m.eq_history_empty())).toBeInTheDocument();
	});

	// ── Help popover ─────────────────────────────────────────────────────────

	it('explains the A/B workflow from the info popover', async () => {
		render(EqHistoryAndCompare);
		await button("Open 'Frequency range' option description").click();

		await expect.element(page.getByText(m.eq_history_help_text())).toBeInTheDocument();
	});
});
