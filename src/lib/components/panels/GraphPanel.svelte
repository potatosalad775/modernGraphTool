<script lang="ts">
	import { appStore } from '$lib/stores/app-store.svelte';
	import GraphToolbar from '$lib/components/controls/GraphToolbar.svelte';
	import TargetSelector from '$lib/components/controls/TargetSelector.svelte';
	import SelectionList from '$lib/components/controls/SelectionList.svelte';
	import Accordion from '../atoms/Accordion.svelte';
	import AccordionItem from '../atoms/AccordionItem.svelte';
	import * as m from '$lib/paraglide/messages.js';
</script>

<div class="flex h-full flex-col overflow-hidden">
	<!-- Button row: only in mobile (desktop shows it under the graph) -->
	{#if appStore.isMobile}
		<Accordion type="single" class="border-b border-base-content/15 bg-base-200 p-1">
			<AccordionItem title={m.graph_controls_label()}>
				<GraphToolbar />
			</AccordionItem>
		</Accordion>
	{/if}
	<!-- Target selector -->
	<div class="border-b border-base-content/15 bg-base-200 p-1">
		<TargetSelector />
	</div>
	<!-- Selection list: takes remaining space, scrollable -->
	<SelectionList />
</div>
