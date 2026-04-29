import * as d3 from 'd3';
import type { GraphEngine } from './GraphEngine.svelte.js';
import { eqStore } from '$lib/stores/eq-store.svelte.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
import { eqCommands } from '$lib/services/eq-commands.js';
import { Equalizer, type EQFilter } from '$lib/utils/equalizer.js';
import { lookupFRValueAtFreq } from '$lib/utils/fr-lookup.js';
import FRSmoother from '$lib/utils/fr-smoother.js';
import type { FRDataPoint, ParsedFRData } from '$lib/types/data-types.js';

interface BandDatum {
	filter: EQFilter;
	index: number;
}

/**
 * GraphEqOverlay — renders interactive EQ band nodes, EQ response curve,
 * and ghost (pre-EQ) curve on the graph SVG.
 *
 * PK (peaking) filter nodes are positioned directly on the EQ-modified FR
 * curve, matching the UX of pro audio EQ plugins (FabFilter Pro-Q, etc.).
 * LSQ/HSQ (shelf) filters keep absolute (freq, gain) positioning.
 *
 * Interaction model:
 *   - Drag horizontal  → adjust frequency
 *   - Drag vertical    → adjust gain (PK: relative to curve, shelf: absolute)
 *   - Scroll on node   → adjust Q (±0.1 per tick, clamped [0.1, 10])
 *   - Double-click     → remove band
 *   - Click empty area → add new PK band (only when EQ panel active + source phone selected)
 */
export class GraphEqOverlay {
	private graphEngine: GraphEngine;
	private clipWrapper!: d3.Selection<SVGGElement, unknown, null, undefined>;
	private overlayGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
	private clickRect: d3.Selection<SVGRectElement, unknown, null, undefined> | null = null;
	private _eqPanelActive = false;
	private _dragThrottleTimers: Map<number, ReturnType<typeof setTimeout>> = new Map();
	private _keydownHandler: ((e: KeyboardEvent) => void) | null = null;
	private selectedFilterIndex: number | null = null;
	private eq = new Equalizer();

	private static readonly CLIP_ID = 'eq-overlay-clip';
	// Click vs drag threshold (pixels). A pointer that moves less than this between
	// dragstart and dragend is treated as a click and toggles selection.
	private static readonly CLICK_DRAG_THRESHOLD = 3;

	constructor(graphEngine: GraphEngine) {
		this.graphEngine = graphEngine;
		this._createOverlayGroup();
	}

	destroy(): void {
		this._setKeydownActive(false);
		this._removeClickRect();
		this.clipWrapper.remove();
		this.graphEngine.svg.select(`#${GraphEqOverlay.CLIP_ID}`).remove();
	}

	// ── SVG setup ──────────────────────────────────────────────────────────────

	private _createOverlayGroup(): void {
		const { xStart, xEnd, yTop, yBottom } = this.graphEngine.graphGeometry;

		// Create clipPath in <defs> matching the graph viewport
		this.graphEngine.svg
			.select<SVGDefsElement>('defs')
			.append('clipPath')
			.attr('id', GraphEqOverlay.CLIP_ID)
			.append('rect')
			.attr('x', xStart)
			.attr('y', yTop)
			.attr('width', xEnd - xStart)
			.attr('height', yBottom - yTop);

		// Wrapper group with clip — stays fixed (no transform)
		this.clipWrapper = this.graphEngine.svg
			.append('g')
			.attr('class', 'fr-graph-eq-clip-wrapper')
			.attr('clip-path', `url(#${GraphEqOverlay.CLIP_ID})`);

		// Inner overlay group — handle applies transform to this
		this.overlayGroup = this.clipWrapper.append('g').attr('class', 'fr-graph-eq-overlay');

		this.graphEngine.orderOverlayLayers();
	}

	// ── Public render API ──────────────────────────────────────────────────────

