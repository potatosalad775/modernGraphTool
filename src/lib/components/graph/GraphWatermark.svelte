<script lang="ts">
	import { graphEngine } from '$lib/graph/GraphEngine.svelte.js';
	import { getConfigValue } from '$lib/utils/config.js';

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

	const positionData = $derived(graphEngine.labelPosition);

	const rigDescription =
		(getConfigValue('VISUALIZATION.RIG_DESCRIPTION') as string) ||
		'Measured with IEC 60318-4 (711)';
	const rigFontPx = 14;

	const watermarkData = (getConfigValue('WATERMARK') as WatermarkObject[]) || [];

	function resolvePosition(watermarkObj: WatermarkObject) {
		const loc = watermarkObj.LOCATION || 'CENTER';
		const basePos = positionData[loc] || positionData['CENTER'];
		const offsetX = watermarkObj.POSITION
			? (watermarkObj.POSITION.RIGHT ?? 0) - (watermarkObj.POSITION.LEFT ?? 0)
			: 0;
		const offsetY = watermarkObj.POSITION
			? (watermarkObj.POSITION.DOWN ?? 0) - (watermarkObj.POSITION.UP ?? 0)
			: 0;
		return {
			x: basePos.x + offsetX,
			y: basePos.y + offsetY,
			anchor: basePos.anchor,
			growUp: basePos.growUp
		};
	}

	function resolveContent(content: string | string[] | undefined): string {
		if (Array.isArray(content)) {
			return content[Math.floor(Math.random() * content.length)];
		}
		return content || '';
	}
</script>

<!-- Rig description: anchored to TOP_RIGHT, baseline pushed inside the graph area -->
{#if rigDescription}
	<text
		class="rig-description"
		x={positionData.TOP_RIGHT.x - 32}
		y={positionData.TOP_RIGHT.y + rigFontPx + 39}
		font-size="{rigFontPx}px"
		font-weight="500"
		text-anchor={positionData.TOP_RIGHT.anchor}
		fill="var(--color-base-content)"
		opacity="0.3"
		filter="var(--watermark-text-filter)">{rigDescription}</text
	>
{/if}

<!-- Custom watermarks -->
<g class="watermark-group">
	{#each watermarkData as watermarkObj (watermarkObj.CONTENT)}
		{@const pos = resolvePosition(watermarkObj)}
		{#if watermarkObj.TYPE === 'IMAGE'}
			<image
				class="watermark-image"
				x={pos.x}
				y={pos.y}
				width={watermarkObj.SIZE || '100px'}
				opacity={watermarkObj.OPACITY || '0.3'}
				href={resolveContent(watermarkObj.CONTENT)}
			/>
		{:else if watermarkObj.TYPE === 'TEXT'}
			<text
				class="watermark-text"
				x={pos.x}
				y={pos.y}
				font-size={watermarkObj.SIZE || '20px'}
				font-weight={watermarkObj.FONT_WEIGHT || '500'}
				font-family={watermarkObj.FONT_FAMILY || ''}
				text-anchor={pos.anchor}
				fill={watermarkObj.COLOR || 'var(--color-base-content)'}
				opacity={watermarkObj.OPACITY || '0.3'}
				filter="var(--watermark-text-filter)">{resolveContent(watermarkObj.CONTENT)}</text
			>
		{/if}
	{/each}
</g>
