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
