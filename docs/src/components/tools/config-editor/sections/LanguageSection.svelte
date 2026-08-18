<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import Checkbox from '../../shared/Checkbox.svelte';
	import Icon from '../../shared/Icon.svelte';

	let config = $derived(configEditor.config);
	let langList = $derived(config.LANGUAGE.LANGUAGE_LIST);
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
						aria-label="Remove language {i + 1}"
					>
						<Icon name="close" />
					</button>
				</div>
			{/each}
		</div>
		<button type="button" class="ceArrayAddBtn" onclick={() => langList.push(['', ''])}>
			<Icon name="plus" />
			Add language
		</button>
	</div>

	<Checkbox
		bind:checked={config.LANGUAGE.ENABLE_I18N}
		label="Enable internationalization"
		hint="adds a language selector to the Misc panel"
	/>

	<Checkbox
		bind:checked={config.LANGUAGE.ENABLE_SYSTEM_LANG_DETECTION}
		label="Enable system language detection"
	/>
</AccordionSection>