	render(): void {
		// Hide everything when EQ is globally disabled or panel is not active
		if (!eqStore.isEnabled || !this._eqPanelActive) {
			this.overlayGroup.selectAll('.eq-band-node').remove();
			return;
		}

		const xScale = this.graphEngine.xScale;
		const yScale = this.graphEngine.baseYScale;
		const filters = eqStore.filters;
		const sourceUUID = eqStore.sourcePhoneUUID;

		// Drop a stale selection that points past the end of the filter list
		// (can happen after external removal / import).
		if (this.selectedFilterIndex !== null && this.selectedFilterIndex >= filters.length) {
			this.selectedFilterIndex = null;
		}

		// Resolve curve color to match nodes with the visible EQ curve
		const eqCurveObj = eqStore.eqCurveUUID ? frStore.get(eqStore.eqCurveUUID) : null;
		const curveColor = eqCurveObj?.colors?.AVG ?? 'var(--color-primary)';

		// Data join for interactive nodes
		const data: BandDatum[] = filters
			.map((filter, index) => ({ filter, index }))
			.filter((d) => {
				if (!d.filter.enabled || d.filter.freq == null || d.filter.gain == null) return false;
				// PK nodes require a source phone (we need curve data for positioning)
				if (d.filter.type === 'PK' && !sourceUUID) return false;
				return true;
			});

		const nodes = this.overlayGroup
			.selectAll<SVGGElement, BandDatum>('.eq-band-node')
			.data(data, (d) => String(d.index));

		// EXIT
		nodes.exit().remove();

		// ENTER
		const entered = nodes
			.enter()
			.append('g')
			.attr('class', 'eq-band-node')
			.style('cursor', 'grab')
			.call(this._buildDragBehavior());

		// Transparent hit area (larger than visible dot for easier grabbing)
		entered.append('circle').attr('class', 'eq-hit-area').attr('r', 16).attr('fill', 'transparent');

		// Q ring
		entered
			.append('circle')
			.attr('class', 'eq-q-ring')
			.attr('fill', 'none')
			.attr('stroke', curveColor)
			.attr('stroke-width', 1.5)
			.attr('opacity', 0.5);

		// Center dot
		entered
			.append('circle')
			.attr('class', 'eq-center-dot')
			.attr('r', 6)
			.attr('fill', curveColor)
			.attr('opacity', 0.9);

		// Freq label
		entered
			.append('text')
			.attr('class', 'eq-freq-label')
			.attr('text-anchor', 'middle')
			.attr('dy', '-10')
			.attr('font-size', '10px')
			.attr('fill', 'var(--color-base-content)')
			.style('pointer-events', 'none')
			.style('user-select', 'none');

		// Hover feedback
		entered
			.on('mouseenter', function () {
				const node = d3.select(this);
				node.select('.eq-center-dot').attr('r', 8).attr('opacity', 1);
				node.select('.eq-q-ring').attr('opacity', 0.7);
			})
			.on('mouseleave', function () {
				const node = d3.select(this);
				node.select('.eq-center-dot').attr('r', 6).attr('opacity', 0.9);
				node.select('.eq-q-ring').attr('opacity', 0.5);
			});

		// Double-click to remove
		entered.on('dblclick', (_event: MouseEvent, d: BandDatum) => {
			eqCommands.removeBand(d.index);
		});

		// Scroll to adjust Q — repeated ticks coalesce into one undo entry
		entered.on(
			'wheel',
			(event: WheelEvent, d: BandDatum) => {
				event.preventDefault();
				const delta = event.deltaY > 0 ? -0.1 : 0.1;
				const newQ = Math.max(0.1, Math.min(10, d.filter.q! + delta));
				eqCommands.updateBand(d.index, { q: parseFloat(newQ.toFixed(2)) });
			},
			{ passive: false } as EventListenerOptions
		);

		// UPDATE (entered + updated)
		const merged = entered.merge(nodes);

		merged.attr('transform', (d) => {
			const freq = Math.max(20, Math.min(20000, d.filter.freq!));
			const x = xScale(freq);

			if (d.filter.type === 'PK') {
				// PK: position on the EQ-modified FR curve
				const curveDb = this._getCurveDbAtFreq(freq);
				if (curveDb === null) return 'translate(-100,-100)';
				return `translate(${x},${yScale(curveDb)})`;
			} else {
				// LSQ/HSQ: absolute gain positioning
				const y = yScale(Math.max(-40, Math.min(40, d.filter.gain!)));
				return `translate(${x},${y})`;
			}
		});

		merged
			.select<SVGCircleElement>('.eq-q-ring')
			.attr('r', (d) => this._qToRadius(d.filter.q!))
			.attr('stroke', curveColor)
			.attr('stroke-width', (d) => (d.index === this.selectedFilterIndex ? 3 : 1.5))
			.attr('opacity', (d) => (d.index === this.selectedFilterIndex ? 0.9 : 0.5));

		merged
			.select<SVGCircleElement>('.eq-center-dot')
			.attr('fill', curveColor)
			.attr('r', (d) => (d.index === this.selectedFilterIndex ? 8 : 6))
			.attr('opacity', (d) => (d.index === this.selectedFilterIndex ? 1 : 0.9));

		merged.select<SVGTextElement>('.eq-freq-label').text((d) => this._formatFreq(d.filter.freq!));
	}

