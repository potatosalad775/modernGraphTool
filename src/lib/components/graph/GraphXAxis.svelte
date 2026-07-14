<script lang="ts">
	const X_TICK_VALUES = [
		20, 30, 40, 50, 60, 70, 80, 100, 200, 300, 400, 500, 600, 800, 1000, 2000, 3000, 4000, 5000,
		6000, 8000, 10000, 15000, 20000
	];
	const MAJOR_TICKS = new Set([80, 300, 1000, 4000, 6000, 10000]);

	let {
		xScale,
		yTop,
		yBottom
	}: {
		xScale: (freq: number) => number;
		yTop: number;
		yBottom: number;
	} = $props();

	function isMajor(d: number): boolean {
		return d === 20 || d === 20000 || MAJOR_TICKS.has(d);
	}

	function formatTick(d: number): string {
		return d >= 1000 ? `${d / 1000}k` : String(d);
	}
</script>

<g class="fr-graph-x-axis">
	{#each X_TICK_VALUES as tick (tick)}
		<g class="x-grid-group" transform="translate({xScale(tick)},0)">
			<line
				class={MAJOR_TICKS.has(tick) ? 'x-grid-line-major' : 'x-grid-line'}
				x1={0}
				x2={0}
				y1={yBottom}
				y2={yTop}
				stroke={isMajor(tick) ? 'var(--color-graph-grid-major)' : 'var(--color-graph-grid-minor)'}
				stroke-width={isMajor(tick) ? 1 : 0.5}
			/>
			<text
				class={MAJOR_TICKS.has(tick) ? 'x-grid-text-major' : 'x-grid-text'}
				x={0}
				y={yBottom}
				dy="11"
				font-size="0.6rem"
				font-weight={MAJOR_TICKS.has(tick) ? '500' : '300'}
				text-anchor="middle"
				fill="var(--color-graph-grid-text)">{formatTick(tick)}</text
			>
		</g>
	{/each}
</g>
