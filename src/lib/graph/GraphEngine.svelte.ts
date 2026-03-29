import * as d3 from 'd3';
import type { FRDataObject, FRDataPoint, BaselineData } from '$lib/types/data-types.js';
import FRSmoother from '$lib/utils/fr-smoother.js';
import GraphWatermark from './GraphWatermark.js';
import GraphHandle from './GraphHandle.js';
import GraphInspection from './GraphInspection.js';
import { getConfigValue } from '$lib/utils/config.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import { graphStore } from '$lib/stores/graph-store.svelte.js';
import { SvelteSet } from 'svelte/reactivity';

class GraphEngine {
	// ── Property declarations ──────────────────────────────────────────────────
	viewBoxWidth: number;
	viewBoxHeight: number;
	graphGeometry: { xStart: number; xEnd: number; yTop: number; yBottom: number };
	labelPosition: Record<string, { x: number; y: number; anchor: string; growUp: boolean; style?: string }>;
	baselineData: BaselineData;
	transitionDuration: number;
	yScaleValue = 60;
	svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
	graphHandle!: GraphHandle;
	graphInspection!: GraphInspection;
	_updateCurveTimeout: ReturnType<typeof setTimeout> | null = null;
	_updateLabelTimeout: ReturnType<typeof setTimeout> | null = null;
	labelBgGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
	labelGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
	xScale!: d3.ScaleLogarithmic<number, number>;
	yScale!: d3.ScaleLinear<number, number>;
	curveGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
	isInitialized = false;

	constructor() {
		// Compute viewBox dimensions from configured aspect ratio
		const aspectRatio = (getConfigValue('VISUALIZATION.ASPECT_RATIO') as string) || '16:9';
		this.viewBoxWidth = 800;
		this.viewBoxHeight = aspectRatio === 'CrinGraph' ? 346 : 450;

		const margin = 15;
		this.graphGeometry = {
			xStart: margin,
			xEnd: this.viewBoxWidth - margin,
			yTop: margin,
			yBottom: this.viewBoxHeight - margin
		};
		this.labelPosition = {
			BOTTOM_LEFT: { x: 60, y: this.graphGeometry.yBottom - 8, anchor: 'start', growUp: true },
			BOTTOM_RIGHT: { x: this.graphGeometry.xEnd - 45, y: this.graphGeometry.yBottom - 8, anchor: 'end', growUp: true },
			TOP_LEFT: { x: 60, y: this.graphGeometry.yTop + 45, anchor: 'start', growUp: false },
			TOP_RIGHT: { x: this.graphGeometry.xEnd - 45, y: this.graphGeometry.yTop + 45, anchor: 'end', growUp: false }
		};
		this.baselineData = {
			uuid: null,
			identifier: null,
			channelData: null
		};
		this.transitionDuration = 300;
	}

	/** Initialize GraphEngine with bound SVG element */
	init(svgEl: SVGSVGElement, isMobile = false): void {
		this.yScaleValue =
			parseInt((getConfigValue('VISUALIZATION.DEFAULT_Y_SCALE') as string) || '60') || 60;
		graphStore.yScale = this.yScaleValue;

		this.svg = d3
			.select(svgEl)
			.attr('viewBox', `0 0 ${this.viewBoxWidth} ${this.viewBoxHeight}`)
			.attr('preserveAspectRatio', 'xMidYMid meet');

		this._setupScales();
		this._drawAxis();
		this._drawFadeGradient();
		this._createCurveGroup();

		GraphWatermark(this.svg, this.viewBoxWidth, this.viewBoxHeight);
		this.graphHandle = new GraphHandle(this.svg, this, isMobile);
		this.graphInspection = new GraphInspection(this);

		this.isInitialized = true;
	}

	/** Update the graph with new data — debounced 100ms */
	refreshEveryFRCurves(): void {
		if (this._updateCurveTimeout) {
			clearTimeout(this._updateCurveTimeout);
		}

		this._updateCurveTimeout = setTimeout(() => {
			this.refreshBaselineData();

			this.svg
				.select('.fr-graph-curve-container')
				.selectAll("path[class*='fr-graph-'][class*='-curve']")
				.remove();

			frStore.entries.forEach((obj, uuid) => {
				if (!obj.hidden) {
					this.drawFRCurve(uuid);
				}
			});

			this.orderOverlayLayers();
			this._updateCurveTimeout = null;
		}, 100);
	}

