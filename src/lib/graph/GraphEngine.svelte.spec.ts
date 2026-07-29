/**
 * `GraphEngine` drives the D3 side of the graph: scales, curve drawing, the
 * baseline compensation applied to every path, and the HpTF envelope fill.
 *
 * Runs in the `client` project against a real `<svg>` attached to the document,
 * initialized the same way `GraphContainer` does it — `init(svgEl)` with a bound
 * element, never `d3.select('#fr-graph')`. Transitions are driven to duration 0
 * so path attributes settle synchronously where the assertion needs them.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { graphEngine } from './GraphEngine.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import type { FRDataObject, FRDataPoint, HpTFEnvelope } from '$lib/types/data-types.js';

let svgEl: SVGSVGElement;

/** Log-spaced points at a constant level. */
function flat(db = 80, from = 20, to = 20000): FRDataPoint[] {
	const points: FRDataPoint[] = [];
	const step = Math.pow(2, 1 / 24);
	for (let f = from; f <= to; f *= step) points.push([f, db]);
	return points;
}

function channel(db = 80) {
	return { data: flat(db), metadata: { minFreq: 20, maxFreq: 20000 } };
}

function makePhone(uuid: string, overrides: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid,
		type: 'phone',
		identifier: `Phone ${uuid}`,
		channels: { L: channel(80), R: channel(78), AVG: channel(79) },
		dispChannel: ['AVG'],
		dispSuffix: '',
		colors: { L: '#ff0000', R: '#0000ff', AVG: '#00ff00' },
		dash: '1 0',
		...overrides
	};
}

function makeTarget(uuid: string, overrides: Partial<FRDataObject> = {}): FRDataObject {
	return {
		uuid,
		type: 'target',
		identifier: `${uuid} Target`,
		channels: { AVG: channel(75) },
		dispChannel: ['AVG'],
		dispSuffix: '',
		colors: { AVG: '#666666' },
		dash: '4 4',
		...overrides
	};
}

function envelope(upperDb: number, lowerDb: number): HpTFEnvelope {
	return { upper: flat(upperDb), lower: flat(lowerDb) };
}

function paths(selector = "path[class*='fr-graph-']") {
	return Array.from(svgEl.querySelectorAll(selector));
}