	setEqPanelActive(active: boolean): void {
		if (active !== this._eqPanelActive) {
			this._eqPanelActive = active;
			this._updateClickRect();
			this._setKeydownActive(active);
			if (!active) this.selectedFilterIndex = null;
			this.render();
		}
	}

	// ── Keyboard handling (window-level, only while EQ panel is active) ────────

	private _setKeydownActive(active: boolean): void {
		if (active && !this._keydownHandler) {
			this._keydownHandler = (e: KeyboardEvent) => {
				const target = e.target as HTMLElement;
				if (
					target.tagName === 'INPUT' ||
					target.tagName === 'TEXTAREA' ||
					target.isContentEditable
				) {
					return;
				}
				if (e.key === 'Delete' || e.key === 'Backspace') {
					if (this.selectedFilterIndex === null) return;
					e.preventDefault();
					const idx = this.selectedFilterIndex;
					this.selectedFilterIndex = null;
					eqCommands.removeBand(idx);
				} else if (e.key === 'Escape') {
					if (this.selectedFilterIndex !== null) {
						this.selectedFilterIndex = null;
						this.render();
					}
				}
			};
			window.addEventListener('keydown', this._keydownHandler);
		} else if (!active && this._keydownHandler) {
			window.removeEventListener('keydown', this._keydownHandler);
			this._keydownHandler = null;
		}
	}

	// ── Curve lookup helpers ──────────────────────────────────────────────────

	/**
	 * Get the smoothed EQ-modified FR data for the source phone's primary displayed channel.
	 * Reads from the frStore EQ entry (post-normalization) to match the visible EQ curve.
	 * Falls back to source phone data when no EQ curve exists yet (click-to-add first band).
	 */
	private _getSourceChannelData(): FRDataPoint[] | null {
		// Prefer EQ curve data (post-normalization, matches visible curve)
		const eqCurveUUID = eqStore.eqCurveUUID;
		if (eqCurveUUID) {
			const eqEntry = frStore.get(eqCurveUUID);
			if (eqEntry) {
				const channelData = this._pickChannelData(eqEntry.channels);
				if (channelData) return FRSmoother.smooth(channelData, graphStore.smoothValue);
			}
		}
		// Fallback: source phone data (for click-to-add first band)
		const sourceUUID = eqStore.sourcePhoneUUID;
		if (!sourceUUID) return null;
		const sourceData = frStore.get(sourceUUID);
		if (!sourceData) return null;
		const channelData = this._pickChannelData(sourceData.channels);
		if (!channelData) return null;
		return FRSmoother.smooth(channelData, graphStore.smoothValue);
	}