	/** Update Y Scale of Graph */
	updateYScale(scale: string): void {
		this.yScaleValue = parseInt(scale);
		graphStore.yScale = this.yScaleValue;
		this._setupScales();
		this.graphHandle.resetHandle();
		this.updateYAxis();

		this.curveGroup
			.selectAll("path[class*='fr-graph-'][class*='-curve']:not(.fr-graph-hptf-fill)")
			.transition()
			.duration(this.transitionDuration)
			.attr('d', (d) => this._getCompensatedPath(d as FRDataPoint[]));

		this._transitionHpTFFillPaths(true);
	}

	/** Update Labels of graph — debounced */
	updateLabels(): void {
		if (this._updateLabelTimeout) {
			clearTimeout(this._updateLabelTimeout);
		}

		this._updateLabelTimeout = setTimeout(() => {
			let labelCounter = 0;
			const labelLocation =
				(getConfigValue('VISUALIZATION.LABEL.LOCATION') as string) || 'BOTTOM_LEFT';
			const startX =
				this.labelPosition[labelLocation].x +
				parseInt((getConfigValue('VISUALIZATION.LABEL.POSITION.RIGHT') as string) || '0') -
				parseInt((getConfigValue('VISUALIZATION.LABEL.POSITION.LEFT') as string) || '0');
			const startY =
				this.labelPosition[labelLocation].y +
				parseInt((getConfigValue('VISUALIZATION.LABEL.POSITION.DOWN') as string) || '0') -
				parseInt((getConfigValue('VISUALIZATION.LABEL.POSITION.UP') as string) || '0');
			const lineHeight =
				parseInt((getConfigValue('VISUALIZATION.LABEL.TEXT_SIZE') as string) || '17') + 8;

			if (this.labelBgGroup) {
				this.labelBgGroup.remove();
			}
			this.labelBgGroup = this.svg
				.append('g')
				.attr('class', 'fr-graph-label-bg')
				.attr('transform', `translate(${startX},${startY})`);

			if (this.labelGroup) {
				this.labelGroup.remove();
			}
			this.labelGroup = this.svg
				.append('g')
				.attr('class', 'fr-graph-label')
				.attr('transform', `translate(${startX},${startY})`);

			const labelBgGroup = this.labelBgGroup!;
			const labelGroup = this.labelGroup!;

			Array.from(frStore.entries)
				.sort(([, a], [,]) => (a.type === 'target' ? -1 : 1))
				.forEach(([, obj]) => {
					if (obj.hidden) return;

					const channels = [...obj.dispChannel];
					channels.forEach((channel) => {
						const textContent =
							obj.type !== 'target'
								? `${obj.identifier} ${obj.dispSuffix} (${channel})`
								: `${obj.identifier} ${obj.dispSuffix}`;

						labelBgGroup
							.append('rect')
							.attr('class', 'fr-graph-label-bg-rect')
							.attr('x', -10)
							.attr('y', `${(labelCounter - 0.75) * lineHeight}`)
							.attr('rx', 4)
							.attr('ry', 4)
							.attr('uuid', obj.uuid)
							.attr('width', textContent.length * lineHeight * 0.35)
							.attr('height', lineHeight)
							.attr('fill', 'var(--color-color-surface-container-lowest)')
							.attr('opacity', '0.7')
							.attr('filter', 'blur(4px)');

						labelGroup
							.append('text')
							.attr('class', 'fr-graph-label-text')
							.attr('y', `${labelCounter * lineHeight}`)
							.attr('fill', obj.colors[channel as 'L' | 'R' | 'AVG'] || obj.colors?.AVG)
							.attr('style', this.labelPosition[labelLocation].style ?? null)
							.attr('text-anchor', this.labelPosition[labelLocation].anchor)
							.attr(
								'font-size',
								(getConfigValue('VISUALIZATION.LABEL.TEXT_SIZE') as string) || '20px'
							)
							.attr(
								'font-weight',
								(getConfigValue('VISUALIZATION.LABEL.TEXT_WEIGHT') as string) || '600'
							)
							.attr('uuid', obj.uuid)
							.text(textContent);

						labelCounter++;
					});

					// Sample traces do not get individual labels

					if (this.labelPosition[labelLocation].growUp) {
						labelGroup.attr(
							'transform',
							`translate(${startX}, ${startY - labelCounter * lineHeight})`
						);
						labelBgGroup.attr(
							'transform',
							`translate(${startX}, ${startY - labelCounter * lineHeight})`
						);
					}
				});

			this._updateLabelTimeout = null;

			if (this.graphInspection) {
				this.graphInspection.onLabelsUpdated();
			}
		}, 0);
	}

