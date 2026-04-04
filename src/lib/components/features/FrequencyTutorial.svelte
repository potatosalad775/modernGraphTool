<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';
  import { graphEngine } from '$lib/graph/GraphEngine.svelte.js';
	import ScrollArea from '../atoms/ScrollArea.svelte';
	import Button from '../atoms/Button.svelte';

  const FREQ_RANGES = [
    { key: 'sub_bass',    range: [20, 60]     as [number, number] },
    { key: 'bass',        range: [60, 250]    as [number, number] },
    { key: 'lower_mids',  range: [250, 1000]  as [number, number] },
    { key: 'upper_mids',  range: [1000, 4000] as [number, number] },
    { key: 'presence',    range: [4000, 6000]  as [number, number] },
    { key: 'brilliance',  range: [6000, 20000] as [number, number] },
  ] as const;

  function getRangeName(key: string): string {
    const names: Record<string, () => string> = {
      sub_bass:   m.tutorial_freq_sub_bass_name,
      bass:       m.tutorial_freq_bass_name,
      lower_mids: m.tutorial_freq_lower_mids_name,
      upper_mids: m.tutorial_freq_upper_mids_name,
      presence:   m.tutorial_freq_presence_name,
      brilliance: m.tutorial_freq_brilliance_name,
    };
    return names[key]?.() ?? key;
  }

  function getRangeDesc(key: string): string {
    const descs: Record<string, () => string> = {
      sub_bass:   m.tutorial_freq_sub_bass_desc,
      bass:       m.tutorial_freq_bass_desc,
      lower_mids: m.tutorial_freq_lower_mids_desc,
      upper_mids: m.tutorial_freq_upper_mids_desc,
      presence:   m.tutorial_freq_presence_desc,
      brilliance: m.tutorial_freq_brilliance_desc,
    };
    return descs[key]?.() ?? '';
  }

  let activeKey = $state<string | null>(null);

  function toggleRange(key: string): void {
    activeKey = activeKey === key ? null : key;
  }

  $effect(() => {
    if (!graphEngine.isInitialized || !graphEngine.svg) return;

    let highlight = graphEngine.svg.select<SVGRectElement>('.freq-tutorial-highlight');
    if (highlight.empty()) {
      highlight = graphEngine.svg.insert('rect', ':first-child')
        .attr('class', 'freq-tutorial-highlight')
        .attr('y', 15)
        .attr('height', 420)
        .attr('fill', 'currentColor')
        .attr('opacity', 0)
        .style('pointer-events', 'none');
    }

    if (activeKey === null) {
      highlight.attr('opacity', 0);
    } else {
      const range = FREQ_RANGES.find(r => r.key === activeKey);
      if (range) {
        const x0 = graphEngine.xScale(range.range[0]);
        const x1 = graphEngine.xScale(range.range[1]);
        highlight
          .attr('x', x0)
          .attr('width', x1 - x0)
          .attr('opacity', 0.08);
      }
    }

    return () => {
      graphEngine.svg?.select('.freq-tutorial-highlight').attr('opacity', 0);
    };
  });
</script>

<div class="flex flex-col">
  <!-- Button row: horizontally scrollable -->
  <ScrollArea 
    orientation="horizontal" type="always"
    viewportClasses="flex gap-2 w-full"
  >
    <div class="flex gap-1.5 px-3 py-2">
      {#each FREQ_RANGES as { key } (key)}
        <Button
          onclick={() => toggleRange(key)}
          variant={activeKey === key ? 'primary' : 'secondary'}
        >
          {getRangeName(key)}
        </Button>
      {/each}
    </div>
  </ScrollArea>

  <!-- Description panel: only shown when a range is active -->
  {#if activeKey !== null}
    <div class="rounded-md bg-base-300 px-3 py-2 text-xs text-base-content/60">
      {getRangeDesc(activeKey)}
    </div>
  {/if}
</div>
