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
import { page, userEvent } from 'vitest/browser';
import EqHistoryAndCompare from './EqHistoryAndCompare.svelte';
import { eqHistoryStore, type EqSnapshot } from '$lib/stores/eq-history-store.svelte.js';
import {
	BOOKMARK_CAP,
	eqBookmarkStore,
	type EqBookmark
} from '$lib/stores/eq-bookmark-store.svelte.js';
import {
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID,
	eqConstraintsStore
} from '$lib/stores/eq-constraints-store.svelte.js';
import { parametricPreset } from '$lib/utils/__fixtures__/eq-profiles.js';
import { toast } from 'svelte-sonner';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { eqCommands } from '$lib/services/eq-commands.js';
import { dataProvider } from '$lib/services/data-provider.svelte.js';
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

function makeBookmark(overrides: Partial<EqBookmark> = {}): EqBookmark {
	return {
		id: 'bm-1',
		name: 'Bass-light v2',
		createdAt: Date.UTC(2026, 9, 14, 12),
		filters: [makeFilter({ gain: -2 })],
		preamp: -1,
		device: { identifier: 'Sennheiser HD 600' },
		...overrides
	};
}

function button(name: string) {
	return page.getByRole('button', { name });
}

function menuItem(name: string) {
	return page.getByRole('menuitem', { name });
}

/** Back to no history, no bookmarks and no A/B picks. */
function reset() {
	eqHistoryStore.clear();
	eqHistoryStore.aSnapshotId = null;
	eqHistoryStore.bSnapshotId = null;
	eqBookmarkStore.items = [];
	eqConstraintsStore.presets = [...BUILTIN_PRESETS];
	eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
	localStorage.clear();
}

/** Activate a ±6 dB, 2-band constraint labelled "Tight". */
function activateTight() {
	eqConstraintsStore.presets = [
		...BUILTIN_PRESETS,
		parametricPreset('tight', { label: 'Tight', maxBands: 2, gain: { min: -6, max: 6 } })
	];
	eqConstraintsStore.activeId = 'tight';
}

