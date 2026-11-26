/**
 * `EqFilterCard` is one row of the filter stack. It is presentational — every
 * edit leaves through the `onUpdate` / `onRemove` / `onToggle` callbacks — but
 * the number inputs carry real behaviour worth pinning:
 *
 *  - values are clamped twice, once to the widest sane range and again onto the
 *    band's slot in the active constraint, so the box shows what reaches the store;
 *  - arrow keys commit immediately (the inputs are one-way bound), which is why
 *    Escape needs a focus snapshot to revert to;
 *  - graphic mode locks frequency, Q and type, leaving gain the only edit, so the
 *    row carries its gain slider instead of hiding it behind the chevron.
 *
 * Callbacks are plain spies here — the command layer is `eq-commands.spec.ts`.
 * The filter is also put in `eqStore` at its index: violations and slots come
 * from the constraint store's reading of the live list, as they do in the app.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import EqFilterCard from './EqFilterCard.svelte';
import {
	eqConstraintsStore,
	BUILTIN_PRESETS,
	DEFAULT_CONSTRAINT_ID
} from '#lib/stores/eq-constraints-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { linkStore } from '#lib/stores/link-store.svelte.js';
import type { EQFilter } from '#lib/utils/equalizer.js';
import { parametricPreset } from '#lib/utils/__fixtures__/eq-profiles.js';

const GRAPHIC_ID = 'generic-10-band';

/** A preset far tighter than the widest ranges, to prove the second clamp runs. */
const TIGHT = parametricPreset('tight', {
	label: 'Tight',
	maxBands: 2,
	freq: { min: 100, max: 10000 },
	gain: { min: -6, max: 6 },
	q: { min: 0.5, max: 4 }
});

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
	const index = opts.index ?? 0;
	eqStore.filters = Array.from({ length: index + 1 }, (_, i) =>
		i === index ? filter : pk({ freq: 100 * (i + 1) })
	);
	return render(EqFilterCard, {
		filter,
		index,
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
		eqStore.filters = [];
		vi.restoreAllMocks();
	});

	// ── Collapsed row ────────────────────────────────────────────────────────

	describe('the collapsed row', () => {
		it('shows the filter values', async () => {
			await mount(pk({ freq: 440, gain: -2.5, q: 2 }));

			expect(freqBox().value).toBe('440');
			expect(gainBox().value).toBe('-2.5');
			expect(qBox().value).toBe('2');
		});

		it('labels the type with its short badge', async () => {
			await mount(pk({ type: 'LSQ' }));

			await expect
				.element(page.getByRole('button', { name: 'LS', exact: true }))
				.toHaveAccessibleDescription('Change filter type');
		});

		it('cycles the type on badge click', async () => {
			await mount(pk({ type: 'PK' }));

			await page.getByRole('button', { name: 'PK', exact: true }).click();

			expect(handlers.onUpdate).toHaveBeenCalledWith({ type: 'LSQ' });
		});

		it('wraps the type cycle back to PK', async () => {
			await mount(pk({ type: 'HSQ' }));

			await page.getByRole('button', { name: 'HS', exact: true }).click();

			expect(handlers.onUpdate).toHaveBeenCalledWith({ type: 'PK' });
		});

		it('reports the enable switch', async () => {
			await mount(pk({ enabled: true }));

			await page.getByRole('switch').click();

			expect(handlers.onUpdate).toHaveBeenCalledWith({ enabled: false });
		});

		it('reports expansion and removal', async () => {
			await mount(pk(), { index: 2 });

			await page.getByRole('button', { name: 'Expand filter 3 options' }).click();
			await page.getByRole('button', { name: 'Remove filter 3' }).click();

			expect(handlers.onToggle).toHaveBeenCalledOnce();
			expect(handlers.onRemove).toHaveBeenCalledOnce();
		});
	});

	// ── Number input clamping ────────────────────────────────────────────────

	describe('number entry', () => {
		it('commits an edited frequency', async () => {
			await mount();

			await commit(freqBox(), '440');

			expect(handlers.onUpdate).toHaveBeenCalledWith({ freq: 440 });
		});

		it('clamps frequency to the audible band', async () => {
			await mount();

			await commit(freqBox(), '99999');

			expect(handlers.onUpdate).toHaveBeenCalledWith({ freq: 20000 });
		});

		it('rounds gain to a tenth of a dB', async () => {
			await mount();

			await commit(gainBox(), '2.46');

			expect(handlers.onUpdate).toHaveBeenCalledWith({ gain: 2.5 });
		});

		it('rounds Q to two decimals', async () => {
			await mount();

			await commit(qBox(), '1.239');

			expect(handlers.onUpdate).toHaveBeenCalledWith({ q: 1.24 });
		});

		it('restores the previous value when the entry is not a number', async () => {
			await mount(pk({ freq: 1000 }));

			await commit(freqBox(), '');

			expect(handlers.onUpdate).not.toHaveBeenCalled();
			expect(freqBox().value).toBe('1000');
		});

		it('clamps to the active preset, not just the widest range', async () => {
			// The box has to show what lands in the store — `eqCommands.updateBand`
			// clamps again on the way in, so a laxer box would snap back visibly.
			eqConstraintsStore.activeId = TIGHT.id;
			await mount();

			await commit(gainBox(), '15');

			expect(handlers.onUpdate).toHaveBeenCalledWith({ gain: 6 });
		});

		it('writes the clamped value back into the box', async () => {
			eqConstraintsStore.activeId = TIGHT.id;
			await mount();

			await commit(freqBox(), '30');

			expect(freqBox().value).toBe('100');
		});
	});

	// ── Keyboard ─────────────────────────────────────────────────────────────

	describe('keyboard editing', () => {
		it('steps frequency by 1 Hz on ArrowUp', async () => {
			await mount(pk({ freq: 1000 }));

			key(freqBox(), { key: 'ArrowUp' });

			expect(handlers.onUpdate).toHaveBeenCalledWith({ freq: 1001 });
		});

		it('steps by ten times as much with Shift', async () => {
			await mount(pk({ freq: 1000 }));

			key(freqBox(), { key: 'ArrowUp', shiftKey: true });

			expect(handlers.onUpdate).toHaveBeenCalledWith({ freq: 1010 });
		});

		it('steps gain by a tenth of a dB', async () => {
			await mount(pk({ gain: 3 }));

			key(gainBox(), { key: 'ArrowDown' });

			expect(handlers.onUpdate).toHaveBeenCalledWith({ gain: 2.9 });
		});

		it('steps Q by a hundredth', async () => {
			await mount(pk({ q: 1 }));

			key(qBox(), { key: 'ArrowUp' });

			expect(handlers.onUpdate).toHaveBeenCalledWith({ q: 1.01 });
		});

		it('clamps a stepped value to the active preset', async () => {
			eqConstraintsStore.activeId = TIGHT.id;
			await mount(pk({ gain: 6 }));

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
			await mount(pk({ freq: 1000 }));
			freqBox().focus();
			await page.elementLocator(freqBox()).fill('7777');

			key(freqBox(), { key: 'Escape' });

			expect(freqBox().value).toBe('1000');
			expect(handlers.onUpdate).not.toHaveBeenCalled();
		});

		it('blurs the field on Enter', async () => {
			await mount();
			freqBox().focus();

			key(freqBox(), { key: 'Enter' });

			expect(document.activeElement).not.toBe(freqBox());
		});
	});

	// ── Constraint feedback ──────────────────────────────────────────────────

	describe('constraint feedback', () => {
		it('flags an out-of-range field', async () => {
			eqConstraintsStore.activeId = TIGHT.id;
			await mount(pk({ gain: 20 }));

			await expect
				.element(page.elementLocator(gainBox()))
				.toHaveAttribute('title', "Tight doesn't accept this value. Allowed: -6 – 6 dB");
		});

		it('leaves an in-range field unflagged, but says what is allowed', async () => {
			eqConstraintsStore.activeId = TIGHT.id;
			await mount(pk({ gain: 3 }));

			expect(gainBox().getAttribute('title')).toBe('Allowed: -6 – 6 dB');
			expect(gainBox().hasAttribute('aria-invalid')).toBe(false);
			expect(gainBox().hasAttribute('aria-describedby')).toBe(false);
		});

		it('tells a screen reader which field is out of range, and why', async () => {
			eqConstraintsStore.activeId = TIGHT.id;
			await mount(pk({ gain: 20 }));

			const gain = page.getByRole('spinbutton', { name: 'Band 1 gain, dB' });
			await expect.element(gain).toHaveAttribute('aria-invalid', 'true');
			await expect
				.element(gain)
				.toHaveAccessibleDescription("Tight doesn't accept this value. Allowed: -6 – 6 dB");
			expect(freqBox().hasAttribute('aria-invalid')).toBe(false);
		});

		it('describes a stepped domain with its step', async () => {
			eqConstraintsStore.presets = [
				parametricPreset('stepped', { gain: { min: -12, max: 12, step: 0.5 } })
			];
			eqConstraintsStore.activeId = 'stepped';
			await mount(pk({ gain: 3 }));

			expect(gainBox().getAttribute('title')).toBe('Allowed: -12 – 12 dB, step 0.5');
			expect(gainBox().step).toBe('0.5');
		});

		it('steps along a value list one listed value at a time', async () => {
			eqConstraintsStore.presets = [
				parametricPreset('set', { freq: { values: [100, 250, 1000, 4000] } })
			];
			eqConstraintsStore.activeId = 'set';
			await mount(pk({ freq: 1000 }));

			key(freqBox(), { key: 'ArrowUp' });
			expect(handlers.onUpdate).toHaveBeenLastCalledWith({ freq: 4000 });
			key(freqBox(), { key: 'ArrowDown' });
			expect(handlers.onUpdate).toHaveBeenLastCalledWith({ freq: 250 });
		});

		it('offers only the filter types the slot takes', async () => {
			eqConstraintsStore.presets = [parametricPreset('pk-only', { types: ['PK'] })];
			eqConstraintsStore.activeId = 'pk-only';
			await mount(pk(), { expanded: true });

			expect(page.getByRole('radio', { name: 'High Shelf' }).elements()).toHaveLength(0);
			const badge = page.getByRole('button', { name: 'PK', exact: true });
			await expect.element(badge).toBeDisabled();
			await expect.element(badge).toHaveAccessibleDescription('Fixed by pk-only');
		});

		it('greys a row past the preset maxBands cap', async () => {
			// The two-band preset makes index 2 unreachable; the row stays rendered
			// so the user can delete it, but reads as inactive.
			eqConstraintsStore.activeId = TIGHT.id;
			await mount(pk(), { index: 2 });

			await expect.element(page.getByTitle(/Past the 2-band limit of Tight/)).toBeInTheDocument();
		});

		it('leaves rows inside the cap active', async () => {
			eqConstraintsStore.activeId = TIGHT.id;
			await mount(pk(), { index: 1 });

			expect(page.getByTitle(/Past the/).elements()).toHaveLength(0);
		});
	});

	// ── Graphic mode ─────────────────────────────────────────────────────────

	describe('in graphic mode', () => {
		beforeEach(() => {
			eqConstraintsStore.activeId = GRAPHIC_ID;
		});

		it('locks frequency and Q behind read-only chips', async () => {
			await mount(pk({ freq: 125, q: 1.4 }));

			// Gain is the only number box left.
			expect(rowInputs()).toHaveLength(1);
		});

		it('shows the fixed frequency, and gives the fixed type and Q no room', async () => {
			await mount(pk({ freq: 125, q: 1.4 }));

			const fixed = page.getByTitle('Fixed by Generic 10-band Graphic EQ');
			await expect.element(fixed).toHaveTextContent('125');
			expect(page.getByRole('button', { name: 'PK' }).elements()).toHaveLength(0);
		});

		it('puts the gain slider in the row, with no chevron to open', async () => {
			await mount(pk({ freq: 125, gain: 0 }));

			const slider = page.getByRole('slider', { name: '125 Hz · Gain (dB)' });
			await expect.element(slider).toBeInTheDocument();
			expect(page.getByRole('button', { name: 'Expand filter 1 options' }).elements()).toHaveLength(
				0
			);

			(slider.element() as HTMLInputElement).value = '35';
			slider.element().dispatchEvent(new Event('input', { bubbles: true }));
			expect(handlers.onUpdate).toHaveBeenLastCalledWith({ gain: 3.5 });
		});

		it('hides the remove button, because bands are preset slots', async () => {
			await mount(pk(), { index: 0 });

			expect(page.getByRole('button', { name: 'Remove filter 1' }).elements()).toHaveLength(0);
		});

		it('still allows gain edits', async () => {
			await mount(pk({ gain: 0 }));

			await commit(rowInputs()[0], '4');

			expect(handlers.onUpdate).toHaveBeenCalledWith({ gain: 4 });
		});
	});

	// ── Expanded panel ───────────────────────────────────────────────────────

	describe('when expanded', () => {
		it('adds the sliders and the type selector', async () => {
			await mount(pk(), { expanded: true });

			expect(document.querySelectorAll('input[type="range"]')).toHaveLength(3);
		});

		it('sets the type from the segmented control', async () => {
			await mount(pk({ type: 'PK' }), { expanded: true });

			await page.getByRole('radio', { name: 'High Shelf' }).click();

			expect(handlers.onUpdate).toHaveBeenCalledWith({ type: 'HSQ' });
		});

		it('says which type is selected, not just colours it', async () => {
			await mount(pk({ type: 'LSQ' }), { index: 1, expanded: true });

			const group = page.getByRole('group', { name: 'Band 2 filter type' });
			await expect.element(group).toBeInTheDocument();
			await expect
				.element(page.getByRole('radio', { name: 'Low Shelf' }))
				.toHaveAttribute('aria-checked', 'true');
			await expect
				.element(page.getByRole('radio', { name: 'Peak' }))
				.toHaveAttribute('aria-checked', 'false');
		});

		it('sets the channel from the segmented control, and maps L+R back to the shared bucket', async () => {
			await mount(pk({ channel: 'L' }), { expanded: true });

			await expect
				.element(page.getByRole('radio', { name: 'L', exact: true }))
				.toHaveAttribute('aria-checked', 'true');
			await page.getByRole('radio', { name: 'R', exact: true }).click();
			expect(handlers.onUpdate).toHaveBeenLastCalledWith({ channel: 'R' });

			await page.getByRole('radio', { name: 'L+R' }).click();
			expect(handlers.onUpdate).toHaveBeenLastCalledWith({ channel: undefined });
		});

		it('exposes the expanded state on the chevron', async () => {
			await mount(pk(), { index: 2, expanded: true });

			const chevron = page.getByRole('button', { name: 'Expand filter 3 options' });
			await expect.element(chevron).toHaveAttribute('aria-expanded', 'true');
			const panelId = chevron.element().getAttribute('aria-controls');
			expect(panelId).toBeTruthy();
			expect(document.getElementById(panelId!)).not.toBeNull();
		});

		it('marks the chevron collapsed while closed', async () => {
			await mount(pk());

			const chevron = page.getByRole('button', { name: 'Expand filter 1 options' });
			await expect.element(chevron).toHaveAttribute('aria-expanded', 'false');
			expect(chevron.element().hasAttribute('aria-controls')).toBe(false);
		});

		it('names every field and slider after its band', async () => {
			await mount(pk(), { index: 2, expanded: true });

			await expect.element(page.getByRole('switch', { name: 'Enable band 3' })).toBeInTheDocument();
			expect(
				page.getByRole('spinbutton', { name: 'Band 3 frequency, Hz' }).elements()
			).toHaveLength(2);
			expect(page.getByRole('slider', { name: 'Band 3 frequency, Hz' }).elements()).toHaveLength(1);
			expect(page.getByRole('slider', { name: 'Band 3 gain, dB' }).elements()).toHaveLength(1);
			expect(page.getByRole('slider', { name: 'Band 3 Q' }).elements()).toHaveLength(1);
		});

		it('reads the real value and unit off the sliders', async () => {
			await mount(pk({ freq: 440, gain: -2.5, q: 1.4 }), { expanded: true });

			await expect
				.element(page.getByRole('slider', { name: 'Band 1 frequency, Hz' }))
				.toHaveAttribute('aria-valuetext', '440 Hz');
			await expect
				.element(page.getByRole('slider', { name: 'Band 1 gain, dB' }))
				.toHaveAttribute('aria-valuetext', '-2.5 dB');
			await expect
				.element(page.getByRole('slider', { name: 'Band 1 Q' }))
				.toHaveAttribute('aria-valuetext', '1.4');
		});

		it('reads the real gain off the graphic-mode row slider', async () => {
			eqConstraintsStore.activeId = GRAPHIC_ID;
			await mount(pk({ freq: 125, gain: 3.5 }));

			await expect
				.element(page.getByRole('slider', { name: '125 Hz · Gain (dB)' }))
				.toHaveAttribute('aria-valuetext', '3.5 dB');
		});

		it('keeps only the row slider in graphic mode', async () => {
			eqConstraintsStore.activeId = GRAPHIC_ID;
			await mount(pk(), { expanded: true });

			expect(document.querySelectorAll('input[type="range"]')).toHaveLength(1);
		});
	});

	describe('a device’s binary values', () => {
		// A Qudelix stores Q on a 1/1024 grid and many devices gain on a 1/256 dB one.
		const device = pk({ gain: -1.50390625, q: 0.70703125 });
		const boxes = (name: string) =>
			page
				.getByRole('spinbutton', { name })
				.elements()
				.map((el) => (el as HTMLInputElement).value);

		it('shows gain to two decimals and Q to three, in every box and slider', async () => {
			await mount(device, { expanded: true });

			expect(boxes('Band 1 gain, dB')).toEqual(['-1.5', '-1.5']);
			expect(boxes('Band 1 Q')).toEqual(['0.707', '0.707']);
			await expect
				.element(page.getByRole('slider', { name: 'Band 1 gain, dB' }))
				.toHaveAttribute('aria-valuetext', '-1.5 dB');
			await expect
				.element(page.getByRole('slider', { name: 'Band 1 Q' }))
				.toHaveAttribute('aria-valuetext', '0.707');
		});

		it('keeps the digits a short value has', async () => {
			await mount(pk({ gain: 2.25, q: 0.707 }));

			expect(gainBox().value).toBe('2.25');
			expect(qBox().value).toBe('0.707');
		});

		it('shows a fixed Q to three decimals', async () => {
			eqConstraintsStore.presets = [parametricPreset('fixed-q', { q: { value: 1.4140625 } })];
			eqConstraintsStore.activeId = 'fixed-q';
			await mount(pk({ q: 1.4140625 }));

			await expect.element(page.getByTitle('Fixed by fixed-q')).toHaveTextContent('1.414');
		});

		it('writes nothing back when a box is entered and left untouched', async () => {
			await mount(device);

			qBox().focus();
			qBox().blur();
			key(gainBox(), { key: 'Enter' });

			expect(handlers.onUpdate).not.toHaveBeenCalled();
			expect(qBox().value).toBe('0.707');
			expect(gainBox().value).toBe('-1.5');
		});

		it('commits what the user types', async () => {
			await mount(device);

			await commit(qBox(), '1.5');

			expect(handlers.onUpdate).toHaveBeenCalledWith({ q: 1.5 });
			expect(qBox().value).toBe('1.5');
		});

		it('shows the value a device grid lands on, rounded', async () => {
			eqConstraintsStore.presets = [
				parametricPreset('grid', { q: { min: 0.1, max: 10, step: 1 / 1024 } })
			];
			eqConstraintsStore.activeId = 'grid';
			const { rerender } = await mount(pk({ q: 1 }));

			await commit(qBox(), '0.71');
			const landed = handlers.onUpdate.mock.lastCall?.[0].q ?? NaN;
			expect(Number.isInteger(landed * 1024)).toBe(true);
			expect(landed).not.toBe(0.71);
			expect(qBox().value).toBe('0.71');

			await rerender({ filter: pk({ q: landed }), index: 0, expanded: false, ...handlers });
			key(qBox(), { key: 'ArrowUp' });
			expect(qBox().value).toBe('0.72');
		});

		it('reverts to the exact value on Escape, and shows it rounded', async () => {
			const { rerender } = await mount(device);
			qBox().focus();
			key(qBox(), { key: 'ArrowUp' });
			await rerender({ filter: { ...device, q: 0.72 }, index: 0, expanded: false, ...handlers });

			key(qBox(), { key: 'Escape' });

			expect(handlers.onUpdate).toHaveBeenLastCalledWith({ q: 0.70703125 });
			expect(qBox().value).toBe('0.707');
		});
	});

	describe('linked with uniPEQ', () => {
		afterEach(() => {
			linkStore.reset();
			eqConstraintsStore.clearDeviceConstraint();
		});

		it('offers one-ear bands only while uniPEQ’s device drives its channels apart', async () => {
			linkStore.phase = 'linked';
			await mount(pk(), { expanded: true });
			const channel = page.getByRole('group', { name: 'Applied Channel' });
			expect(channel.elements()).toHaveLength(0);

			eqConstraintsStore.setDeviceConstraint(TIGHT.profile, 'Stereo DAC', true);
			await expect.element(channel).toBeInTheDocument();
		});
	});
});
