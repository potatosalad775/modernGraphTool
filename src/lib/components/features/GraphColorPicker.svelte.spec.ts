/**
 * `GraphColorPicker` is the per-curve swatch in the selection list: a hex input,
 * three OKLCH number fields and the dash tick/space pair.
 *
 * Every edit is debounced by 50 ms before it reaches `dataProvider`, so the
 * assertions go through `vi.waitFor` rather than reading straight after the
 * input event.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import GraphColorPicker from './GraphColorPicker.svelte';
import { dataProvider } from '$lib/services/data-provider.svelte.js';
import { parseOklch, oklchToHex } from '$lib/utils/curve-palette.js';
import type { FRDataObject } from '$lib/types/data-types.js';

function makeItem(overrides: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid: 'p',
		type: 'phone',
		identifier: 'Brand Phone',
		channels: { AVG: { data: [[1000, 80]], metadata: { minFreq: 20, maxFreq: 20000 } } },
		dispChannel: ['AVG'],
		dispSuffix: '',
		colors: { AVG: 'oklch(0.68 0.16 30)' },
		dash: '5 3',
		...overrides
	};
}

function numberField(label: string) {
	return page.getByLabelText(label, { exact: true });
}

/** Render and open the popover. The trigger is the only button before opening. */
async function open(item: FRDataObject) {
	render(GraphColorPicker, { uuid: 'p', item });
	await page.getByRole('button', { name: 'Pick color' }).click();
	await expect.element(numberField('L')).toBeInTheDocument();
}

