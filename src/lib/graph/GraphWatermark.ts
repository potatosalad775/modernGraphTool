import * as d3 from 'd3';
import { getConfigValue } from '$lib/utils/config';

interface WatermarkObject {
	LOCATION?: string;
	POSITION?: { RIGHT?: number; LEFT?: number; DOWN?: number; UP?: number };
	TYPE?: string;
	SIZE?: string;
	OPACITY?: string | number;
	CONTENT?: string | string[];
	COLOR?: string;
	FONT_WEIGHT?: string;
	FONT_FAMILY?: string;
}

type WatermarkPositionData = Record<string, { x: number; y: number; anchor: string }>;

const GraphWatermark = (
	svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
	viewBoxWidth = 800,
	viewBoxHeight = 450
) => {
	const watermarkPositionData: WatermarkPositionData = {
		BOTTOM_LEFT: { x: 50, y: viewBoxHeight - 50, anchor: 'start' },
		BOTTOM_RIGHT: { x: viewBoxWidth - 46, y: viewBoxHeight - 50, anchor: 'end' },
		TOP_LEFT: { x: 50, y: 70, anchor: 'start' },
		TOP_RIGHT: { x: viewBoxWidth - 46, y: 70, anchor: 'end' },
		CENTER: { x: viewBoxWidth / 2, y: Math.round(viewBoxHeight * 0.61), anchor: 'middle' }
	};

	// Display Rig Description
	const rigDescription =
		(getConfigValue('VISUALIZATION.RIG_DESCRIPTION') as string) ||
		'Measured with IEC 60318-4 (711)';
	if (rigDescription) {
		svg
			.append('text')
			.attr('class', 'rig-description')
			.attr('x', watermarkPositionData['TOP_RIGHT'].x)
			.attr('y', watermarkPositionData['TOP_RIGHT'].y - 8)
			.attr('font-size', '15px')
			.attr('font-weight', '500')
			.attr('text-anchor', watermarkPositionData['TOP_RIGHT'].anchor)
			.attr('fill', 'var(--color-base-content)')
			.attr('opacity', '0.3')
			.attr('filter', 'var(--watermark-text-filter)')
			.text(rigDescription);
	}

	// Draw Custom Watermark
	const watermarkData = (getConfigValue('WATERMARK') as WatermarkObject[]) || [];

	const watermarkGroup = svg
		.append('g')
		.attr('class', 'watermark-group')
		.attr('transform', 'translate(0, 0)');

	watermarkData.forEach((watermarkObj: WatermarkObject) => {
		const loc = watermarkObj.LOCATION || 'CENTER';
		const basePos = watermarkPositionData[loc] || watermarkPositionData['CENTER'];
		const position = {
			x:
				basePos.x +
				(watermarkObj.POSITION ? (watermarkObj.POSITION.RIGHT ?? 0) - (watermarkObj.POSITION.LEFT ?? 0) : 0),
			y:
				basePos.y +
				(watermarkObj.POSITION ? (watermarkObj.POSITION.DOWN ?? 0) - (watermarkObj.POSITION.UP ?? 0) : 0),
			anchor: basePos.anchor
		};

		if (watermarkObj.TYPE === 'IMAGE') {
			watermarkGroup
				.append('image')
				.attr('class', 'watermark-image')
				.attr('x', position.x)
				.attr('y', position.y)
				.attr('width', watermarkObj.SIZE || '100px')
				.attr('opacity', watermarkObj.OPACITY || '0.3')
				.attr(
					'href',
					Array.isArray(watermarkObj.CONTENT)
						? watermarkObj.CONTENT[Math.floor(Math.random() * watermarkObj.CONTENT.length)]
						: watermarkObj.CONTENT || ''
				);
		} else if (watermarkObj.TYPE === 'TEXT') {
			watermarkGroup
				.append('text')
				.attr('class', 'watermark-text')
				.attr('x', position.x)
				.attr('y', position.y)
				.attr('font-size', watermarkObj.SIZE || '20px')
				.attr('font-weight', watermarkObj.FONT_WEIGHT || '500')
				.attr('font-family', watermarkObj.FONT_FAMILY || '')
				.attr('text-anchor', position.anchor)
				.attr('fill', watermarkObj.COLOR || 'var(--color-base-content)')
				.attr('opacity', watermarkObj.OPACITY || '0.3')
				.attr('filter', 'var(--watermark-text-filter)')
				.text(
					Array.isArray(watermarkObj.CONTENT)
						? watermarkObj.CONTENT[Math.floor(Math.random() * watermarkObj.CONTENT.length)]
						: watermarkObj.CONTENT || ''
				);
		}
	});
};

export default GraphWatermark;