/** Every `x,y` coordinate pair in an SVG path's `d`. d3 rounds to 3 decimals. */
function coords(d: string): Array<[number, number]> {
	return [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(
		(m) => [parseFloat(m[1]), parseFloat(m[2])] as [number, number]
	);
}

describe('GraphEngine', () => {
	beforeEach(() => {
		frStore.clear();
		// Any value outside OCTAVE_BANDS is a no-op in FRSmoother, which keeps the
		// assertions reading the input data rather than a smoothed resampling of it.
		graphStore.smoothValue = 'none';
		graphStore.baselineMode = 'off';
		graphStore.baselineUUID = null;
		graphStore.targetOriginalData.clear();
		eqStore.isEnabled = false;
		eqStore.sourcePhoneUUID = null;

		svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svgEl.style.width = '800px';
		svgEl.style.height = '450px';
		document.body.appendChild(svgEl);

		graphEngine.init(svgEl);
		// Assertions read path attributes right after the call that writes them.
		graphEngine.transitionDuration = 0;
		graphEngine.updateBaselineData(false);
	});

	afterEach(() => {
		svgEl.remove();
	});

	// ── init ─────────────────────────────────────────────────────────────────

	describe('init', () => {
		it('marks itself initialized and sets the viewBox', () => {
			expect(graphEngine.isInitialized).toBe(true);
			expect(svgEl.getAttribute('viewBox')).toBe('0 0 800 450');
		});

		it('builds a log x-scale spanning the audible band', () => {
			const { xScale } = graphEngine.getScales();
			expect(xScale.domain()).toEqual([20, 20000]);
			expect(xScale(20)).toBeLessThan(xScale(200));
			// Log scale: an octave is the same pixel distance wherever it sits.
			expect(xScale(200) - xScale(100)).toBeCloseTo(xScale(2000) - xScale(1000), 6);
		});

		it('builds a y-scale centred on 0 dB and inverted for screen coordinates', () => {
			const { yScale } = graphEngine.getScales();
			const half = graphEngine.getYScale() / 2;
			expect(yScale.domain()).toEqual([-half, half]);
			expect(yScale(10)).toBeLessThan(yScale(-10));
		});

		it('creates the y-axis group and the curve container', () => {
			expect(svgEl.querySelectorAll('.fr-graph-y-axis')).toHaveLength(1);
			expect(svgEl.querySelectorAll('.fr-graph-curve-container')).toHaveLength(1);
		});

		it('is idempotent — a second init does not duplicate the containers', () => {
			graphEngine.init(svgEl);
			expect(svgEl.querySelectorAll('.fr-graph-curve-container')).toHaveLength(1);
			expect(svgEl.querySelectorAll('.fr-graph-y-axis')).toHaveLength(1);
		});
	});

	// ── Curve drawing ────────────────────────────────────────────────────────

	describe('drawFRCurve', () => {
		it('draws one path per displayed channel', () => {
			frStore.set('p', makePhone('p', { dispChannel: ['L', 'R'] }));
			graphEngine.drawFRCurve('p');

			const drawn = paths('.fr-graph-phone-curve');
			expect(drawn).toHaveLength(2);
			expect(drawn.map((p) => p.getAttribute('channel'))).toEqual(['L', 'R']);
		});

		it('tags each path with uuid, type and identifier for later lookup', () => {
			frStore.set('p', makePhone('p'));
			graphEngine.drawFRCurve('p');

			const path = paths('.fr-graph-phone-curve')[0];
			expect(path.getAttribute('uuid')).toBe('p');
			expect(path.getAttribute('type')).toBe('phone');
			expect(path.getAttribute('identifier')).toBe('Phone p');
		});

		it('uses the per-channel color and the entry dash', () => {
			frStore.set('p', makePhone('p', { dispChannel: ['L'], dash: '4 2' }));
			graphEngine.drawFRCurve('p');

			const path = paths('.fr-graph-phone-curve')[0];
			expect(path.getAttribute('stroke')).toBe('#ff0000');
			expect(path.getAttribute('stroke-dasharray')).toBe('4 2');
		});

		it('produces a non-empty `d` for real channel data', () => {
			frStore.set('p', makePhone('p'));
			graphEngine.drawFRCurve('p');
			expect(paths('.fr-graph-phone-curve')[0].getAttribute('d')).toMatch(/^M/);
		});

		it('redraws rather than accumulating when called twice', () => {
			frStore.set('p', makePhone('p'));
			graphEngine.drawFRCurve('p');
			graphEngine.drawFRCurve('p');
			expect(paths('.fr-graph-phone-curve')).toHaveLength(1);
		});

		it('does nothing for a UUID that is not in the store', () => {
			graphEngine.drawFRCurve('missing');
			expect(paths()).toHaveLength(0);
		});

		it('draws a target as a single AVG curve', () => {
			frStore.set('t', makeTarget('t'));
			graphEngine.drawFRCurve('t');

			const drawn = paths('.fr-graph-target-curve');
			expect(drawn).toHaveLength(1);
			expect(drawn[0].getAttribute('stroke')).toBe('#666666');
		});

		it('dims the curve while it is the active EQ source', () => {
			eqStore.isEnabled = true;
			eqStore.sourcePhoneUUID = 'p';
			frStore.set('p', makePhone('p'));
			graphEngine.drawFRCurve('p');

			expect(paths('.fr-graph-phone-curve')[0].getAttribute('opacity')).toBe('0.35');
		});

		it('applies a stored y-offset as a transform', () => {
			frStore.set('p', makePhone('p', { yOffset: 5 }));
			graphEngine.drawFRCurve('p');

			expect(paths('.fr-graph-phone-curve')[0].getAttribute('transform')).toMatch(
				/^translate\(0, -?[\d.]+\)$/
			);
		});
	});

	describe('multi-sample traces', () => {
		it('draws a thin trace per selected sample key', () => {
			frStore.set(
				'p',
				makePhone('p', {
					samples: [
						{ L: channel(81), R: channel(79) },
						{ L: channel(82), R: channel(80) }
					],
					sampleCount: 2,
					dispSamples: ['L1', 'R2']
				})
			);
			graphEngine.drawFRCurve('p');

			const samples = paths('[sample="true"]');
			expect(samples).toHaveLength(2);
			expect(samples.map((p) => p.getAttribute('channel'))).toEqual(['L1', 'R2']);
			expect(samples[0].getAttribute('opacity')).toBe('0.35');
		});

		it('skips a sample key whose slot has no data on that side', () => {
			frStore.set(
				'p',
				makePhone('p', {
					samples: [{ L: channel(81) }],
					sampleCount: 1,
					dispSamples: ['L1', 'R1']
				})
			);
			graphEngine.drawFRCurve('p');

			expect(paths('[sample="true"]')).toHaveLength(1);
		});

		it('ignores an unparseable sample key', () => {
			frStore.set(
				'p',
				makePhone('p', {
					samples: [{ L: channel(81) }],
					sampleCount: 1,
					dispSamples: ['nonsense' as never]
				})
			);
			graphEngine.drawFRCurve('p');

			expect(paths('[sample="true"]')).toHaveLength(0);
		});
	});

	describe('HpTF rendering', () => {
		function hptfPhone(overrides: Partial<FRDataObject> = {}): FRDataObject {
			return makePhone('p', {
				hptf: {
					samples: [
						{ label: 'Fit A', L: channel(81), R: channel(79) },
						{ label: 'Fit B', L: channel(83), R: channel(81) }
					],
					envelope: {
						L: envelope(83, 81),
						R: envelope(81, 79),
						AVG: envelope(82, 80)
					},
					labels: ['Fit A', 'Fit B'],
					fillOnly: false
				},
				hptfFillVisible: true,
				...overrides
			});
		}

		it('draws the envelope as one closed filled path behind the curves', () => {
			frStore.set('p', hptfPhone());
			graphEngine.drawFRCurve('p');

			const fill = paths('.fr-graph-hptf-fill');
			expect(fill).toHaveLength(1);
			expect(fill[0].getAttribute('d')!.endsWith('Z')).toBe(true);
			// Inserted as first child so it sits under the stroked curves.
			expect(fill[0].previousElementSibling).toBeNull();
		});

		it('omits the fill when hptfFillVisible is off', () => {
			frStore.set('p', hptfPhone({ hptfFillVisible: false }));
			graphEngine.drawFRCurve('p');
			expect(paths('.fr-graph-hptf-fill')).toHaveLength(0);
		});

		it('draws one sample curve per selected HpTF key', () => {
			frStore.set('p', hptfPhone({ dispHptf: ['sample0_L', 'sample1_R'] }));
			graphEngine.drawFRCurve('p');

			const drawn = paths('[hptf-sample="true"]');
			expect(drawn).toHaveLength(2);
			expect(drawn.map((p) => p.getAttribute('channel'))).toEqual(['sample0_L', 'sample1_R']);
		});

		it('skips an HpTF key pointing at a missing sample or channel', () => {
			frStore.set('p', hptfPhone({ dispHptf: ['sample9_L', 'sample0_AVG', 'garbage' as never] }));
			graphEngine.drawFRCurve('p');
			expect(paths('[hptf-sample="true"]')).toHaveLength(0);
		});

		it('draws the pooled mean instead of the main channels when hptfOnly', () => {
			frStore.set('p', hptfPhone({ hptfOnly: true, hptfAvgVisible: true }));
			graphEngine.drawFRCurve('p');

			expect(paths('[hptf-avg="true"]')).toHaveLength(1);
			// No plain channel curve — hptfOnly suppresses it.
			expect(
				paths('.fr-graph-phone-curve').filter(
					(p) => !p.hasAttribute('hptf-avg') && !p.classList.contains('fr-graph-hptf-fill')
				)
			).toHaveLength(0);
		});
	});

	// ── Envelope maths ───────────────────────────────────────────────────────

	describe('_combineHpTFEnvelopes', () => {
		it('returns an empty envelope when nothing is usable', () => {
			expect(graphEngine._combineHpTFEnvelopes([])).toEqual({ upper: [], lower: [] });
			expect(graphEngine._combineHpTFEnvelopes([{ upper: [], lower: [] }])).toEqual({
				upper: [],
				lower: []
			});
		});

		it('passes a single envelope through untouched', () => {
			const only = envelope(6, -6);
			expect(graphEngine._combineHpTFEnvelopes([only])).toBe(only);
		});

		it('takes the widest spread at each index', () => {
			const combined = graphEngine._combineHpTFEnvelopes([envelope(4, -2), envelope(2, -6)]);
			expect(combined.upper[0][1]).toBe(4);
			expect(combined.lower[0][1]).toBe(-6);
		});
	});

	describe('_buildHpTFEnvelopePath channel selection', () => {
		function withEnvelopes(
			dispChannel: ('L' | 'R' | 'AVG')[],
			env: Partial<Record<'L' | 'R' | 'AVG', HpTFEnvelope>>
		): FRDataObject {
			return makePhone('p', {
				dispChannel,
				hptf: {
					samples: [],
					envelope: {
						L: { upper: [], lower: [] },
						R: { upper: [], lower: [] },
						AVG: { upper: [], lower: [] },
						...env
					},
					labels: [],
					fillOnly: false
				}
			});
		}

		it('returns null without HpTF data', () => {
			expect(graphEngine._buildHpTFEnvelopePath(makePhone('p'))).toBeNull();
		});

		it('returns null when the picked envelope is empty', () => {
			expect(graphEngine._buildHpTFEnvelopePath(withEnvelopes(['AVG'], {}))).toBeNull();
		});

		it('uses only L when L is the sole displayed channel', () => {
			const obj = withEnvelopes(['L'], { L: envelope(3, -3), R: envelope(9, -9) });
			const d = graphEngine._buildHpTFEnvelopePath(obj)!;
			// Upper edge is L's +3 dB, not R's +9 dB.
			expect(coords(d)[0][1]).toBeCloseTo(graphEngine.getScales().yScale(3), 2);
		});

		it('combines L and R for an AVG display rather than using envelope.AVG', () => {
			const combined = graphEngine._buildHpTFEnvelopePath(
				withEnvelopes(['AVG'], { L: envelope(3, -1), R: envelope(1, -3), AVG: envelope(2, -2) })
			)!;
			const avgOnly = graphEngine._buildHpTFEnvelopePath(
				withEnvelopes(['AVG'], { AVG: envelope(2, -2) })
			)!;
			// The true spread (+3/-3) is wider than envelope.AVG (+2/-2), so the
			// paths must differ — this is the case the comment in the source guards.
			expect(combined).not.toBe(avgOnly);
			expect(combined.length).toBeGreaterThan(0);
		});

		it('falls back to envelope.AVG when neither L nor R has data', () => {
			const d = graphEngine._buildHpTFEnvelopePath(
				withEnvelopes(['AVG'], { AVG: envelope(2, -2) })
			);
			expect(d).toMatch(/^M/);
			expect(d!.endsWith('Z')).toBe(true);
		});
	});

	// ── Baseline ─────────────────────────────────────────────────────────────

	describe('baseline', () => {
		beforeEach(() => {
			frStore.set('p', makePhone('p'));
			frStore.set('t', makeTarget('t'));
		});

		it('resolves channel data from the store when enabled', () => {
			graphStore.baselineMode = 'withoutAdjustment';
			graphEngine.updateBaselineData(true, { uuid: 't' });

			const data = graphEngine.getBaselineData();
			expect(data.uuid).toBe('t');
			expect(data.identifier).toBe('t Target');
			expect(data.channelData!.length).toBeGreaterThan(0);
			expect(graphStore.baselineUUID).toBe('t');
		});

		it('accepts an explicit channelData override for URL restoration', () => {
			const snapshot: FRDataPoint[] = [
				[100, 1],
				[1000, 2]
			];
			graphEngine.updateBaselineData(true, { uuid: 't', channelData: snapshot });
			expect(graphEngine.getBaselineData().channelData).toBe(snapshot);
		});

		it('clears everything when disabled', () => {
			graphStore.baselineMode = 'withoutAdjustment';
			graphEngine.updateBaselineData(true, { uuid: 't' });
			graphEngine.updateBaselineData(false);

			expect(graphEngine.getBaselineData()).toEqual({
				uuid: null,
				identifier: null,
				channelData: null
			});
			expect(graphEngine.getBaselineUUID()).toBeNull();
			expect(graphStore.baselineUUID).toBeNull();
		});

		it('refuses to enable without a UUID', () => {
			graphEngine.updateBaselineData(true);
			expect(graphEngine.getBaselineUUID()).toBeNull();
		});

		it('refuses to enable against a UUID the store does not have', () => {
			graphEngine.updateBaselineData(true, { uuid: 'gone' });
			expect(graphEngine.getBaselineUUID()).toBeNull();
		});

		it('subtracts the baseline from every drawn curve', () => {
			graphEngine.drawFRCurve('p');
			const before = paths('.fr-graph-phone-curve')[0].getAttribute('d');

			graphEngine.updateBaselineData(true, {
				uuid: 't',
				channelData: flat(10)
			});
			graphEngine.repositionCurves();

			expect(paths('.fr-graph-phone-curve')[0].getAttribute('d')).not.toBe(before);
		});

		it('flattens a curve baselined against itself', () => {
			graphEngine.updateBaselineData(true, { uuid: 'p', channelData: flat(79) });
			graphEngine.drawFRCurve('p');

			// dispChannel is AVG at 79 dB against a 79 dB baseline → 0 dB everywhere.
			const zeroY = graphEngine.getScales().yScale(0);
			const ys = coords(paths('.fr-graph-phone-curve')[0].getAttribute('d')!).map(([, y]) => y);
			expect(ys.length).toBeGreaterThan(0);
			for (const y of ys) expect(y).toBeCloseTo(zeroY, 2);
		});

		it('refreshBaselineData drops the baseline once its entry is removed', () => {
			graphStore.baselineMode = 'withoutAdjustment';
			graphEngine.updateBaselineData(true, { uuid: 't' });

			frStore.delete('t');
			graphEngine.refreshBaselineData();

			expect(graphEngine.getBaselineUUID()).toBeNull();
			expect(graphStore.baselineMode).toBe('off');
		});

		it('refreshBaselineData re-reads channel data after the entry changed', () => {
			graphStore.baselineMode = 'withoutAdjustment';
			graphEngine.updateBaselineData(true, { uuid: 't' });

			frStore.set('t', makeTarget('t', { channels: { AVG: channel(50) } }));
			graphEngine.refreshBaselineData();

			expect(graphEngine.getBaselineData().channelData![0][1]).toBe(50);
		});

		it('refreshBaselineData is a no-op with no baseline set', () => {
			graphEngine.refreshBaselineData();
			expect(graphEngine.getBaselineUUID()).toBeNull();
		});
	});

	// ── Path helpers + per-curve updates ─────────────────────────────────────

	describe('_getCompensatedPath', () => {
		it('maps data straight through the scales with no baseline', () => {
			const { xScale, yScale } = graphEngine.getScales();
			const d = graphEngine._getCompensatedPath([
				[100, 5],
				[1000, 5]
			])!;
			const [first] = coords(d);
			expect(first[0]).toBeCloseTo(xScale(100), 2);
			expect(first[1]).toBeCloseTo(yScale(5), 2);
		});

		it('returns null for an empty data array', () => {
			expect(graphEngine._getCompensatedPath([])).toBeNull();
		});

		it('interpolates the baseline between its surrounding points', () => {
			graphEngine.updateBaselineData(true, {
				uuid: 'x',
				channelData: [
					[100, 0],
					[1000, 10]
				]
			});
			frStore.set('x', makePhone('x'));
			graphEngine.updateBaselineData(true, {
				uuid: 'x',
				channelData: [
					[100, 0],
					[1000, 10]
				]
			});

			const { yScale } = graphEngine.getScales();
			const d = graphEngine._getCompensatedPath([[1000, 10]])!;
			// Baseline is 10 dB at 1 kHz, so the compensated value is 0.
			expect(coords(d)[0][1]).toBeCloseTo(yScale(0), 2);
		});
	});

	describe('updateVisibility', () => {
		it('hides and re-shows every path for a UUID', () => {
			frStore.set('p', makePhone('p', { dispChannel: ['L', 'R'] }));
			graphEngine.drawFRCurve('p');

			graphEngine.updateVisibility('p', false);
			expect(
				paths('.fr-graph-phone-curve').every((p) => p.getAttribute('visibility') === 'hidden')
			).toBe(true);

			graphEngine.updateVisibility('p', true);
			expect(
				paths('.fr-graph-phone-curve').every((p) => p.getAttribute('visibility') === 'visible')
			).toBe(true);
		});
	});

	describe('applyYOffset', () => {
		beforeEach(() => {
			frStore.set('p', makePhone('p'));
			graphEngine.drawFRCurve('p');
		});

		it('translates the curve up for a positive offset', () => {
			graphEngine.applyYOffset('p', 5);
			const transform = paths('.fr-graph-phone-curve')[0].getAttribute('transform')!;
			expect(parseFloat(/translate\(0, ([-\d.]+)\)/.exec(transform)![1])).toBeLessThan(0);
		});

		it('translates the other way for a negative offset', () => {
			graphEngine.applyYOffset('p', -5);
			const transform = paths('.fr-graph-phone-curve')[0].getAttribute('transform')!;
			expect(parseFloat(/translate\(0, ([-\d.]+)\)/.exec(transform)![1])).toBeGreaterThan(0);
		});

		it('removes the transform entirely at zero', () => {
			graphEngine.applyYOffset('p', 5);
			graphEngine.applyYOffset('p', 0);
			expect(paths('.fr-graph-phone-curve')[0].hasAttribute('transform')).toBe(false);
		});
	});

	describe('eraseFRCurve', () => {
		it('removes only the requested entry', () => {
			frStore.set('a', makePhone('a'));
			frStore.set('b', makePhone('b'));
			graphEngine.drawFRCurve('a');
			graphEngine.drawFRCurve('b');

			graphEngine.eraseFRCurve('a');

			const left = paths('.fr-graph-phone-curve');
			expect(left).toHaveLength(1);
			expect(left[0].getAttribute('uuid')).toBe('b');
		});
	});

	describe('channelUpdateRunner', () => {
		it('redraws a phone with its new displayed channels', () => {
			frStore.set('p', makePhone('p', { dispChannel: ['AVG'] }));
			graphEngine.drawFRCurve('p');
			expect(paths('.fr-graph-phone-curve')).toHaveLength(1);

			frStore.set('p', makePhone('p', { dispChannel: ['L', 'R'] }));
			graphEngine.channelUpdateRunner('p', 'phone');

			expect(paths('.fr-graph-phone-curve').map((p) => p.getAttribute('channel'))).toEqual([
				'L',
				'R'
			]);
		});

		it('leaves the graph empty when the entry is gone', () => {
			frStore.set('p', makePhone('p'));
			graphEngine.drawFRCurve('p');
			frStore.delete('p');

			graphEngine.channelUpdateRunner('p', 'phone');
			expect(paths('.fr-graph-phone-curve')).toHaveLength(0);
		});
	});

	describe('updateYScale', () => {
		it('rescales the domain around the new span', () => {
			graphEngine.updateYScale('30');
			expect(graphEngine.getYScale()).toBe(30);
			expect(graphEngine.getScales().yScale.domain()).toEqual([-15, 15]);
			expect(graphStore.yScale).toBe(30);
		});
	});

	describe('orderOverlayLayers', () => {
		it('raises the curve container above the axes', () => {
			graphEngine.orderOverlayLayers();
			const children = Array.from(svgEl.children);
			expect(children.indexOf(svgEl.querySelector('.fr-graph-curve-container')!)).toBeGreaterThan(
				children.indexOf(svgEl.querySelector('.fr-graph-y-axis')!)
			);
		});
	});
});