	/**
	 * Pick the primary channel data from ParsedFRData.
	 * Prefers AVG, then falls back to first displayed channel.
	 */
	private _pickChannelData(
		channels: ParsedFRData,
		dispChannelOverride?: string[]
	): FRDataPoint[] | null {
		const dispChannels = dispChannelOverride ??
			frStore.get(eqStore.eqCurveUUID ?? '')?.dispChannel ??
			frStore.get(eqStore.sourcePhoneUUID ?? '')?.dispChannel ?? ['AVG'];

		let channelKey: 'L' | 'R' | 'AVG';
		if (channels.AVG && dispChannels.includes('AVG')) {
			channelKey = 'AVG';
		} else if (channels.AVG) {
			channelKey = 'AVG';
		} else {
			channelKey = (dispChannels[0] ?? 'L') as 'L' | 'R' | 'AVG';
		}

		const ch = channels[channelKey];
		if (!ch?.data?.length) return null;
		return ch.data;
	}

	/**
	 * Get the dB value of the displayed EQ curve at a given frequency.
	 * Accounts for smoothing and baseline compensation.
	 */
	private _getCurveDbAtFreq(freq: number): number | null {
		const smoothedData = this._getSourceChannelData();
		if (!smoothedData) return null;

		const curveDb = lookupFRValueAtFreq(smoothedData, freq);
		if (curveDb === null) return null;

		let compensatedDb = curveDb;

		// Baseline compensation
		const baselineData = this.graphEngine.baselineData;
		if (Array.isArray(baselineData.channelData) && baselineData.channelData.length > 0) {
			const baselineDb = lookupFRValueAtFreq(baselineData.channelData, freq);
			if (baselineDb !== null) {
				compensatedDb -= baselineDb;
			}
		}

		return compensatedDb;
	}

	/**
	 * Get curve dB at freq with a specific filter's contribution removed.
	 * Used during PK drag to compute "base curve without this filter".
	 */
	private _getCurveDbExcludingFilter(freq: number, excludeIndex: number): number | null {
		const curveDb = this._getCurveDbAtFreq(freq);
		if (curveDb === null) return null;

		const filter = eqStore.filters[excludeIndex];
		if (!filter?.enabled || !filter.freq || !filter.q || filter.gain == null) return curveDb;

		const thisFilterGain = this.eq.calculateGainsFromFilter([freq], [filter])[0];
		return curveDb - thisFilterGain;
	}

	// ── Drag behavior ──────────────────────────────────────────────────────────

