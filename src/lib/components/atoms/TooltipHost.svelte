<script lang="ts">
	import { Tooltip } from 'bits-ui';
	import { tooltipTether } from './tooltip-tether.js';
</script>

<!--
	The one tooltip root; every `Tooltip` trigger reaches it through `tooltipTether`.
	300 ms is short enough to read as immediate without a toolbar row flashing tooltips as
	the pointer crosses it, and the skip window makes the next button open with no delay.
	Touch never opens a tooltip (bits-ui ignores touch pointers), so nothing may live only here.
-->
<Tooltip.Provider delayDuration={300} skipDelayDuration={400}>
	<Tooltip.Root tether={tooltipTether}>
		{#snippet children({ payload })}
			<Tooltip.Portal>
				<Tooltip.Content
					role="tooltip"
					side="bottom"
					align="center"
					sideOffset={6}
					collisionPadding={8}
					class="z-60 max-w-64 rounded-md bg-neutral px-2 py-1 text-xs text-pretty text-neutral-content shadow-md ring-1 ring-base-content/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none"
				>
					<p class="font-medium">{payload?.text}</p>
					{#if payload?.hint}
						<p class="mt-0.5 text-neutral-content/80">{payload.hint}</p>
					{/if}
				</Tooltip.Content>
			</Tooltip.Portal>
		{/snippet}
	</Tooltip.Root>
</Tooltip.Provider>
