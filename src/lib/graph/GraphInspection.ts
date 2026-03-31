import * as d3 from 'd3';
import type { FRDataPoint } from '$lib/types/data-types.js';
import { frStore } from '$lib/stores/fr-store.svelte.js';
import type { GraphEngine } from './GraphEngine.svelte.js';

class GraphInspection {
	graphEngine: GraphEngine;
	isEnabled: boolean;
	verticalLine!: d3.Selection<SVGLineElement, unknown, null, undefined>;
	inspectionGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
	valueDisplay!: d3.Selection<SVGGElement, unknown, null, undefined>;
	bisector: (array: ArrayLike<FRDataPoint>, x: number, lo?: number, hi?: number) => number;
	frequencyText!: d3.Selection<SVGTextElement, unknown, null, undefined>;
	mouseTracker: d3.Selection<SVGRectElement, unknown, null, undefined> | null;

	constructor(graphEngine: GraphEngine) {
		this.graphEngine = graphEngine;
		this.isEnabled = false;
		this.mouseTracker = null;
		this.bisector = d3.bisector<FRDataPoint, number>((d) => d[0]).left;

		this._setupInspectionElements();
	}

	_setupInspectionElements() {
		this.inspectionGroup = this.graphEngine.svg
			.append('g')
			.attr('class', 'fr-graph-inspection')
			.style('pointer-events', 'none')
			.style('display', 'none');

		this.verticalLine = this.inspectionGroup
			.append('line')
			.attr('class', 'inspection-line')
			.attr('y1', this.graphEngine.graphGeometry.yTop)
			.attr('y2', this.graphEngine.graphGeometry.yBottom)
			.attr('stroke', 'var(--color-foreground)')
			.attr('stroke-width', 1)
			.attr('stroke-dasharray', '2,2')
			.attr('opacity', 0.7);

		this.valueDisplay = this.inspectionGroup.append('g').attr('class', 'inspection-values');

		this.frequencyText = this.inspectionGroup
			.append('text')
			.attr('class', 'inspection-frequency')
			.attr('y', this.graphEngine.graphGeometry.yBottom - 15)
			.attr('text-anchor', 'middle')
			.attr('font-size', '16px')
			.attr('font-weight', 'bold')
			.attr('fill', 'var(--color-foreground)');
	}

	/** Called by GraphPanel component to toggle inspection mode */
	setEnabled(enabled: boolean) {
		this.isEnabled = enabled;

		if (enabled) {
			this._enableMouseTracking();
			this._hideLabels();
			this.inspectionGroup.style('display', 'block');
		} else {
			this._disableMouseTracking();
			this._showLabels();
			this.inspectionGroup.style('display', 'none');
		}
	}

	_enableMouseTracking() {
		this.mouseTracker = this.graphEngine.svg
			.append('rect')
			.attr('class', 'mouse-tracker')
			.attr('x', this.graphEngine.graphGeometry.xStart)
			.attr('y', this.graphEngine.graphGeometry.yTop)
			.attr('width', this.graphEngine.graphGeometry.xEnd - this.graphEngine.graphGeometry.xStart)
			.attr('height', this.graphEngine.graphGeometry.yBottom - this.graphEngine.graphGeometry.yTop)
			.attr('fill', 'none')
			.attr('pointer-events', 'all')
			.style('cursor', 'crosshair');

		this.mouseTracker
			.on('mousemove', (event) => this._onMouseMove(event))
			.on('mouseleave', () => this._onMouseLeave());
	}

	_disableMouseTracking() {
		if (this.mouseTracker) {
			this.mouseTracker.remove();
			this.mouseTracker = null;
		}
	}

	_onMouseMove(event: MouseEvent) {
		const [mouseX] = d3.pointer(event);
		const frequency = this.graphEngine.xScale.invert(mouseX);

		this.verticalLine.attr('x1', mouseX).attr('x2', mouseX);
		this._updateFrequencyDisplay(frequency, mouseX);
		this._updateValueDisplays(frequency, mouseX);
	}

	_onMouseLeave() {
		this.inspectionGroup.style('opacity', 0.7);
	}

	_updateFrequencyDisplay(frequency: number, mouseX: number) {
		const frequencyString =
			frequency >= 1000 ? `${(frequency / 1000).toFixed(1)}kHz` : `${Math.round(frequency)}Hz`;

		const textWidth = frequencyString.length * 10;
		const halfTextWidth = textWidth / 2;

		let textX = mouseX;
		let textAnchor = 'middle';

		if (mouseX + halfTextWidth > this.graphEngine.graphGeometry.xEnd) {
			textX = mouseX - 10;
			textAnchor = 'end';
		} else if (mouseX - halfTextWidth < this.graphEngine.graphGeometry.xStart) {
			textX = mouseX + 10;
			textAnchor = 'start';
		}

		this.frequencyText.attr('x', textX).attr('text-anchor', textAnchor).text(frequencyString);
	}