	private _buildDragBehavior() {
		let dragState: {
			isPK: boolean;
			baseCurveDb: number | null;
			shiftOriginX: number;
			shiftOriginY: number;
			lockedFreq: number;
			lockedGain: number;
			axisLock: 'h' | 'v' | null;
		} | null = null;

		return d3
			.drag<SVGGElement, BandDatum>()
			.on('start', (_event: d3.D3DragEvent<SVGGElement, BandDatum, BandDatum>, d: BandDatum) => {
				const nodeEl = d3.select(
					(_event.sourceEvent?.target?.closest?.('.eq-band-node') as Element) ??
						_event.sourceEvent.currentTarget
				);
				nodeEl.style('cursor', 'grabbing').raise();
				nodeEl.select('.eq-center-dot').attr('r', 9).attr('opacity', 1);
				nodeEl.select('.eq-q-ring').attr('opacity', 0.8);

				const isPK = d.filter.type === 'PK';
				const common = {
					shiftOriginX: _event.x,
					shiftOriginY: _event.y,
					lockedFreq: d.filter.freq!,
					lockedGain: d.filter.gain!,
					axisLock: null as 'h' | 'v' | null
				};
				if (isPK) {
					const baseCurveDb = this._getCurveDbExcludingFilter(d.filter.freq!, d.index);
					dragState = { isPK: true, baseCurveDb, ...common };
				} else {
					dragState = { isPK: false, baseCurveDb: null, ...common };
				}
			})
			.on('drag', (event: d3.D3DragEvent<SVGGElement, BandDatum, BandDatum>, d: BandDatum) => {
				const xs = this.graphEngine.xScale;
				const ys = this.graphEngine.baseYScale;

				// Shift+Drag axis lock detection
				const shiftHeld = !!(event.sourceEvent as MouseEvent)?.shiftKey;
				if (dragState) {
					if (shiftHeld && dragState.axisLock === null) {
						const dx = Math.abs(event.x - dragState.shiftOriginX);
						const dy = Math.abs(event.y - dragState.shiftOriginY);
						if (dx > 3 || dy > 3) {
							dragState.axisLock = dx >= dy ? 'h' : 'v';
						}
					} else if (!shiftHeld && dragState.axisLock !== null) {
						dragState.axisLock = null;
						dragState.shiftOriginX = event.x;
						dragState.shiftOriginY = event.y;
						dragState.lockedFreq = Math.max(20, Math.min(20000, xs.invert(event.x)));
						dragState.lockedGain = d.filter.gain ?? 0;
					}
				}

				let freq = Math.max(20, Math.min(20000, xs.invert(event.x)));
				if (dragState?.axisLock === 'v') freq = dragState.lockedFreq;

				let gain: number;
				let visualY: number;

				if (dragState?.isPK && dragState.baseCurveDb !== null) {
					// PK on curve: gain = cursor dB position minus base curve value
					const targetDb = ys.invert(event.y);
					gain = Math.max(-40, Math.min(40, targetDb - dragState.baseCurveDb));
					// Node follows the cursor directly (it's on the curve)
					visualY = event.y;

					// Recompute baseCurveDb at new freq if frequency changed significantly
					// (the base curve shape varies across frequency)
					const origFreq = d.filter.freq!;
					if (Math.abs(freq - origFreq) / origFreq > 0.05) {
						const newBase = this._getCurveDbExcludingFilter(freq, d.index);
						if (newBase !== null) {
							dragState.baseCurveDb = newBase;
							gain = Math.max(-40, Math.min(40, targetDb - newBase));
						}
					}
				} else {
					// LSQ/HSQ: absolute gain positioning (unchanged)
					gain = Math.max(-40, Math.min(40, ys.invert(event.y)));
					visualY = ys(gain);
				}

				if (dragState?.axisLock === 'h') {
					gain = dragState.lockedGain;
					visualY =
						dragState.isPK && dragState.baseCurveDb !== null
							? ys(gain + dragState.baseCurveDb)
							: ys(gain);
				}

				// Move node visually with zero latency
				this.overlayGroup
					.selectAll<SVGGElement, BandDatum>('.eq-band-node')
					.filter((n) => n.index === d.index)
					.attr('transform', `translate(${xs(freq)},${visualY})`);

				// Throttle state update to ~60fps. Mid-drag updates flow through the
				// coalescer, which mutates the store directly *and* tracks the burst
				// — so a whole drag becomes one undo entry once dragend flushes.
				if (!this._dragThrottleTimers.has(d.index)) {
					this._dragThrottleTimers.set(
						d.index,
						setTimeout(() => {
							this._dragThrottleTimers.delete(d.index);
							eqCommands.updateBand(d.index, {
								freq: Math.round(freq),
								gain: parseFloat(gain.toFixed(1))
							});
						}, 16)
					);
				}
			})
			.on('end', (event: d3.D3DragEvent<SVGGElement, BandDatum, BandDatum>, d: BandDatum) => {
				const xs = this.graphEngine.xScale;
				const ys = this.graphEngine.baseYScale;

				// Click vs drag: if the pointer barely moved between start and end,
				// treat as a click — toggle selection without committing position.
				const moved = dragState
					? Math.hypot(event.x - dragState.shiftOriginX, event.y - dragState.shiftOriginY)
					: 0;
				const isClick = moved < GraphEqOverlay.CLICK_DRAG_THRESHOLD;

				if (isClick) {
					this.selectedFilterIndex = this.selectedFilterIndex === d.index ? null : d.index;
					this.render();
					dragState = null;
					return;
				}

				let freq = Math.max(20, Math.min(20000, xs.invert(event.x)));
				if (dragState?.axisLock === 'v') freq = dragState.lockedFreq;

				let gain: number;

				if (dragState?.isPK && dragState.baseCurveDb !== null) {
					const targetDb = ys.invert(event.y);
					gain = Math.max(-40, Math.min(40, targetDb - dragState.baseCurveDb));
				} else {
					gain = Math.max(-40, Math.min(40, ys.invert(event.y)));
				}
				if (dragState?.axisLock === 'h') gain = dragState.lockedGain;

				// Cancel pending throttle and commit final position to the store
				// (still through the coalescer so the whole drag stays one entry).
				const pending = this._dragThrottleTimers.get(d.index);
				if (pending !== undefined) {
					clearTimeout(pending);
					this._dragThrottleTimers.delete(d.index);
				}
				eqCommands.updateBand(d.index, {
					freq: Math.round(freq),
					gain: parseFloat(gain.toFixed(1))
				});
				// Flush the burst now so undo immediately undoes the whole drag.
				eqCommands.flushBand(d.index);

				const endNode = this.overlayGroup
					.selectAll<SVGGElement, BandDatum>('.eq-band-node')
					.filter((n) => n.index === d.index);
				endNode.style('cursor', 'grab');
				// Reset transient hover sizing — the real selected/unselected
				// styling is applied on next render().
				this.render();

				dragState = null;
			});
	}