	/** Refresh baseline channel data from latest frStore entry (after re-smooth, re-normalize, etc.) */
	refreshBaselineData(): void {
		if (!this.baselineData.uuid) return;
		const data = frStore.get(this.baselineData.uuid);
		if (!data) {
			// Baseline entry was removed
			this.baselineData = { uuid: null, identifier: null, channelData: null };
			graphStore.baselineUUID = null;
			graphStore.baselineMode = 'off';
			this.updateBaselineLabel();
			return;
		}
		// In "original" mode, refresh from targetOriginalData
		if (graphStore.baselineMode === 'original') {
			const original = graphStore.targetOriginalData.get(this.baselineData.uuid);
			if (original?.['AVG']?.data) {
				this.baselineData.channelData = original['AVG'].data;
			}
			return;
		}
		// In "adjusted" mode, refresh from latest frStore data
		this.baselineData.channelData =
			data.type === 'phone'
				? (data.channels[
						data.dispChannel.includes('L') && data.dispChannel.includes('R')
							? 'AVG'
							: data.dispChannel[0]
					]?.data ?? null)
				: (data.channels['AVG']?.data ?? null);
	}

	/** Update Baseline Data */
	updateBaselineData(
		enable: boolean,
		{
			uuid = null,
			channelData = null
		}: { uuid?: string | null; channelData?: FRDataPoint[] | null } = {}
	): void {
		if (!enable) {
			this.baselineData = { uuid: null, identifier: null, channelData: null };
		} else {
			if (uuid === null) {
				console.error('Baseline UUID is not defined');
				return;
			}
			const baselineMetaData = frStore.get(uuid);
			if (!baselineMetaData) {
				console.error('Baseline data not found for UUID:', uuid);
				return;
			}
			this.baselineData = {
				uuid,
				identifier: baselineMetaData.identifier,
				channelData:
					channelData !== null
						? channelData
						: baselineMetaData.type === 'phone'
							? (baselineMetaData.channels[
									baselineMetaData.dispChannel.includes('L') &&
									baselineMetaData.dispChannel.includes('R')
										? 'AVG'
										: baselineMetaData.dispChannel[0]
								]?.data ?? null)
							: (baselineMetaData.channels['AVG']?.data ?? null)
			};
		}

		graphStore.baselineUUID = this.baselineData.uuid;
		this.updateBaseline(true);
		this.updateBaselineLabel();
	}

	/** Update Baseline on Graph */
	updateBaseline(animate = false): void {
		const self = this;
		this.curveGroup
			.selectAll("path[class*='fr-graph-'][class*='-curve']:not(.fr-graph-hptf-fill)")
			.transition()
			.duration(animate ? this.transitionDuration : 0)
			.attrTween('d', function (d) {
				const path = d3.select(this as Element);
				const oldPath = path.attr('d') ?? '';
				const newPath = self._getCompensatedPath(d as FRDataPoint[]) ?? '';
				return (t) => d3.interpolateString(oldPath, newPath)(t);
			});

		this._transitionHpTFFillPaths(animate);
	}

	/** Update Baseline Label */
	updateBaselineLabel(): void {
		const uuid = this.baselineData.uuid;
		const identifier = this.baselineData.identifier;

		// Always remove existing label so mode changes update the text
		this.svg.selectAll('.fr-graph-baseline-text').remove();

		if (uuid === null) return;

		const labelLocation =
			(getConfigValue('VISUALIZATION.BASELINE_LABEL.LOCATION') as string) || 'BOTTOM_LEFT';
		const labelX =
			this.labelPosition[labelLocation].x +
			parseInt(
				(getConfigValue('VISUALIZATION.BASELINE_LABEL.POSITION.RIGHT') as string) || '0'
			) -
			parseInt(
				(getConfigValue('VISUALIZATION.BASELINE_LABEL.POSITION.LEFT') as string) || '0'
			);
		const labelY =
			this.labelPosition[labelLocation].y +
			parseInt(
				(getConfigValue('VISUALIZATION.BASELINE_LABEL.POSITION.DOWN') as string) || '0'
			) -
			parseInt(
				(getConfigValue('VISUALIZATION.BASELINE_LABEL.POSITION.UP') as string) || '0'
			);

		this.svg
			.append('text')
			.attr('class', 'fr-graph-baseline-text')
			.attr('data-uuid', uuid)
			.attr('x', labelX)
			.attr('y', labelY)
			.attr('text-anchor', this.labelPosition[labelLocation].anchor)
			.attr('fill', '#000000')
			.attr('opacity', '0.3')
			.attr(
				'font-size',
				(getConfigValue('VISUALIZATION.BASELINE_LABEL.TEXT_SIZE') as string) || '15px'
			)
			.attr(
				'font-weight',
				(getConfigValue('VISUALIZATION.BASELINE_LABEL.TEXT_WEIGHT') as string) || '500'
			)
			.text(
				graphStore.baselineMode === 'original'
					? `${identifier} (Original) Compensated`
					: `${identifier} Compensated`
			);
	}

