<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';

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
			class="ceSelect"
			bind:value={config.INTERFACE.PREFERRED_DARK_MODE_THEME}
		>
			<option value="light">Light</option>
			<option value="dark">Dark</option>
			<option value="system">System</option>
		</select>
	</div>

	<div class="ceToggleRow">
		<input
			type="checkbox"
			class="ceCheckbox"
			bind:checked={config.INTERFACE.ALLOW_REMOVING_PHONE_FROM_SELECTOR}
			id="{id}-allow-remove"
		/>
		<label for="{id}-allow-remove" class="ceToggleLabel">
			Allow removing phone from selector
		</label>
	</div>

	<div class="ceToggleRow">
		<input
			type="checkbox"
			class="ceCheckbox"
			bind:checked={config.INTERFACE.SWITCH_PHONE_PANEL_ON_BRAND_CLICK}
			id="{id}-switch-panel"
		/>
		<label for="{id}-switch-panel" class="ceToggleLabel">
			Switch to phone panel on brand click (mobile)
		</label>
	</div>

	<div class="ceSubSection">
		<div class="ceSubSectionTitle">Target Selector</div>

		<div class="ceToggleRow">
			<input
				type="checkbox"
				class="ceCheckbox"
				bind:checked={config.INTERFACE.TARGET.ALLOW_MULTIPLE_LINE_PER_TYPE}
				id="{id}-target-multi"
			/>
			<label for="{id}-target-multi" class="ceToggleLabel">Multiple lines per type</label>
		</div>

		<div class="ceToggleRow">
			<input
				type="checkbox"
				class="ceCheckbox"
				bind:checked={config.INTERFACE.TARGET.OMIT_TARGET_SUFFIX}
				id="{id}-target-suffix"
			/>
			<label for="{id}-target-suffix" class="ceToggleLabel">Omit "Target" suffix</label>
		</div>

		<div class="ceToggleRow">
			<input
				type="checkbox"
				class="ceCheckbox"
				bind:checked={config.INTERFACE.TARGET.COLLAPSE_TARGET_LIST_ON_INITIAL}
				id="{id}-target-collapse"
			/>
			<label for="{id}-target-collapse" class="ceToggleLabel">
				Collapse target list on initial load
			</label>
		</div>
	</div>

	<div class="ceToggleRow">
		<input
			type="checkbox"
			class="ceCheckbox"
			bind:checked={config.INTERFACE.HIDE_DEV_DONATE_BUTTON}
			id="{id}-hide-donate"
		/>
		<label for="{id}-hide-donate" class="ceToggleLabel">Hide donate button</label>
	</div>
</AccordionSection>