	// ── Click-to-add ───────────────────────────────────────────────────────────

	private _updateClickRect(): void {
		if (this._eqPanelActive && eqStore.sourcePhoneUUID) {
			this._addClickRect();
		} else {
			this._removeClickRect();
		}
	}

	private _addClickRect(): void {
		if (this.clickRect) return;
		const { xStart, xEnd, yTop, yBottom } = this.graphEngine.graphGeometry;
		this.clickRect = this.overlayGroup
			.insert('rect', ':first-child') // below nodes
			.attr('class', 'eq-click-area')
			.attr('x', xStart)
			.attr('y', yTop)
			.attr('width', xEnd - xStart)
			.attr('height', yBottom - yTop)
			.attr('fill', 'transparent')
			.style('cursor', 'crosshair')
			.on('click', (event: MouseEvent) => {
				if (!eqStore.isEnabled || !eqStore.sourcePhoneUUID) return;
				// Don't fire when clicking on a node
				if ((event.target as Element).closest?.('.eq-band-node')) return;
				const xScale = this.graphEngine.xScale;
				const yScale = this.graphEngine.baseYScale;
				const [mx, my] = d3.pointer(event);
				const freq = Math.round(Math.max(20, Math.min(20000, xScale.invert(mx))));
				const clickedDb = yScale.invert(my);

				// PK on curve: gain = clicked position minus current curve value
				const curveDb = this._getCurveDbAtFreq(freq);
				if (curveDb !== null) {
					const gain = parseFloat(Math.max(-40, Math.min(40, clickedDb - curveDb)).toFixed(1));
					eqCommands.addBand({ enabled: true, type: 'PK', freq, q: 1.0, gain });
					// Newly added band sits at the end — auto-select for immediate Delete affordance.
					this.selectedFilterIndex = eqStore.filters.length - 1;
				}
			});
		this.graphEngine.orderOverlayLayers();
	}

	private _removeClickRect(): void {
		if (!this.clickRect) return;
		this.clickRect.remove();
		this.clickRect = null;
	}

	// ── Helpers ────────────────────────────────────────────────────────────────

	private _qToRadius(q: number): number {
		return Math.min(40, Math.max(8, 20 / Math.sqrt(q)));
	}

	private _formatFreq(freq: number): string {
		if (freq >= 1000) return `${(freq / 1000).toFixed(freq % 1000 === 0 ? 0 : 1)}k`;
		return String(Math.round(freq));
	}
}
