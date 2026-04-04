<script lang="ts">
	import { appStore } from '$lib/stores/app-store.svelte';
	import GraphToolbar from '$lib/components/controls/GraphToolbar.svelte';
	import TargetSelector from '$lib/components/controls/TargetSelector.svelte';
	import SelectionList from '$lib/components/controls/SelectionList.svelte';
	import FrequencyTutorial from '$lib/components/features/FrequencyTutorial.svelte';
</script>

<div class="flex h-full flex-col overflow-hidden">
	<!-- Button row: only in mobile (desktop shows it under the graph) -->
	{#if appStore.isMobile}
		<GraphToolbar />
	{/if}
	<!-- Frequency tutorial buttons + description -->
	<div class="border-b border-base-content/15">
		<FrequencyTutorial />
	</div>
	<!-- Target selector -->
	<div class="border-b border-base-content/15 px-3 py-2 border-base-content/15">
		<TargetSelector />
	</div>
	<!-- Selection list: takes remaining space, scrollable -->
	<div class="min-h-0 flex-1 overflow-y-auto">
		<SelectionList />
	</div>
</div>
