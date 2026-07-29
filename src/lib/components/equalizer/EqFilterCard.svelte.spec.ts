/**
 * `EqFilterCard` is one row of the filter stack. It is presentational — every
 * edit leaves through the `onUpdate` / `onRemove` / `onToggle` callbacks — but
 * the number inputs carry real behaviour worth pinning:
 *
 *  - values are clamped twice, once to the widest sane range and again to the
 *    active constraint preset, so the box shows what actually reaches the store;
 *  - arrow keys commit immediately (the inputs are one-way bound), which is why
 *    Escape needs a focus snapshot to revert to;
 *  - graphic mode locks frequency, Q and type, leaving gain the only edit.
 *
 * Callbacks are plain spies here — the command layer is `eq-commands.spec.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import EqFilterCard from './EqFilterCard.svelte';
import {
	eqConstraintsStore,
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID
} from '$lib/stores/eq-constraints-store.svelte.js';
import type { EQFilter } from '$lib/utils/equalizer.js';
import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';

const GRAPHIC_ID = 'generic-10-band';

/** A preset far tighter than the widest ranges, to prove the second clamp runs. */
const TIGHT: EqConstraintPreset = {
	id: 'tight',
	label: 'Tight',
	mode: 'parametric',
	maxBands: 2,
	allowPk: true,
	allowLsq: true,
	allowHsq: true,
	freqMin: 100,
	freqMax: 10000,
	gainMin: -6,
	gainMax: 6,
	qMin: 0.5,
	qMax: 4
};

function pk(over: Partial<EQFilter> = {}): EQFilter {
	return { type: 'PK', freq: 1000, gain: 3, q: 1, enabled: true, ...over } as EQFilter;
}

interface Handlers {
	onUpdate: Mock<(partial: Partial<EQFilter>) => void>;
	onRemove: Mock<() => void>;
	onToggle: Mock<() => void>;
}

let handlers: Handlers;

function mount(filter: EQFilter = pk(), opts: { index?: number; expanded?: boolean } = {}) {
	return render(EqFilterCard, {
		filter,
		index: opts.index ?? 0,
		expanded: opts.expanded ?? false,
		...handlers
	});
}

/** Collapsed-row number boxes, in document order: freq, gain, Q. */
function rowInputs(): HTMLInputElement[] {
	return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="number"]'));
}

const freqBox = () => rowInputs()[0];
const gainBox = () => rowInputs()[1];
const qBox = () => rowInputs()[2];

/** `onchange` fires on blur, the way leaving the field would. */
async function commit(input: HTMLInputElement, value: string) {
	await page.elementLocator(input).fill(value);
	input.blur();
}

