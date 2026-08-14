<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';

	let config = $derived(configEditor.config);
	let langList = $derived(config.LANGUAGE.LANGUAGE_LIST);
	const id = $props.id();
</script>

<AccordionSection
	id="section-language"
	title="Language"
	description="Available languages, i18n toggle, and system language detection. Languages added here become available for i18n sections (Target Manifest, Topbar Links, Description)."
	learnMoreHref="./guide-for-admins/customize-page#language"
>
	<div class="ceFieldGroup">
		<span class="ceLabel">Language List</span>
		<div class="ceArrayList">
			{#each langList as _, i (i)}
				<div class="ceArrayItem">
					<input
						type="text"
						class="ceInput ceInputSmall"
						bind:value={langList[i][0]}
						placeholder="Code (e.g. en)"
						aria-label="Language code {i + 1}"
						style="width: 80px;"
					/>
					<input
						type="text"
						class="ceInput ceArrayInput"
						bind:value={langList[i][1]}
						placeholder="Name (e.g. English)"
						aria-label="Language name {i + 1}"
					/>
					<button
						type="button"
						class="ceArrayRemoveBtn"
						onclick={() => langList.splice(i, 1)}
						title="Remove"
					>
						&times;
					</button>
				</div>
			{/each}
		</div>
		<button type="button" class="ceArrayAddBtn" onclick={() => langList.push(['', ''])}>
			+ Add language
		</button>
	</div>

	<div class="ceToggleRow">
		<input
			type="checkbox"
			class="ceCheckbox"
			bind:checked={config.LANGUAGE.ENABLE_I18N}
			id="{id}-i18n"
		/>
		<label for="{id}-i18n" class="ceToggleLabel">
			Enable internationalization
			<span class="ceToggleHint">Adds language selector to Misc Panel</span>
		</label>
	</div>

	<div class="ceToggleRow">
		<input
			type="checkbox"
			class="ceCheckbox"
			bind:checked={config.LANGUAGE.ENABLE_SYSTEM_LANG_DETECTION}
			id="{id}-detect"
		/>
		<label for="{id}-detect" class="ceToggleLabel">Enable system language detection</label>
	</div>
</AccordionSection>
