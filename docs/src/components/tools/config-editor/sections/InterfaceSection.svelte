<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import Checkbox from '../../shared/Checkbox.svelte';

	let config = $derived(configEditor.config);
	const id = $props.id();
</script>

<AccordionSection
	id="section-interface"
	title="Interface"
	description="User interface behavior: theme preference, phone removal, panel switching, and target selector options."
	learnMoreHref="./guide-for-admins/customize-page#interface"
>
	<div class="ceFieldGroup">
		<label class="ceLabel" for="{id}-theme">Theme Preference</label>
		<select
			id="{id}-theme"
			class="ceSelect ceInputSmall"
			bind:value={config.INTERFACE.PREFERRED_DARK_MODE_THEME}
		>
			<option value="light">Light</option>
			<option value="dark">Dark</option>
			<option value="system">System</option>
		</select>
	</div>

	<Checkbox
		bind:checked={config.INTERFACE.ALLOW_REMOVING_PHONE_FROM_SELECTOR}
		label="Allow removing phone from selector"
	/>

	<Checkbox
		bind:checked={config.INTERFACE.SWITCH_PHONE_PANEL_ON_BRAND_CLICK}
		label="Switch to phone panel on brand click (mobile)"
	/>

	<div class="ceSubSection">
		<span class="ceSubSectionTitle">Target Selector</span>

		<Checkbox
			bind:checked={config.INTERFACE.TARGET.ALLOW_MULTIPLE_LINE_PER_TYPE}
			label="Multiple lines per type"
		/>

		<Checkbox
			bind:checked={config.INTERFACE.TARGET.OMIT_TARGET_SUFFIX}
			label="Omit “Target” suffix"
		/>

		<Checkbox
			bind:checked={config.INTERFACE.TARGET.COLLAPSE_TARGET_LIST_ON_INITIAL}
			label="Collapse target list on initial load"
		/>
	</div>

	<Checkbox bind:checked={config.INTERFACE.HIDE_DEV_DONATE_BUTTON} label="Hide donate button" />
</AccordionSection>
