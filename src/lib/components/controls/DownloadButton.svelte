<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { dataProvider } from '#lib/services/data-provider.svelte.js';
	import type { FRDataObject } from '#lib/types/data-types.js';
	import { Download } from '@lucide/svelte';
	import PopoverPanel from '#lib/components/atoms/PopoverPanel.svelte';
	import Button from '../atoms/Button.svelte';

	let { uuid, item }: { uuid: string; item: FRDataObject } = $props();

	// A plain curve has nothing to choose, so it stays one click. A sample set
	// asks whether to take the runs too: `channels` holds only their average,
	// and that average was all this button used to export.
	let hasRuns = $derived((item.samples?.length ?? 0) > 0);
	let open = $state(false);

	const options = [
		{
			runs: false,
			label: m.selection_list_download_average(),
			hint: m.selection_list_download_average_hint()
		},
		{
			runs: true,
			label: m.selection_list_download_all(),
			hint: m.selection_list_download_all_hint()
		}
	];

	function download(runs: boolean): void {
		open = false;
		void dataProvider.downloadFRDataWithUUID(uuid, { runs });
	}
</script>

{#if hasRuns}
	<PopoverPanel bind:open align="end" contentClass="flex w-60 flex-col gap-0.5">
		{#snippet trigger({ props })}
			<Button
				{...props}
				title={m.selection_list_download()}
				variant="ghost"
				size="icon"
				activeOnOpen
			>
				<Download class="h-4 w-4" aria-hidden="true" />
			</Button>
		{/snippet}

		{#each options as option (option.runs)}
			<!-- Named by the label alone; the line under it rides on aria-describedby -->
			<Button
				label={option.label}
				aria-label={option.label}
				onclick={() => download(option.runs)}
				aria-describedby="{uuid}-download-{option.runs ? 'all' : 'average'}"
				variant="ghost"
				size="sm"
				class="flex-col items-start gap-0 px-2 py-1.5 text-left text-sm font-normal"
			>
				<span
					id="{uuid}-download-{option.runs ? 'all' : 'average'}"
					class="text-xs text-base-content/60">{option.hint}</span
				>
			</Button>
		{/each}
	</PopoverPanel>
{:else}
	<Button
		title={m.selection_list_download()}
		onclick={() => download(false)}
		variant="ghost"
		size="icon"
	>
		<Download class="h-4 w-4" aria-hidden="true" />
	</Button>
{/if}