	/** Update visibility of curves */
	updateVisibility(uuid: string, visible: boolean): void {
		this.svg
			.selectAll(`.fr-graph-curve-container *[uuid="${uuid}"]`)
			.attr('visibility', visible ? 'visible' : 'hidden');

		this.updateLabels();
	}

	/** Get compensated path for frequency response data */
	_getCompensatedPath(originalData: FRDataPoint[]): string | null {
		const bisect = d3.bisector<FRDataPoint, number>((point) => point[0]).left;
		const isBaselineValid =
			Array.isArray(this.baselineData.channelData) && this.baselineData.channelData.length > 0;

		const lineGenerator = d3
			.line<FRDataPoint>()
			.x((d) => this.xScale(d[0]))
			.y((d) => {
				if (!isBaselineValid) {
					return this.yScale(d[1]);
				}

				const channelData = this.baselineData.channelData!;
				const i = bisect(channelData, d[0], 0);
				const a = channelData[i - 1];
				const b = channelData[i];

				let baselineY = 0;
				if (a && b) {
					const t = (d[0] - a[0]) / (b[0] - a[0]);
					baselineY = a[1] + t * (b[1] - a[1]);
				} else if (a) {
					baselineY = a[1];
				} else if (b) {
					baselineY = b[1];
				}

				return this.yScale(d[1] - baselineY);
			})
			.curve(d3.curveNatural);

		return lineGenerator(originalData);
	}

	/** Build closed SVG path for HpTF deviation envelope */
	_buildHpTFEnvelopePath(obj: FRDataObject): string | null {
		if (!obj.hptf) return null;

		// Select envelope based on displayed channel
		let envelopeChannel: 'L' | 'R' | 'AVG' = 'AVG';
		if (obj.dispChannel.length === 1) {
			envelopeChannel = obj.dispChannel[0];
		}
		const envelope = obj.hptf.envelope[envelopeChannel];
		if (!envelope?.upper.length) return null;

		const bisect = d3.bisector<FRDataPoint, number>((point) => point[0]).left;
		const isBaselineValid =
			Array.isArray(this.baselineData.channelData) && this.baselineData.channelData.length > 0;

		const computeY = (point: FRDataPoint): number => {
			if (!isBaselineValid) return this.yScale(point[1]);
			const channelData = this.baselineData.channelData!;
			const i = bisect(channelData, point[0], 0);
			const a = channelData[i - 1];
			const b = channelData[i];
			let baselineY = 0;
			if (a && b) {
				const t = (point[0] - a[0]) / (b[0] - a[0]);
				baselineY = a[1] + t * (b[1] - a[1]);
			} else if (a) baselineY = a[1];
			else if (b) baselineY = b[1];
			return this.yScale(point[1] - baselineY);
		};

		// Use curveMonotoneX instead of curveNatural to prevent overshoot —
		// the envelope represents strict min/max bounds and must not extend beyond data points.
		const lineGen = d3
			.line<FRDataPoint>()
			.x((d) => this.xScale(d[0]))
			.y((d) => computeY(d))
			.curve(d3.curveMonotoneX);

		const upperPath = lineGen(envelope.upper) ?? '';
		const lowerPath = lineGen([...envelope.lower].reverse()) ?? '';

		return upperPath + lowerPath.replace(/^M/, 'L') + 'Z';
	}

