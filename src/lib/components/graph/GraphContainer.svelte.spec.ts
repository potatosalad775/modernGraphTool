/**
 * Curve labels in `GraphContainer` are Svelte-rendered text, each backed by a
 * blurred rect sized from the text's measured width.
 *
 * Measurement is batched: one animation frame reads every label's bbox and only
 * then writes the widths. Writing label by label let Svelte resize a backdrop
 * between reads, so every subsequent `getBBox()` forced a fresh layout. Runs in
 * the `client` project because `getBBox()` needs real layout.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import GraphContainer from './GraphContainer.svelte';
import { frStore } from '#lib/stores/fr-store.svelte.js';
import { eqStore } from '#lib/stores/eq-store.svelte.js';
import { graphStore } from '#lib/stores/graph-store.svelte.js';
import { graphEngine } from '#lib/graph/GraphEngine.svelte.js';
import { baseline } from '#lib/graph/baseline.js';
import type { FRDataObject } from '#lib/types/data-types.js';

/** `labelBgPaddingX` — a backdrop for a label not yet measured is exactly this wide. */
const PADDING_X = 12;

const NAMES = ['Alpha', 'Bravo Two', 'Charlie Three Long', 'Delta', 'Echo Echo Echo Echo'];

function phone(uuid: string, identifier: string): FRDataObject {
	return {
		uuid,
		type: 'phone',
		identifier,
		channels: {
			AVG: {
				data: [
					[20, 0],
					[20000, 0]
				],
				metadata: { minFreq: 20, maxFreq: 20000 }
			}
		},
		dispChannel: ['AVG'],
		dispSuffix: '',
		colors: { AVG: '#00ff00' },
		dash: '1 0'
	};
}

/** Resolve after the next animation frame and the Svelte flush its callbacks queued. */
async function nextFrame() {
	await new Promise((resolve) => requestAnimationFrame(resolve));
	await tick();
}

function baselineLabel() {
	return document.querySelector('.fr-graph-baseline-text')?.textContent ?? null;
}

function labelTexts() {
	return [...document.querySelectorAll<SVGTextElement>('.fr-graph-label-text')];
}

function backdropWidths() {
	return [...document.querySelectorAll('.fr-graph-label-bg-rect')].map((rect) =>
		Number(rect.getAttribute('width'))
	);
}

/** Count `getBBox()` calls on label text, noting whether any backdrop was already resized. */
function spyOnLabelReads() {
	const original = SVGGraphicsElement.prototype.getBBox;
	const reads: { backdropsUntouched: boolean }[] = [];
	vi.spyOn(SVGGraphicsElement.prototype, 'getBBox').mockImplementation(function (
		this: SVGGraphicsElement,
		...args
	) {
		if (this.classList.contains('fr-graph-label-text')) {
			reads.push({ backdropsUntouched: backdropWidths().every((w) => w === PADDING_X) });
		}
		return original.apply(this, args);
	});
	return reads;
}

describe('GraphContainer curve labels', () => {
	beforeEach(async () => {
		frStore.clear();
		await render(GraphContainer);
		await tick();
		NAMES.forEach((name, i) => frStore.set(`p${i}`, phone(`p${i}`, name)));
		await tick();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		frStore.clear();
	});

	it('reads every label in one frame before resizing any backdrop', async () => {
		expect(labelTexts()).toHaveLength(NAMES.length);
		const reads = spyOnLabelReads();

		await nextFrame();

		expect(reads).toHaveLength(NAMES.length);
		expect(reads.every((r) => r.backdropsUntouched)).toBe(true);
	});

	it('sizes every backdrop from its label after one frame', async () => {
		await nextFrame();

		expect(backdropWidths()).toEqual(labelTexts().map((t) => t.getBBox().width + PADDING_X));
		expect(backdropWidths().every((w) => w > PADDING_X)).toBe(true);
	});

	it('re-measures a label whose text changes under the same key', async () => {
		await nextFrame();
		const before = backdropWidths()[0];

		frStore.set('p0', phone('p0', 'Alpha With A Much Longer Name'));
		await tick();
		await nextFrame();

		expect(backdropWidths()[0]).toBeGreaterThan(before);
		expect(backdropWidths()[0]).toBe(labelTexts()[0].getBBox().width + PADDING_X);
	});

	it('drops a removed label and keeps the others sized', async () => {
		await nextFrame();

		frStore.delete('p2');
		await tick();
		await nextFrame();

		expect(backdropWidths()).toHaveLength(NAMES.length - 1);
		expect(backdropWidths()).toEqual(labelTexts().map((t) => t.getBBox().width + PADDING_X));
	});

	it('re-measures every label in one batch when a web font finishes loading', async () => {
		await nextFrame();
		const reads = spyOnLabelReads();

		document.fonts.dispatchEvent(new Event('loadingdone'));
		await nextFrame();

		expect(reads).toHaveLength(NAMES.length);
	});
});