	_updateValueDisplays(frequency: number, mouseX: number) {
		this.valueDisplay.selectAll('*').remove();

		let yOffset = 0;
		const lineHeight = 18;

		const deviceListData: {
			displayText: string;
			textWidth: number;
			color: string;
			yOffset: number;
		}[] = [];

		let maxTextWidth = 0;
		Array.from(frStore.entries)
			.filter(([, obj]) => !obj.hidden)
			.sort(([, a], [, b]) => (a.type === 'target' ? -1 : 1))
			.forEach(([, obj]) => {
				const channels = obj.type === 'target' ? ['AVG'] : [...obj.dispChannel];

				channels.forEach((channel) => {
					const channelData = obj.channels[channel as keyof typeof obj.channels]?.data;
					if (!channelData) return;

					const splValue = this._interpolateSPL(channelData, frequency);
					if (splValue === null) return;

					const compensatedSPL = this._applyBaselineCompensation(splValue, frequency);

					const displayName =
						obj.type !== 'target' ? `${obj.identifier} (${channel})` : obj.identifier;
					const displayText = `${displayName}: ${compensatedSPL.toFixed(1)}dB`;
					const textWidth = displayText.length * 9 + 50;
					maxTextWidth = Math.max(maxTextWidth, textWidth);

					deviceListData.push({
						displayText,
						textWidth,
						color:
							obj.colors[channel as 'L' | 'R' | 'AVG'] || obj.colors?.AVG || 'var(--color-foreground-secondary)',
						yOffset
					});

					yOffset += lineHeight;
				});

				// Sample trace values
				if (obj.samples && obj.dispSamples?.length) {
					for (const key of obj.dispSamples) {
						const match = key.match(/^([LR])(\d+)$/);
						if (!match) continue;
						const side = match[1] as 'L' | 'R';
						const sampleIndex = parseInt(match[2]) - 1;
						const sample = obj.samples[sampleIndex];
						const sampleData = sample?.[side]?.data;
						if (!sampleData) continue;

						const splValue = this._interpolateSPL(sampleData, frequency);
						if (splValue === null) continue;

						const compensatedSPL = this._applyBaselineCompensation(splValue, frequency);
						const displayText = `  ${obj.identifier} (${key}): ${compensatedSPL.toFixed(1)}dB`;
						const textWidth = displayText.length * 9 + 50;
						maxTextWidth = Math.max(maxTextWidth, textWidth);

						deviceListData.push({
							displayText,
							textWidth,
							color: obj.colors.samples?.[key] || obj.colors[side] || obj.colors.AVG || 'var(--color-foreground-secondary)',
							yOffset
						});

						yOffset += lineHeight;
					}
				}
			});

		const listPadding = 15;
		const rightEdgeSpace = this.graphEngine.graphGeometry.xEnd - mouseX;
		const leftEdgeSpace = mouseX - this.graphEngine.graphGeometry.xStart;

		let listX: number;
		let textAnchor: string;

		if (rightEdgeSpace >= maxTextWidth + listPadding) {
			listX = mouseX + listPadding;
			textAnchor = 'start';
		} else if (leftEdgeSpace >= maxTextWidth + listPadding) {
			listX = mouseX - listPadding;
			textAnchor = 'end';
		} else if (rightEdgeSpace > leftEdgeSpace) {
			listX = mouseX + 10;
			textAnchor = 'start';
		} else {
			listX = mouseX - 10;
			textAnchor = 'end';
		}

		deviceListData.forEach((item) => {
			const valueGroup = this.valueDisplay
				.append('g')
				.attr(
					'transform',
					`translate(${listX}, ${this.graphEngine.graphGeometry.yTop + 32 + item.yOffset})`
				);

			let rectX: number;
			const rectWidth = item.textWidth;
			if (textAnchor === 'start') {
				rectX = -5;
			} else {
				rectX = -item.textWidth + 5;
			}

			valueGroup
				.append('rect')
				.attr('x', rectX)
				.attr('y', -16)
				.attr('width', rectWidth)
				.attr('height', 18)
				.attr('fill', 'var(--color-surface-raised)')
				.attr('rx', 2)
				.attr('opacity', 0.7);

			valueGroup
				.append('text')
				.attr('x', 0)
				.attr('y', -2)
				.attr('text-anchor', textAnchor)
				.attr('font-size', '16px')
				.attr('font-weight', '500')
				.attr('fill', item.color)
				.text(item.displayText);
		});

		this.inspectionGroup.style('opacity', 1);
	}

	_interpolateSPL(channelData: [number, number][], frequency: number): number | null {
		if (!channelData || channelData.length === 0) return null;

		const i = this.bisector(channelData, frequency);
		const a = channelData[i - 1];
		const b = channelData[i];

		if (a && b) {
			const t = (frequency - a[0]) / (b[0] - a[0]);
			return a[1] + t * (b[1] - a[1]);
		} else if (a) {
			return a[1];
		} else if (b) {
			return b[1];
		}

		return null;
	}

	_applyBaselineCompensation(splValue: number, frequency: number): number {
		const baselineData = this.graphEngine.getBaselineData();

		if (!baselineData.channelData || baselineData.channelData.length === 0) {
			return splValue;
		}

		const baselineSPL = this._interpolateSPL(baselineData.channelData, frequency);
		if (baselineSPL === null) return splValue;

		return splValue - baselineSPL;
	}

	_hideLabels() {
		this.graphEngine.svg.selectAll('.fr-graph-label, .fr-graph-label-bg').style('display', 'none');
	}

	_showLabels() {
		this.graphEngine.svg.selectAll('.fr-graph-label, .fr-graph-label-bg').style('display', 'block');
	}

	onLabelsUpdated() {
		if (this.isEnabled) {
			this._hideLabels();
		}
	}

	destroy() {
		this._disableMouseTracking();
		if (this.inspectionGroup) {
			this.inspectionGroup.remove();
		}
	}
}

export default GraphInspection;
