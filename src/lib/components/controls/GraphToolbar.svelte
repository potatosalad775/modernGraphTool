<script lang="ts">
	import NormalizerInput from '$lib/components/controls/NormalizerInput.svelte';
	import SmoothingButton from '$lib/components/controls/SmoothingButton.svelte';
	import YAxisScaleButton from '$lib/components/controls/YAxisScaleButton.svelte';
	import InspectionToggle from '$lib/components/controls/InspectionToggle.svelte';
	import FrequencyTutorialToggle from '$lib/components/controls/FrequencyTutorialToggle.svelte';
	import AverageButton from '$lib/components/controls/AverageButton.svelte';
	import ScreenshotButton from '$lib/components/controls/ScreenshotButton.svelte';
	import ShareButton from '$lib/components/controls/ShareButton.svelte';
	import PreferenceBound from '$lib/components/features/PreferenceBound.svelte';
	import ShopLink from '$lib/components/features/ShopLink.svelte';
</script>

<div class="flex flex-wrap items-center justify-center gap-2 px-3 py-2">
	<!-- Data controls: normalization, smoothing, scale -->
	<NormalizerInput />
	<SmoothingButton />
	<YAxisScaleButton />
	<!-- Graph features: preference bound, inspection, frequency guide -->
	<PreferenceBound />
	<InspectionToggle />
	<FrequencyTutorialToggle />
	<!-- Actions: average, screenshot, share, shop -->
	<AverageButton />
	<ScreenshotButton />
	<ShareButton />
	<ShopLink />
</div>
