<script lang="ts">
	import PhoneSelector from '$lib/components/controls/PhoneSelector.svelte';
	import CrossSiteSearch from '$lib/components/features/CrossSiteSearch.svelte';
</script>

<div class="flex h-full flex-col overflow-hidden">
	<div class="min-h-0 flex-1 overflow-y-auto">
		<PhoneSelector />
	</div>
	<CrossSiteSearch />
</div>
