<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';

	let {
		class: className = '',
		width = '100%',
		height = '1rem',
		status = false
	}: {
		class?: string;
		width?: string;
		height?: string;
		/**
		 * Makes this skeleton the one live region for its loading group (`role="status"` plus the
		 * "Loading" label). Without it the skeleton is decorative and hidden from assistive tech,
		 * so a list of twenty announces once, not twenty times: set it on one skeleton per group.
		 */
		status?: boolean;
	} = $props();
</script>

<div
	class="animate-pulse rounded bg-base-content/10 {className}"
	style:width
	style:height
	role={status ? 'status' : undefined}
	aria-label={status ? m.skeleton_loading() : undefined}
	aria-hidden={status ? undefined : 'true'}
></div>
