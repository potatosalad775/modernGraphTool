<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { preferenceBoundStore } from '$lib/stores/preference-bound-store.svelte.js';
	import Button from '../atoms/Button.svelte';

	// Visibility, data loading and overlay rendering all live outside this component
	// (preference-bound-store + GraphContainer) so they survive this button being
	// unmounted — on mobile it sits inside a collapsible accordion.
</script>

{#if preferenceBoundStore.isEnabled}
	<Button
		title={m.pref_bound_btn_label()}
		onclick={() => preferenceBoundStore.toggle()}
		variant={preferenceBoundStore.isVisible ? 'primary' : 'outline'}
		size="toolbar"
	>
		{m.pref_bound_btn_label()}
	</Button>
{/if}
