<script lang="ts">
	import NormalizerInput from '$lib/components/controls/NormalizerInput.svelte';
	import SmoothingButton from '$lib/components/controls/SmoothingButton.svelte';
	import YAxisScaleButton from '$lib/components/controls/YAxisScaleButton.svelte';
	import InspectionToggle from '$lib/components/controls/InspectionToggle.svelte';
	import ScreenshotButton from '$lib/components/controls/ScreenshotButton.svelte';
	import ShareButton from '$lib/components/controls/ShareButton.svelte';
	import PreferenceBound from '$lib/components/features/PreferenceBound.svelte';
	import ShopLink from '$lib/components/features/ShopLink.svelte';
</script>

<div
	class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-border px-3 py-2 border-border"
>
	<!-- Data controls: normalization, smoothing, scale -->
	<div class="flex flex-wrap items-center gap-2">
		<NormalizerInput />
		<SmoothingButton />
		<YAxisScaleButton />
	</div>
	<!-- Graph features: preference bound, inspection -->
	<div class="flex flex-wrap items-center gap-2">
		<PreferenceBound />
		<InspectionToggle />
	</div>
	<!-- Actions: screenshot, share, shop -->
	<div class="flex flex-wrap items-center gap-2">
		<ScreenshotButton />
		<ShareButton />
		<ShopLink />
	</div>
</div>
