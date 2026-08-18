<script lang="ts">
	import Icon from '../../shared/Icon.svelte';
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import I18nWrapper from '../shared/I18nWrapper.svelte';
	import StringArrayEditor from '../shared/StringArrayEditor.svelte';
	import type { TargetManifestEntryForm } from '../../../../utils/configDefaults';

	let config = $derived(configEditor.config);
</script>

{#snippet entries(items: TargetManifestEntryForm[], lang: string)}
	<div>
		{#each items as entry, i (i)}
			<div class="ceCard">
				<div class="ceCardHeader">
					<span class="ceCardTitle">Group #{i + 1}</span>
					<button
						type="button"
						class="ceBtn ceBtnSmall ceBtnDanger"
						onclick={() => items.splice(i, 1)}
					>
						Remove
					</button>
				</div>
				<div class="ceFieldGroup">
					<label class="ceLabel" for="tm-{lang}-{i}-type">Type Name</label>
					<input
						id="tm-{lang}-{i}-type"
						type="text"
						class="ceInput"
						bind:value={entry.type}
						placeholder="e.g. Harman, Neutral, Reviewer"
					/>
				</div>
				<!-- i18n language tabs only show type (files come from default) -->
				{#if lang === 'default'}
					<div class="ceFieldGroup">
						<span class="ceLabel">Files</span>
						{#if entry.files}
							<StringArrayEditor
								bind:items={entry.files}
								placeholder="Target file name"
								addLabel="Add file"
							/>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
		<button type="button" class="ceArrayAddBtn" onclick={() => items.push({ type: '', files: [] })}>
			<Icon name="plus" />
			Add group
		</button>
	</div>
{/snippet}

<AccordionSection
	id="section-target-manifest"
	title="Target Manifest"
	description="Groups and sorts targets in the target selector. Supports multilingual type names."
	learnMoreHref="./guide-for-admins/customize-page#target_manifest"
>
	<I18nWrapper bind:value={config.TARGET_MANIFEST} renderItems={entries} />
</AccordionSection>