	/** Transition HpTF fill paths after scale or baseline changes */
	_transitionHpTFFillPaths(animate: boolean): void {
		const self = this;
		this.curveGroup.selectAll<SVGPathElement, unknown>('path.fr-graph-hptf-fill').each(function () {
			const el = d3.select(this);
			const uuid = el.attr('uuid');
			if (!uuid) return;
			const obj = frStore.get(uuid);
			if (!obj) return;
			const newPath = self._buildHpTFEnvelopePath(obj);
			if (!newPath) return;
			if (animate) {
				const oldPath = el.attr('d') ?? '';
				el.transition()
					.duration(self.transitionDuration)
					.attrTween('d', () => (t: number) => d3.interpolateString(oldPath, newPath)(t));
			} else {
				el.attr('d', newPath);
			}
		});
	}

	getBaselineData(): BaselineData {
		return this.baselineData;
	}

	getYScale(): number {
		return this.yScaleValue;
	}

	getBaselineUUID(): string | null {
		return this.baselineData.uuid;
	}

	/** Apply a dB y-offset to all SVG paths for a given UUID */
	applyYOffset(uuid: string, yOffset: number): void {
		const pixelOffset = yOffset ? this.yScale(0) - this.yScale(yOffset) : 0;
		this.svg
			.selectAll(`.fr-graph-curve-container *[uuid="${uuid}"]`)
			.attr('transform', pixelOffset !== 0 ? `translate(0, ${-pixelOffset})` : null);
	}

	/** Order overlay layers in the SVG */
	orderOverlayLayers(): void {
		this.svg.selectAll('.fr-graph-x-axis, .fr-graph-y-axis').lower();
		this.svg.selectAll('.fr-graph-curve-container').raise();
		this.svg.selectAll('.x-grid-text, .y-grid-text').raise();
		this.svg.selectAll('.fr-graph-eq-overlay').raise();
		this.svg.selectAll('.fr-graph-label, .fr-graph-label-bg').raise();
	}

	/** Setup scales for the graph */
	_setupScales(): void {
		this.xScale = d3
			.scaleLog()
			.domain([20, 20000])
			.range([this.graphGeometry.xStart, this.graphGeometry.xEnd]);
		this.yScale = d3
			.scaleLinear()
			.domain([-(this.yScaleValue / 2), this.yScaleValue / 2])
			.range([this.graphGeometry.yBottom, this.graphGeometry.yTop]);
	}

	getScales(): {
		xScale: d3.ScaleLogarithmic<number, number>;
		yScale: d3.ScaleLinear<number, number>;
	} {
		return { xScale: this.xScale, yScale: this.yScale };
	}

	/** Draw axes for the graph */
	_drawAxis(): void {
		if (this.svg.select('.fr-graph-x-axis').empty()) {
			this.svg
				.append('g')
				.attr('class', 'fr-graph-x-axis')
				.attr('transform', 'translate(0,0)');
		}

		if (this.svg.select('.fr-graph-y-axis').empty()) {
			this.svg
				.append('g')
				.attr('class', 'fr-graph-y-axis')
				.attr('transform', 'translate(0,0)');
		}

		this.updateXAxis();
		this.updateYAxis();
	}

	/** Create curve group for frequency response curves */
	_createCurveGroup(): void {
		if (this.svg.select('.fr-graph-curve-container').empty()) {
			this.curveGroup = this.svg
				.append('g')
				.attr('class', 'fr-graph-curve-container')
				.attr('transform', 'translate(0,0)')
				.attr('fill', 'none')
				.attr('mask', 'url(#blur-fade-mask)');
		}
	}

	/** Draw FR Curve */
	drawFRCurve(uuid: string): void {
		this.eraseFRCurve(uuid);

		const object = frStore.get(uuid);
		if (!object) return;

		if (object.type === 'phone') {
			this._drawPhoneCurve(object);
		} else if (object.type === 'target') {
			this._drawTargetCurve(object);
		} else {
			this._drawUnknownCurve(object);
		}

		if (object.yOffset) {
			this.applyYOffset(uuid, object.yOffset);
		}
	}

