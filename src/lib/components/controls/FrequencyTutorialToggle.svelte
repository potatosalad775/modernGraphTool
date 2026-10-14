<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { settingsStore } from '$lib/stores/settings-store.svelte.js';
	import Button from '../atoms/Button.svelte';

	// Visibility lives in settingsStore: on mobile this button sits in GraphPanel, which
	// unmounts on every panel switch while the strip it controls stays on screen.
</script>

<Button
	title={m.freq_guide_btn_label()}
	onclick={() => settingsStore.setFrequencyTutorialVisible(!settingsStore.frequencyTutorialVisible)}
	variant={settingsStore.frequencyTutorialVisible ? 'primary' : 'outline'}
	size="toolbar"
	aria-pressed={settingsStore.frequencyTutorialVisible}
>
	{m.freq_guide_btn_label()}
</Button>