describe('GraphContainer labels for the EQ source run', () => {
	beforeEach(async () => {
		frStore.clear();
		await render(GraphContainer);
		await tick();
	});

	afterEach(() => {
		eqStore.isEnabled = false;
		eqStore.sourcePhoneUUID = null;
		frStore.clear();
	});

	it('labels the ghosted run by its name, even with the average off', async () => {
		const channel = phone('x', 'x').channels.AVG!;
		frStore.set('p', {
			...phone('p', 'Alpha'),
			samples: [{ label: 'Center', AVG: channel }],
			showAvg: false
		});
		eqStore.isEnabled = true;
		eqStore.sourcePhoneUUID = 'p';
		eqStore.sourceSample = { index: 0, variant: '' };
		await tick();

		expect(labelTexts().map((t) => t.textContent)).toEqual(['Alpha (Center, AVG)']);
	});
});

describe('GraphContainer baseline', () => {
	const flat = (db: number): FRDataObject['channels'] => ({
		AVG: {
			data: [
				[20, db],
				[20000, db]
			],
			metadata: { minFreq: 20, maxFreq: 20000 }
		}
	});

	const phonePath = () => document.querySelector('.fr-graph-phone-curve')?.getAttribute('d') ?? '';

	/** Wait for the rAF redraw and any path transition (duration 0) to settle. */
	async function settle() {
		await nextFrame();
		await nextFrame();
		await nextFrame();
	}

	beforeEach(async () => {
		frStore.clear();
		graphStore.baselineUUID = null;
		graphStore.baselineMode = 'off';
		graphStore.targetOriginalData.clear();
		await render(GraphContainer);
		await tick();
		graphEngine.transitionDuration = 0;
		frStore.set('p', phone('p', 'Alpha'));
		frStore.set('t', { ...phone('t', 'Tgt'), type: 'target', channels: flat(5) });
		await settle();
	});

	afterEach(() => {
		graphStore.baselineUUID = null;
		graphStore.baselineMode = 'off';
		graphStore.targetOriginalData.clear();
		frStore.clear();
	});

	it('moves the drawn curves when the baseline is cycled, and labels it', async () => {
		const before = phonePath();
		expect(baselineLabel()).toBeNull();

		baseline.cycle('t');
		await tick();
		await settle();

		expect(phonePath()).not.toBe(before);
		expect(baselineLabel()).toBe('Tgt Compensated');

		baseline.cycle('t');
		await settle();
		expect(phonePath()).toBe(before);
		expect(baselineLabel()).toBeNull();
	});

	it('reaches the drawn curves when only targetOriginalData changes', async () => {
		graphStore.targetOriginalData.set('t', { AVG: flat(5).AVG! });
		baseline.cycle('t');
		await settle();
		const before = phonePath();

		graphStore.targetOriginalData.set('t', { AVG: flat(12).AVG! });
		await settle();

		expect(phonePath()).not.toBe(before);
	});

	it('goes dormant when the baseline item is removed and returns with it', async () => {
		const before = phonePath();
		baseline.cycle('t');
		await settle();
		const compensated = phonePath();
		const target = frStore.get('t')!;

		frStore.delete('t');
		await settle();
		expect(phonePath()).toBe(before);
		expect(baselineLabel()).toBeNull();

		frStore.set('t', target);
		await settle();
		expect(phonePath()).toBe(compensated);
		expect(baselineLabel()).toBe('Tgt Compensated');
	});
});

describe('GraphContainer with a baseline restored before it mounts', () => {
	afterEach(() => {
		graphStore.baselineUUID = null;
		graphStore.baselineMode = 'off';
		frStore.clear();
	});

	it('draws the curves compensated, as the URL restore of a cold boot needs', async () => {
		frStore.clear();
		frStore.set('p', phone('p', 'Alpha'));
		frStore.set('t', {
			...phone('t', 'Tgt'),
			type: 'target',
			channels: {
				AVG: {
					data: [
						[20, 5],
						[20000, 5]
					],
					metadata: { minFreq: 20, maxFreq: 20000 }
				}
			}
		});
		baseline.restoreFromURL({ key: 'Tgt', mode: 'withoutAdjustment' });

		await render(GraphContainer);
		await tick();
		for (let i = 0; i < 3; i++) await nextFrame();

		const d = document.querySelector('.fr-graph-phone-curve')!.getAttribute('d')!;
		const y = Number(/^M[-\d.]+,([-\d.]+)/.exec(d)![1]);
		// A flat 0 dB curve against a flat 5 dB baseline sits at -5 dB.
		expect(y).toBeCloseTo(graphEngine.getScales().yScale(-5), 2);
		expect(baselineLabel()).toBe('Tgt Compensated');
	});
});