	/** Draw Phone curve */
	_drawPhoneCurve(obj: FRDataObject): void {
		const channels = [...obj.dispChannel];
		const baseThickness = parseFloat(
			(getConfigValue('TRACE_STYLING.PHONE_TRACE_THICKNESS') as string) || '2'
		);

		// Draw HpTF deviation fill (behind everything)
		if (obj.hptf && obj.hptfFillVisible) {
			const fillPath = this._buildHpTFEnvelopePath(obj);
			if (fillPath) {
				const color = obj.colors.hptfStroke ?? obj.colors.AVG;
				const fillColor = obj.colors.hptfFill ?? 'rgba(128,128,128,0.3)';
				this.curveGroup
					.insert('path', ':first-child')
					.attr('class', 'fr-graph-phone-curve fr-graph-hptf-fill')
					.attr('uuid', obj.uuid)
					.attr('type', obj.type)
					.attr('identifier', obj.identifier)
					.attr('d', fillPath)
					.attr('fill', fillColor)
					.attr('stroke', color)
					.attr('stroke-width', String(baseThickness / 2))
					.style('pointer-events', 'none');
			}
		}

		// Draw individual HpTF rig curves
		if (obj.hptf && obj.dispHptf?.length) {
			for (const key of obj.dispHptf) {
				const match = key.match(/^rig(\d+)_(L|R|AVG)$/);
				if (!match) continue;
				const rigIndex = parseInt(match[1]);
				const channel = match[2] as 'L' | 'R' | 'AVG';
				const rig = obj.hptf.rigs[rigIndex];
				if (!rig?.[channel]) continue;

				const color = obj.colors.AVG;

				this.curveGroup
					.append('path')
					.datum(() => FRSmoother.smooth(rig[channel]!.data))
					.attr('class', 'fr-graph-phone-curve fr-graph-hptf-rig-curve')
					.attr('uuid', obj.uuid)
					.attr('type', obj.type)
					.attr('channel', key)
					.attr('hptf-rig', 'true')
					.attr('identifier', obj.identifier)
					.attr('stroke', color)
					.attr('stroke-width', String(baseThickness))
					.attr('stroke-dasharray', obj.dash || '1 0')
					.attr('d', (d) => this._getCompensatedPath(d));
			}
		}

		// Draw main channels (skip if hptfOnly)
		if (!obj.hptfOnly) {
			channels.forEach((channel) => {
				this.curveGroup
					.append('path')
					.datum(() => FRSmoother.smooth(obj.channels[channel]!.data))
					.attr('class', 'fr-graph-phone-curve')
					.attr('uuid', obj.uuid)
					.attr('type', obj.type)
					.attr('channel', channel)
					.attr('identifier', obj.identifier)
					.attr('stroke', `${obj.colors[channel as 'L' | 'R' | 'AVG'] || obj.colors['AVG']}`)
					.attr('stroke-width', String(baseThickness))
					.attr('stroke-dasharray', obj.dash || '1 0')
					.attr('d', (d) => this._getCompensatedPath(d));
			});
		}

		// Draw sample traces (thin + transparent)
		if (obj.samples && obj.dispSamples?.length) {
			const sampleThickness = baseThickness * 0.6;

			for (const key of obj.dispSamples) {
				const match = key.match(/^([LR])(\d+)$/);
				if (!match) continue;
				const side = match[1] as 'L' | 'R';
				const sampleIndex = parseInt(match[2]) - 1;
				const sample = obj.samples[sampleIndex];
				if (!sample?.[side]) continue;

				this.curveGroup
					.append('path')
					.datum(() => FRSmoother.smooth(sample[side]!.data))
					.attr('class', 'fr-graph-phone-curve')
					.attr('uuid', obj.uuid)
					.attr('type', obj.type)
					.attr('channel', key)
					.attr('sample', 'true')
					.attr('identifier', obj.identifier)
					.attr('stroke', '#888')
					.attr('stroke-width', String(sampleThickness))
					.attr('stroke-dasharray', obj.dash || '1 0')
					.attr('opacity', '0.35')
					.attr('d', (d) => this._getCompensatedPath(d));
			}
		}
	}

	/** Draw Target curve */
	_drawTargetCurve(obj: FRDataObject): void {
		this.curveGroup
			.append('path')
			.datum(obj.channels['AVG']!.data)
			.attr('class', 'fr-graph-target-curve')
			.attr('uuid', obj.uuid)
			.attr('type', obj.type)
			.attr('identifier', obj.identifier)
			.attr('stroke', `${obj.colors['AVG'] || '#666'}`)
			.attr(
				'stroke-width',
				(getConfigValue('TRACE_STYLING.TARGET_TRACE_THICKNESS') as string) || '1'
			)
			.attr('stroke-dasharray', obj.dash || '4 4')
			.attr('d', (d) => this._getCompensatedPath(d));
	}

