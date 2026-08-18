<script lang="ts">
	import { Switch } from 'bits-ui';

	interface Props {
		checked: boolean;
		/** Always required: the switch renders no visible text of its own. */
		ariaLabel: string;
		disabled?: boolean;
	}

	let { checked = $bindable(), ariaLabel, disabled = false }: Props = $props();
</script>

<!--
	Reserved for "turn this whole section on or off". A checkbox says "include
	this value"; a switch says "this takes effect now", which is what the optional
	config sections actually mean. Keeping the two distinct is why `Checkbox` and
	`Switch` are separate components rather than one styled both ways.
-->
<Switch.Root class="ceSwitch" bind:checked {disabled} aria-label={ariaLabel}>
	<Switch.Thumb class="ceSwitchThumb" />
</Switch.Root>
