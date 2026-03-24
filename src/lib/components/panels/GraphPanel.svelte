<script lang="ts">
	import TargetSelector from '$lib/components/controls/TargetSelector.svelte';
	import SelectionList from '$lib/components/controls/SelectionList.svelte';
	import NormalizerInput from '$lib/components/controls/NormalizerInput.svelte';
	import SmoothingButton from '$lib/components/controls/SmoothingButton.svelte';
	import YAxisScaleButton from '$lib/components/controls/YAxisScaleButton.svelte';
	import InspectionToggle from '$lib/components/controls/InspectionToggle.svelte';
	import ScreenshotButton from '$lib/components/controls/ScreenshotButton.svelte';
	import ShareButton from '$lib/components/controls/ShareButton.svelte';
	import PreferenceBound from '$lib/components/features/PreferenceBound.svelte';
	import FrequencyTutorial from '$lib/components/features/FrequencyTutorial.svelte';
	import ShopLink from '$lib/components/features/ShopLink.svelte';
</script>

<div class="flex h-full flex-col overflow-hidden">
	<!-- Button row: wrapping flex of graph controls -->
	<div
		class="flex flex-wrap items-center justify-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700"
	>
		<NormalizerInput />
		<SmoothingButton />
		<YAxisScaleButton />
		<PreferenceBound />
		<InspectionToggle />
		<ScreenshotButton />
		<ShareButton />
		<ShopLink />
	</div>
	<!-- Frequency tutorial buttons + description -->
	<div class="border-b border-zinc-200 dark:border-zinc-700">
		<FrequencyTutorial />
	</div>
	<!-- Target selector -->
	<div class="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
		<TargetSelector />
	</div>
	<!-- Selection list: takes remaining space, scrollable -->
	<div class="min-h-0 flex-1 overflow-y-auto">
		<SelectionList />
	</div>
</div>