	/** Draw Unknown curve */
	_drawUnknownCurve(obj: FRDataObject): void {
		const channels = [...obj.dispChannel];

		channels.forEach((channel) => {
			this.curveGroup
				.append('path')
				.datum(() => FRSmoother.smooth(obj.channels[channel]!.data))
				.attr('class', `fr-graph-${obj.type}-curve`)
				.attr('uuid', obj.uuid)
				.attr('type', obj.type)
				.attr('channel', channel)
				.attr('identifier', obj.identifier)
				.attr('stroke', `${obj.colors[channel as 'L' | 'R' | 'AVG'] || obj.colors['AVG']}`)
				.attr(
					'stroke-width',
					obj.type === 'inserted-target'
						? ((getConfigValue('TRACE_STYLING.TARGET_TRACE_THICKNESS') as string) || '1')
						: ((getConfigValue('TRACE_STYLING.PHONE_TRACE_THICKNESS') as string) || '2')
				)
				.attr('stroke-dasharray', obj.dash || '1 0')
				.attr('d', (d) => this._getCompensatedPath(d));
		});
	}

	/** Erase FR Curve */
	eraseFRCurve(uuid: string): void {
		this.curveGroup.selectAll(`*[uuid="${uuid}"]`).remove();
	}

	/** Update X Axis of the graph */
	updateXAxis(transition = true): void {
		const tickValues = [
			20, 30, 40, 50, 60, 70, 80, 100, 200, 300, 400, 500, 600, 800, 1000, 2000, 3000, 4000, 5000,
			6000, 8000, 10000, 15000, 20000
		];
		const majorTickValues = new SvelteSet([80, 300, 1000, 4000, 6000, 10000]);

		const axis = this.svg.select<SVGGElement>('.fr-graph-x-axis');
		const gridGroups = axis
			.selectAll<SVGGElement, number>('.x-grid-group')
			.data(tickValues, (d) => d);

		gridGroups
			.exit()
			.transition()
			.duration(transition ? this.transitionDuration : 0)
			.style('opacity', 0)
			.remove();

		const enterGroups = gridGroups
			.enter()
			.append('g')
			.attr('class', 'x-grid-group')
			.attr('transform', (d) => `translate(${this.xScale(d)},0)`)
			.style('opacity', 0);

		this._createXAxisElements(enterGroups, majorTickValues);

		const allGroups = enterGroups.merge(gridGroups);

		allGroups
			.transition()
			.duration(transition ? this.transitionDuration : 0)
			.style('opacity', 1)
			.attr('transform', (d) => `translate(${this.xScale(d)},0)`);

		this.orderOverlayLayers();
	}

	/** Create X Axis elements (lines and text) */
	_createXAxisElements(
		selection: d3.Selection<SVGGElement, number, SVGGElement, unknown>,
		majorPoints: Set<number>
	): void {
		selection
			.append('line')
			.attr('class', (d) => (majorPoints.has(d) ? 'x-grid-line-major' : 'x-grid-line'))
			.attr('x1', 0)
			.attr('x2', 0)
			.attr('y1', this.graphGeometry.yBottom)
			.attr('y2', this.graphGeometry.yTop)
			.attr('stroke', (d) =>
				d === 20 || d === 20000 || majorPoints.has(d)
					? 'var(--color-graph-grid-major)'
					: 'var(--color-graph-grid-minor)'
			)
			.attr('stroke-width', (d) =>
				d === 20 || d === 20000 || majorPoints.has(d) ? 1 : 0.5
			);

		selection
			.append('text')
			.attr('class', (d) => (majorPoints.has(d) ? 'x-grid-text-major' : 'x-grid-text'))
			.attr('x', 0)
			.attr('y', this.graphGeometry.yBottom)
			.attr('dy', '11')
			.attr('font-size', '0.6rem')
			.attr('font-weight', (d) => (majorPoints.has(d) ? '500' : '300'))
			.attr('text-anchor', 'middle')
			.attr('fill', 'var(--color-graph-grid-text)')
			.text((d) => (d >= 1000 ? `${d / 1000}k` : d));
	}