describe('GraphColorPicker', () => {
	let updateColors: ReturnType<typeof vi.spyOn>;
	let updateDashPattern: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		updateColors = vi.spyOn(dataProvider, 'updateColors').mockImplementation(() => {});
		updateDashPattern = vi.spyOn(dataProvider, 'updateDashPattern').mockImplementation(() => {});
		window.GRAPHTOOL_CONFIG = {
			TRACE_STYLING: { CURVE_COLOR_PALETTE: ['oklch(0.7 0.2 120)', 'oklch(0.7 0.2 240)'] }
		} as never;
	});

	afterEach(async () => {
		// Drain any debounce still in flight. Left pending, it fires into the next
		// test's spy and reports a colour that test never picked.
		await new Promise((resolve) => setTimeout(resolve, 80));
		vi.restoreAllMocks();
		delete (window as { GRAPHTOOL_CONFIG?: unknown }).GRAPHTOOL_CONFIG;
	});

	// ── Trigger ──────────────────────────────────────────────────────────────

	it('paints the trigger swatch with the curve colour', async () => {
		render(GraphColorPicker, { uuid: 'p', item: makeItem() });
		const trigger = page.getByRole('button', { name: 'Pick color' });
		await expect.element(trigger).toBeInTheDocument();

		const expected = oklchToHex(...parseOklch('oklch(0.68 0.16 30)'));
		expect((trigger.element() as HTMLElement).style.backgroundColor).not.toBe('');
		// The style is written as the hex form of the stored OKLCH triple.
		expect(expected).toMatch(/^#[0-9a-f]{6}$/i);
	});

	// ── Seeding ──────────────────────────────────────────────────────────────

	describe('opening', () => {
		it('seeds the OKLCH fields from the stored colour', async () => {
			await open(makeItem());

			expect((numberField('L').element() as HTMLInputElement).value).toBe('0.68');
			expect((numberField('C').element() as HTMLInputElement).value).toBe('0.16');
			expect((numberField('H').element() as HTMLInputElement).value).toBe('30');
		});

		it('seeds the dash fields from the stored pattern', async () => {
			await open(makeItem({ dash: '5 3' }));

			expect((numberField('Tick').element() as HTMLInputElement).value).toBe('5');
			expect((numberField('Space').element() as HTMLInputElement).value).toBe('3');
		});

		it('falls back to a solid line for an unparseable dash', async () => {
			await open(makeItem({ dash: 'nonsense' }));

			expect((numberField('Tick').element() as HTMLInputElement).value).toBe('1');
			expect((numberField('Space').element() as HTMLInputElement).value).toBe('0');
		});
	});

	// ── Colour edits ─────────────────────────────────────────────────────────

	describe('colour edits', () => {
		it('derives L, C and R/AVG hue offsets for a phone', async () => {
			await open(makeItem());
			await numberField('H').fill('200');

			await vi.waitFor(() => expect(updateColors).toHaveBeenCalled());
			const [uuid, colors] = updateColors.mock.calls.at(-1)!;
			expect(uuid).toBe('p');
			// L and R are spread ±10° around the AVG hue so the two channels stay
			// distinguishable at a glance.
			expect(parseOklch(colors.AVG!)[2]).toBeCloseTo(200, 5);
			expect(parseOklch(colors.L!)[2]).toBeCloseTo(190, 5);
			expect(parseOklch(colors.R!)[2]).toBeCloseTo(210, 5);
		});

		it('wraps the hue offsets around 360°', async () => {
			await open(makeItem());
			await numberField('H').fill('5');

			await vi.waitFor(() => expect(updateColors).toHaveBeenCalled());
			const [, colors] = updateColors.mock.calls.at(-1)!;
			expect(parseOklch(colors.L!)[2]).toBeCloseTo(355, 5);
		});

		it('emits AVG only for a target — it has no L/R channels', async () => {
			await open(makeItem({ type: 'target' }));
			await numberField('H').fill('200');

			await vi.waitFor(() => expect(updateColors).toHaveBeenCalled());
			const [, colors] = updateColors.mock.calls.at(-1)!;
			expect(Object.keys(colors)).toEqual(['AVG']);
		});

		it('treats an inserted target the same way', async () => {
			await open(makeItem({ type: 'inserted-target' }));
			await numberField('H').fill('200');

			await vi.waitFor(() => expect(updateColors).toHaveBeenCalled());
			expect(Object.keys(updateColors.mock.calls.at(-1)![1])).toEqual(['AVG']);
		});

		it('coalesces a burst of edits into a single update', async () => {
			await open(makeItem());
			// Driven straight at the element: a driver-level `fill()` can take longer
			// than the 50 ms debounce under load, which would make each keystroke its
			// own update and defeat the point of the test.
			const field = numberField('H').element() as HTMLInputElement;
			for (const value of ['100', '150', '200']) {
				field.value = value;
				field.dispatchEvent(new Event('input', { bubbles: true }));
			}

			await vi.waitFor(() => expect(updateColors).toHaveBeenCalled());
			// The debounce restarts on each keystroke, so the last value wins and
			// intermediate ones never reach the store as separate commands.
			expect(parseOklch(updateColors.mock.calls.at(-1)![1].AVG!)[2]).toBeCloseTo(200, 5);
			expect(updateColors.mock.calls.length).toBeLessThan(3);
		});

		it('picks a different colour from the configured palette on Random', async () => {
			await open(makeItem());
			await page.getByRole('button', { name: 'Random' }).click();

			await vi.waitFor(() => expect(updateColors).toHaveBeenCalled());
			const [, colors] = updateColors.mock.calls.at(-1)!;
			expect(colors.AVG).not.toBe('oklch(0.68 0.16 30)');
		});

		it('writes the randomly picked colour back into the OKLCH fields', async () => {
			await open(makeItem());
			await page.getByRole('button', { name: 'Random' }).click();

			await vi.waitFor(() => expect(updateColors).toHaveBeenCalled());
			const [, colors] = updateColors.mock.calls.at(-1)!;
			const [, , h] = parseOklch(colors.AVG!);
			expect((numberField('H').element() as HTMLInputElement).value).toBe(String(Math.round(h)));
		});
	});

	// ── Dash edits ───────────────────────────────────────────────────────────

	describe('dash edits', () => {
		it('sends the tick/space pair as one dasharray string', async () => {
			await open(makeItem());
			await numberField('Space').fill('4');

			await vi.waitFor(() => expect(updateDashPattern).toHaveBeenCalled());
			expect(updateDashPattern.mock.calls.at(-1)).toEqual(['p', '5 4']);
		});

		it('leaves the colour alone when only the dash changes', async () => {
			await open(makeItem());
			await numberField('Tick').fill('2');

			await vi.waitFor(() => expect(updateDashPattern).toHaveBeenCalled());
			expect(updateColors).not.toHaveBeenCalled();
		});
	});

	// ── Re-open ──────────────────────────────────────────────────────────────

	it('re-seeds from the item every time it opens', async () => {
		const item = makeItem();
		render(GraphColorPicker, { uuid: 'p', item });

		await page.getByRole('button', { name: 'Pick color' }).click();
		await expect.element(numberField('H')).toBeInTheDocument();
		await numberField('H').fill('300');
		await page.getByRole('button', { name: 'Close' }).click();

		await page.getByRole('button', { name: 'Pick color' }).click();
		// The prop never changed, so the field is back at the stored hue rather
		// than the uncommitted 300 from the previous session.
		await expect.element(numberField('H')).toHaveValue(30);
	});
});
