<script lang="ts">
	import { appStore } from '$lib/stores/app-store.svelte';
	import GraphToolbar from '$lib/components/controls/GraphToolbar.svelte';
	import TargetSelector from '$lib/components/controls/TargetSelector.svelte';
	import SelectionList from '$lib/components/controls/SelectionList.svelte';
</script>

<div class="flex h-full flex-col overflow-hidden">
	<!-- Button row: only in mobile (desktop shows it under the graph) -->
	{#if appStore.isMobile}
		<GraphToolbar />
	{/if}
	<!-- Target selector -->
	<div class="border-b border-base-content/15 p-1">
		<TargetSelector />
	</div>
	<!-- Selection list: takes remaining space, scrollable -->
	<SelectionList />
</div>