describe('EqHistoryAndCompare', () => {
	let applySnapshot: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		reset();
		eqStore.filters = [];
		eqStore.preamp = 0;
		applySnapshot = vi.spyOn(eqCommands, 'applySnapshot').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		reset();
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

	it('Clear leaves the bookmarks alone', async () => {
		eqHistoryStore.snapshots = [makeSnapshot()];
		eqBookmarkStore.items = [makeBookmark()];
		render(EqHistoryAndCompare);

		await button(m.eq_history_clear()).click();

		expect(eqBookmarkStore.items).toHaveLength(1);
	});

	// ── History row actions ──────────────────────────────────────────────────

	describe('history row', () => {
		it('deletes one entry from its menu', async () => {
			eqHistoryStore.snapshots = [
				makeSnapshot({ id: 'keep', summary: 'keep me' }),
				makeSnapshot({ id: 'drop', summary: 'drop me' })
			];
			render(EqHistoryAndCompare);

			await button(m.eq_history_menu_title({ name: 'drop me' })).click();
			await menuItem(m.eq_history_menu_delete()).click();

			expect(eqHistoryStore.snapshots.map((s) => s.id)).toEqual(['keep']);
		});

		it('bookmarks the entry from the star, named after its bands and date', async () => {
			const snap = makeSnapshot({ filters: [makeFilter({ freq: 3200, gain: -4 })] });
			eqHistoryStore.snapshots = [snap];
			render(EqHistoryAndCompare);

			await button(m.eq_history_bookmark_add()).click();

			expect(eqBookmarkStore.items).toHaveLength(1);
			const [bookmark] = eqBookmarkStore.items;
			expect(bookmark.name).toMatch(/^PK 3\.2k Hz -4\.0 dB · /);
			expect(bookmark.filters).toEqual(snap.filters);
			expect(bookmark.preamp).toBe(snap.preamp);
		});

		it('shows an already-bookmarked entry as such, and a click adds nothing', async () => {
			const snap = makeSnapshot();
			eqHistoryStore.snapshots = [snap];
			eqBookmarkStore.items = [makeBookmark({ filters: snap.filters, preamp: snap.preamp })];
			render(EqHistoryAndCompare);

			const star = button(m.eq_history_bookmark_exists());
			await expect.element(star).toHaveAttribute('aria-disabled', 'true');
			// Playwright treats aria-disabled as disabled; the handler must still no-op.
			await star.click({ force: true });

			expect(eqBookmarkStore.items).toHaveLength(1);
		});

		it('tells the user when the bookmark cap is reached, without evicting', async () => {
			const warning = vi.spyOn(toast, 'warning');
			eqBookmarkStore.items = Array.from({ length: BOOKMARK_CAP }, (_, i) =>
				makeBookmark({ id: `bm-${i}`, preamp: i })
			);
			eqHistoryStore.snapshots = [makeSnapshot()];
			render(EqHistoryAndCompare);

			await button(m.eq_history_bookmark_add()).click();

			expect(eqBookmarkStore.items).toHaveLength(BOOKMARK_CAP);
			expect(warning).toHaveBeenCalledWith(m.eq_history_bookmark_full({ count: BOOKMARK_CAP }));
		});
	});

	// ── Bookmarks tab ────────────────────────────────────────────────────────

	describe('bookmarks tab', () => {
		async function openBookmarks() {
			await page
				.getByRole('tab', {
					name: m.eq_history_tab_bookmarks({ count: eqBookmarkStore.items.length })
				})
				.click();
		}

		it('counts the bookmarks in the tab label and lists them with their device', async () => {
			eqBookmarkStore.items = [makeBookmark()];
			render(EqHistoryAndCompare);
			await openBookmarks();

			await expect.element(page.getByText('Bass-light v2')).toBeInTheDocument();
			await expect.element(page.getByText(/^Sennheiser HD 600 · /)).toBeInTheDocument();
		});

		it('shows the empty placeholder with no bookmarks', async () => {
			render(EqHistoryAndCompare);
			await openBookmarks();

			await expect.element(page.getByText(m.eq_history_bookmarks_empty())).toBeInTheDocument();
		});

		async function startRename(name: string) {
			await button(m.eq_history_menu_title({ name })).click();
			await menuItem(m.eq_history_menu_rename()).click();
			const field = page.getByRole('textbox', { name: m.eq_history_rename_label() });
			await expect.element(field).toHaveFocus();
			return field;
		}

		it('renames inline: Enter saves and focus returns to the menu button', async () => {
			eqBookmarkStore.items = [makeBookmark()];
			render(EqHistoryAndCompare);
			await openBookmarks();

			const field = await startRename('Bass-light v2');
			await field.fill('Treble tame');
			await userEvent.keyboard('{Enter}');

			expect(eqBookmarkStore.items[0].name).toBe('Treble tame');
			await expect.element(button(m.eq_history_menu_title({ name: 'Treble tame' }))).toHaveFocus();
		});

		it('renames inline: Escape restores the previous name', async () => {
			eqBookmarkStore.items = [makeBookmark()];
			render(EqHistoryAndCompare);
			await openBookmarks();

			const field = await startRename('Bass-light v2');
			await field.fill('scratch that');
			await userEvent.keyboard('{Escape}');

			expect(eqBookmarkStore.items[0].name).toBe('Bass-light v2');
			await expect.element(page.getByText('Bass-light v2')).toBeInTheDocument();
		});

		it('deletes a bookmark from its menu', async () => {
			eqBookmarkStore.items = [makeBookmark()];
			render(EqHistoryAndCompare);
			await openBookmarks();

			await button(m.eq_history_menu_title({ name: 'Bass-light v2' })).click();
			await menuItem(m.eq_history_menu_delete()).click();

			expect(eqBookmarkStore.items).toEqual([]);
		});

		it('lets A be a bookmark and B a history entry', async () => {
			const bookmark = makeBookmark();
			eqBookmarkStore.items = [bookmark];
			eqHistoryStore.snapshots = [makeSnapshot({ id: 'h-1' })];
			render(EqHistoryAndCompare);

			await button(m.eq_history_set_b()).click();
			await openBookmarks();
			await button(m.eq_history_set_a()).click();
			await button(m.eq_history_apply_a_title()).click();

			expect(eqHistoryStore.aSnapshotId).toBe(bookmark.id);
			expect(eqHistoryStore.bSnapshotId).toBe('h-1');
			expect(applySnapshot).toHaveBeenCalledWith(bookmark.filters, bookmark.preamp);
		});
	});

	// ── Constraint fit ───────────────────────────────────────────────────────

	describe('constraint fit', () => {
		const loud = () => makeSnapshot({ id: 'loud', filters: [makeFilter({ gain: 9 })] });
		const notFit = () => m.eq_history_not_fit({ constraint: 'Tight' });

		it('marks a history entry that breaks the constraint and blocks picking it', async () => {
			activateTight();
			eqHistoryStore.snapshots = [loud()];
			render(EqHistoryAndCompare);

			await expect.element(page.getByText(notFit())).toBeInTheDocument();
			const setA = button(m.eq_history_set_a());
			await expect.element(setA).toHaveAttribute('aria-disabled', 'true');
			await expect.element(setA).toHaveAccessibleDescription(notFit());
			await setA.click({ force: true });

			expect(eqHistoryStore.aSnapshotId).toBeNull();
		});

		it('counts the band cap per output', async () => {
			activateTight();
			const three = [makeFilter(), makeFilter({ freq: 2000 }), makeFilter({ freq: 4000 })];
			eqBookmarkStore.items = [makeBookmark({ filters: three })];
			render(EqHistoryAndCompare);
			await page.getByRole('tab', { name: m.eq_history_tab_bookmarks({ count: 1 }) }).click();

			await expect.element(page.getByText(notFit())).toBeInTheDocument();
		});

		it('leaves fitting entries alone', async () => {
			activateTight();
			eqHistoryStore.snapshots = [makeSnapshot()];
			render(EqHistoryAndCompare);

			await expect.element(button(m.eq_history_set_a())).not.toHaveAttribute('aria-disabled');
			expect(page.getByText(notFit()).elements()).toHaveLength(0);
		});

		it('blocks applying a pick once a constraint change makes it not fit', async () => {
			eqHistoryStore.snapshots = [loud()];
			eqHistoryStore.setA('loud');
			render(EqHistoryAndCompare);
			await expect.element(button(m.eq_history_apply_a_title())).toBeEnabled();

			activateTight();
			const apply = button(m.eq_history_apply_blocked({ side: 'A', constraint: 'Tight' }));
			await expect.element(apply).toHaveAttribute('aria-disabled', 'true');
			await apply.click({ force: true });

			expect(applySnapshot).not.toHaveBeenCalled();
			// The pick itself survives and can still be unset.
			await button(m.eq_history_unset_a()).click();
			expect(eqHistoryStore.aSnapshotId).toBeNull();
		});
	});

	// ── Comparison options ───────────────────────────────────────────────────

	describe('comparison options', () => {
		afterEach(() => {
			eqHistoryStore.matchLoudness = true;
			eqHistoryStore.showOnGraph = true;
		});

		it('shows Match loudness only once A and B are both picked', async () => {
			eqHistoryStore.snapshots = [makeSnapshot({ id: 'a' }), makeSnapshot({ id: 'b' })];
			eqHistoryStore.setA('a');
			render(EqHistoryAndCompare);
			const toggle = page.getByRole('switch', { name: m.eq_history_match_loudness() });

			await expect.element(toggle).not.toBeInTheDocument();
			eqHistoryStore.setB('b');
			await expect.element(toggle).toBeInTheDocument();
		});

		it('defaults to on and writes the store, where the audio player reads it', async () => {
			eqHistoryStore.snapshots = [makeSnapshot({ id: 'a' }), makeSnapshot({ id: 'b' })];
			eqHistoryStore.setA('a');
			eqHistoryStore.setB('b');
			render(EqHistoryAndCompare);
			const toggle = page.getByRole('switch', { name: m.eq_history_match_loudness() });

			await expect.element(toggle).toBeChecked();
			await toggle.click();
			expect(eqHistoryStore.matchLoudness).toBe(false);
		});

		it('Show on graph defaults to on and writes the store, where the graph reads it', async () => {
			eqHistoryStore.snapshots = [makeSnapshot({ id: 'a' }), makeSnapshot({ id: 'b' })];
			eqHistoryStore.setA('a');
			eqHistoryStore.setB('b');
			render(EqHistoryAndCompare);
			const toggle = page.getByRole('switch', { name: m.eq_history_show_on_graph() });

			await expect.element(toggle).toBeChecked();
			await toggle.click();
			expect(eqHistoryStore.showOnGraph).toBe(false);
		});
	});

	// ── Add to graph ─────────────────────────────────────────────────────────

	describe('add to graph', () => {
		afterEach(() => {
			eqStore.sourcePhoneUUID = null;
		});

		it('inserts a history entry as a curve, named by its summary', async () => {
			const insert = vi.spyOn(dataProvider, 'insertEqCurve').mockReturnValue(true);
			eqStore.sourcePhoneUUID = 'src';
			const snap = makeSnapshot();
			eqHistoryStore.snapshots = [snap];
			render(EqHistoryAndCompare);

			await button(m.eq_history_menu_title({ name: snap.summary })).click();
			await menuItem(m.eq_history_menu_add_to_graph()).click();

			expect(insert).toHaveBeenCalledWith(snap.filters, snap.summary);
		});

		it('inserts a bookmark under its name', async () => {
			const insert = vi.spyOn(dataProvider, 'insertEqCurve').mockReturnValue(true);
			eqStore.sourcePhoneUUID = 'src';
			const bookmark = makeBookmark();
			eqBookmarkStore.items = [bookmark];
			render(EqHistoryAndCompare);
			await page.getByRole('tab', { name: m.eq_history_tab_bookmarks({ count: 1 }) }).click();

			await button(m.eq_history_menu_title({ name: bookmark.name })).click();
			await menuItem(m.eq_history_menu_add_to_graph()).click();

			expect(insert).toHaveBeenCalledWith(bookmark.filters, bookmark.name);
		});

		it('is unavailable with no EQ source to build the curve on', async () => {
			eqHistoryStore.snapshots = [makeSnapshot()];
			render(EqHistoryAndCompare);

			await button(m.eq_history_menu_title({ name: makeSnapshot().summary })).click();
			await expect
				.element(menuItem(m.eq_history_menu_add_to_graph()))
				.toHaveAttribute('aria-disabled', 'true');
		});
	});

	// ── Help popover ─────────────────────────────────────────────────────────

	it('explains the A/B workflow from the info popover', async () => {
		render(EqHistoryAndCompare);
		await button(m.info_popover_about({ topic: m.eq_history_accordion_title() })).click();

		await expect.element(page.getByText(m.eq_history_help_text())).toBeInTheDocument();
	});
});