	/** Update Y Axis of the graph */
	updateYAxis(
		oldYScale: d3.ScaleLinear<number, number> | null = null,
		transition = true
	): void {
		const yScale = this.yScale;
		const tickValues =
			this.yScaleValue < 60 ? yScale.ticks(this.yScaleValue) : yScale.ticks(this.yScaleValue / 5);

		const axis = this.svg.select<SVGGElement>('.fr-graph-y-axis');
		const gridGroups = axis
			.selectAll<SVGGElement, number>('.y-grid-group')
			.data(tickValues, (d) => d);

		gridGroups
			.exit()
			.transition()
			.duration(transition ? this.transitionDuration : 0)
			.style('opacity', 0)
			.remove();

		const enterGroups = gridGroups
			.enter()
			.append('g')
			.attr('class', 'y-grid-group')
			.attr('y', (d) => d)
			.style('opacity', 0);

		this._createYAxisElements(enterGroups, oldYScale || yScale);

		const allGroups = enterGroups.merge(gridGroups);

		allGroups
			.transition()
			.duration(transition ? this.transitionDuration : 0)
			.style('opacity', 1);

		allGroups
			.selectAll<SVGLineElement, number>('.y-grid-line, .y-grid-line-major')
			.transition()
			.duration(transition ? this.transitionDuration : 0)
			.attr('y1', (d) => yScale(d))
			.attr('y2', (d) => yScale(d));

		allGroups
			.selectAll<SVGTextElement, number>('.y-grid-text')
			.transition()
			.duration(transition ? this.transitionDuration : 0)
			.attr('y', (d) => yScale(d));

		let dbText = axis.select<SVGTextElement>('.y-grid-db-text');
		if (dbText.empty()) {
			dbText = axis.append('text').attr('class', 'y-grid-db-text').attr('transform', 'rotate(-90)').text('dB');
		}

		dbText
			.attr('x', -31)
			.attr('y', 15)
			.attr('dx', 4)
			.attr('dy', -4)
			.attr('font-size', '0.6rem')
			.attr('font-weight', '400')
			.attr('text-anchor', 'start')
			.attr('fill', 'var(--color-graph-grid-text)');

		this.orderOverlayLayers();
	}

	/** Create Y Axis elements (lines and text) */
	_createYAxisElements(
		selection: d3.Selection<SVGGElement, number, SVGGElement, unknown>,
		scale: d3.ScaleLinear<number, number>
	): void {
		selection
			.append('line')
			.attr('class', (d) => {
				const isMajor = d % 10 === 0;
				return isMajor ? 'y-grid-line' : 'y-grid-line-major';
			})
			.attr('x1', this.graphGeometry.xStart)
			.attr('x2', this.graphGeometry.xEnd)
			.attr('y1', (d) => scale(d))
			.attr('y2', (d) => scale(d))
			.attr('stroke', (d) => {
				const isMajor = d % 10 === 0;
				return isMajor ? 'var(--color-graph-grid-major)' : 'var(--color-graph-grid-minor)';
			})
			.attr('stroke-width', (d) => {
				const isMajor = d % 10 === 0;
				return isMajor ? 1 : 0.7;
			});

		selection.each((d, i, nodes) => {
			const isMajor = d % 10 === 0;
			if (isMajor) {
				d3.select(nodes[i])
					.append('text')
					.attr('class', 'y-grid-text')
					.attr('x', this.graphGeometry.xStart)
					.attr('y', scale(d))
					.attr('dx', 4)
					.attr('dy', -4)
					.attr('font-size', '0.6rem')
					.attr('font-weight', '400')
					.attr('text-anchor', 'start')
					.attr('fill', 'var(--color-graph-grid-text)')
					.text(d);
			}
		});
	}

	/** Draw fade gradient mask for the graph */
	_drawFadeGradient(): void {
		const defs = this.svg.append('defs');
		const ix = 20;
		const iy = 20;

		defs
			.append('mask')
			.attr('id', 'blur-fade-mask')
			.append('rect')
			.attr('x', ix)
			.attr('y', iy)
			.attr('width', this.viewBoxWidth - 2 * ix)
			.attr('height', this.viewBoxHeight - 2 * iy)
			.attr('fill', 'white')
			.attr('filter', 'blur(5px)');
	}

	/** Handle channel update for frequency response curves */
	channelUpdateRunner(uuid: string, type: string): void {
		this.curveGroup.selectAll(`.fr-graph-${type}-curve[uuid="${uuid}"]`).remove();
		const frData = frStore.get(uuid);
		if (!frData) return;
		if (type === 'phone') {
			this._drawPhoneCurve(frData);
		} else {
			this._drawUnknownCurve(frData);
		}
	}
}

export type { GraphEngine };
export const graphEngine = new GraphEngine();
