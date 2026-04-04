<script lang="ts">
	let {
		class: className = '',
		width = '100%',
		height = '1rem'
	}: {
		class?: string;
		width?: string;
		height?: string;
	} = $props();
</script>

<div
	class="animate-pulse rounded bg-base-content/10 {className}"
	style:width
	style:height
	role="status"
	aria-label="Loading"
></div>