function key(input: HTMLInputElement, init: KeyboardEventInit) {
	input.focus();
	input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

describe('EqFilterCard', () => {
	beforeEach(() => {
		eqConstraintsStore.presets = [...BUILTIN_PRESETS, TIGHT];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		handlers = {
			onUpdate: vi.fn<(partial: Partial<EQFilter>) => void>(),
			onRemove: vi.fn<() => void>(),
			onToggle: vi.fn<() => void>()
		};
	});

	afterEach(() => {
		eqConstraintsStore.presets = [...BUILTIN_PRESETS];
		eqConstraintsStore.activeId = DEFAULT_CONSTRAINT_ID;
		vi.restoreAllMocks();
	});

	// ── Collapsed row ────────────────────────────────────────────────────────

	describe('the collapsed row', () => {
		it('shows the filter values', () => {
			mount(pk({ freq: 440, gain: -2.5, q: 2 }));

			expect(freqBox().value).toBe('440');
			expect(gainBox().value).toBe('-2.5');
			expect(qBox().value).toBe('2');
		});

		it('labels the type with its short badge', async () => {
			mount(pk({ type: 'LSQ' }));

			await expect
				.element(page.getByRole('button', { name: 'Change filter type' }))
				.toHaveTextContent('LS');
		});

		it('cycles the type on badge click', async () => {
			mount(pk({ type: 'PK' }));

			await page.getByRole('button', { name: 'Change filter type' }).click();

			expect(handlers.onUpdate).toHaveBeenCalledWith({ type: 'LSQ' });
		});

		it('wraps the type cycle back to PK', async () => {
			mount(pk({ type: 'HSQ' }));

			await page.getByRole('button', { name: 'Change filter type' }).click();

			expect(handlers.onUpdate).toHaveBeenCalledWith({ type: 'PK' });
		});

		it('reports the enable switch', async () => {
			mount(pk({ enabled: true }));

			await page.getByRole('switch').click();

			expect(handlers.onUpdate).toHaveBeenCalledWith({ enabled: false });
		});

		it('reports expansion and removal', async () => {
			mount(pk(), { index: 2 });

			await page.getByRole('button', { name: 'Expand filter 3 options' }).click();
			await page.getByRole('button', { name: 'Remove filter 3' }).click();

			expect(handlers.onToggle).toHaveBeenCalledOnce();
			expect(handlers.onRemove).toHaveBeenCalledOnce();
		});
	});

	// ── Number input clamping ────────────────────────────────────────────────

	describe('number entry', () => {
		it('commits an edited frequency', async () => {
			mount();

			await commit(freqBox(), '440');

			expect(handlers.onUpdate).toHaveBeenCalledWith({ freq: 440 });
		});

		it('clamps frequency to the audible band', async () => {
			mount();

			await commit(freqBox(), '99999');

			expect(handlers.onUpdate).toHaveBeenCalledWith({ freq: 20000 });
		});

		it('rounds gain to a tenth of a dB', async () => {
			mount();

			await commit(gainBox(), '2.46');

			expect(handlers.onUpdate).toHaveBeenCalledWith({ gain: 2.5 });
		});

		it('rounds Q to two decimals', async () => {
			mount();

			await commit(qBox(), '1.239');

			expect(handlers.onUpdate).toHaveBeenCalledWith({ q: 1.24 });
		});

		it('restores the previous value when the entry is not a number', async () => {
			mount(pk({ freq: 1000 }));

			await commit(freqBox(), '');

			expect(handlers.onUpdate).not.toHaveBeenCalled();
			expect(freqBox().value).toBe('1000');
		});

		it('clamps to the active preset, not just the widest range', async () => {
			// The box has to show what lands in the store — `eqCommands.updateBand`
			// clamps again on the way in, so a laxer box would snap back visibly.
			eqConstraintsStore.activeId = TIGHT.id;
			mount();

			await commit(gainBox(), '15');

			expect(handlers.onUpdate).toHaveBeenCalledWith({ gain: TIGHT.gainMax });
		});

		it('writes the clamped value back into the box', async () => {
			eqConstraintsStore.activeId = TIGHT.id;
			mount();

			await commit(freqBox(), '30');

			expect(freqBox().value).toBe(String(TIGHT.freqMin));
		});
	});

	// ── Keyboard ─────────────────────────────────────────────────────────────

	describe('keyboard editing', () => {
		it('steps frequency by 1 Hz on ArrowUp', () => {
			mount(pk({ freq: 1000 }));

			key(freqBox(), { key: 'ArrowUp' });

			expect(handlers.onUpdate).toHaveBeenCalledWith({ freq: 1001 });
		});

		it('steps by ten times as much with Shift', () => {
			mount(pk({ freq: 1000 }));

			key(freqBox(), { key: 'ArrowUp', shiftKey: true });

			expect(handlers.onUpdate).toHaveBeenCalledWith({ freq: 1010 });
		});

		it('steps gain by a tenth of a dB', () => {
			mount(pk({ gain: 3 }));

			key(gainBox(), { key: 'ArrowDown' });

			expect(handlers.onUpdate).toHaveBeenCalledWith({ gain: 2.9 });
		});

		it('steps Q by a hundredth', () => {
			mount(pk({ q: 1 }));

			key(qBox(), { key: 'ArrowUp' });

			expect(handlers.onUpdate).toHaveBeenCalledWith({ q: 1.01 });
		});

		it('clamps a stepped value to the active preset', () => {
			eqConstraintsStore.activeId = TIGHT.id;
			mount(pk({ gain: 6 }));

			key(gainBox(), { key: 'ArrowUp' });

			expect(handlers.onUpdate).toHaveBeenCalledWith({ gain: 6 });
		});

		it('reverts an arrow-key edit on Escape', async () => {
			// Arrow keys commit as they go, so Escape has to push the focus-time value
			// back rather than merely stop editing. `render` is async, so `rerender`
			// only exists on the awaited result — the parent re-feeding the committed
			// filter is what makes the snapshot differ from the current value.
			const { rerender } = await mount(pk({ freq: 1000 }));
			freqBox().focus();
			key(freqBox(), { key: 'ArrowUp' });
			await rerender({ filter: pk({ freq: 1001 }), index: 0, expanded: false, ...handlers });

			key(freqBox(), { key: 'Escape' });

			expect(handlers.onUpdate).toHaveBeenLastCalledWith({ freq: 1000 });
		});

		it('discards uncommitted typing on Escape', async () => {
			mount(pk({ freq: 1000 }));
			freqBox().focus();
			await page.elementLocator(freqBox()).fill('7777');

			key(freqBox(), { key: 'Escape' });

			expect(freqBox().value).toBe('1000');
			expect(handlers.onUpdate).not.toHaveBeenCalled();
		});

		it('blurs the field on Enter', () => {
			mount();
			freqBox().focus();

			key(freqBox(), { key: 'Enter' });

			expect(document.activeElement).not.toBe(freqBox());
		});
	});

	// ── Constraint feedback ──────────────────────────────────────────────────

	describe('constraint feedback', () => {
		it('flags an out-of-range field', async () => {
			eqConstraintsStore.activeId = TIGHT.id;
			mount(pk({ gain: 20 }));

			await expect
				.element(page.elementLocator(gainBox()))
				.toHaveAttribute('title', 'Out of constraint preset range');
		});

		it('leaves an in-range field unflagged', () => {
			eqConstraintsStore.activeId = TIGHT.id;
			mount(pk({ gain: 3 }));

			expect(gainBox().getAttribute('title')).toBeNull();
		});

		it('greys a row past the preset maxBands cap', async () => {
			// The two-band preset makes index 2 unreachable; the row stays rendered
			// so the user can delete it, but reads as inactive.
			eqConstraintsStore.activeId = TIGHT.id;
			mount(pk(), { index: 2 });

			await expect.element(page.getByTitle(/maxBands cap/)).toBeInTheDocument();
		});

		it('leaves rows inside the cap active', () => {
			eqConstraintsStore.activeId = TIGHT.id;
			mount(pk(), { index: 1 });

			expect(page.getByTitle(/maxBands cap/).elements()).toHaveLength(0);
		});
	});

	// ── Graphic mode ─────────────────────────────────────────────────────────

	describe('in graphic mode', () => {
		beforeEach(() => {
			eqConstraintsStore.activeId = GRAPHIC_ID;
		});

		it('locks frequency and Q behind read-only chips', () => {
			mount(pk({ freq: 125, q: 1.4 }));

			// Gain is the only number box left.
			expect(rowInputs()).toHaveLength(1);
		});

		it('still shows the locked values', async () => {
			mount(pk({ freq: 125, q: 1.4 }));

			await expect
				.element(page.getByTitle('Frequency locked by graphic preset'))
				.toHaveTextContent('125');
			await expect.element(page.getByTitle('Q locked by graphic preset')).toHaveTextContent('1.4');
		});

		it('disables the type badge', async () => {
			mount();

			await expect
				.element(page.getByRole('button', { name: 'Filter type locked by graphic preset' }))
				.toBeDisabled();
		});

		it('hides the remove button, because bands are preset slots', () => {
			mount(pk(), { index: 0 });

			expect(page.getByRole('button', { name: 'Remove filter 1' }).elements()).toHaveLength(0);
		});

		it('still allows gain edits', async () => {
			mount(pk({ gain: 0 }));

			await commit(rowInputs()[0], '4');

			expect(handlers.onUpdate).toHaveBeenCalledWith({ gain: 4 });
		});
	});

	// ── Expanded panel ───────────────────────────────────────────────────────

	describe('when expanded', () => {
		it('adds the sliders and the type selector', () => {
			mount(pk(), { expanded: true });

			expect(document.querySelectorAll('input[type="range"]')).toHaveLength(3);
		});

		it('sets the type from the segmented buttons', async () => {
			mount(pk({ type: 'PK' }), { expanded: true });

			await page.getByRole('button', { name: 'High Shelf' }).click();

			expect(handlers.onUpdate).toHaveBeenCalledWith({ type: 'HSQ' });
		});

		it('drops the frequency and Q sliders in graphic mode', () => {
			eqConstraintsStore.activeId = GRAPHIC_ID;
			mount(pk(), { expanded: true });

			expect(document.querySelectorAll('input[type="range"]')).toHaveLength(1);
		});
	});
});
