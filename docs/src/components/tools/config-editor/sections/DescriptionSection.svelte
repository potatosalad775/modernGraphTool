<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import I18nWrapper from '../shared/I18nWrapper.svelte';
	import type { DescriptionItemForm } from '../../../../utils/configDefaults';

	let config = $derived(configEditor.config);
</script>

{#snippet descriptionItems(items: DescriptionItemForm[], lang: string)}
	<div>
		{#each items as item, i (i)}
			<div class="ceCard">
				<div class="ceCardHeader">
					<span class="ceCardTitle">Item #{i + 1}</span>
					<button
						type="button"
						class="ceBtn ceBtnSmall ceBtnDanger"
						onclick={() => items.splice(i, 1)}
					>
						Remove
					</button>
				</div>
				<div class="ceCardGrid">
					<div class="ceFieldGroup">
						<label class="ceLabel" for="desc-{lang}-{i}-type">Type</label>
						<select id="desc-{lang}-{i}-type" class="ceSelect" bind:value={item.TYPE}>
							<option value="TEXT">Text</option>
							<option value="HTML">HTML</option>
							<option value="IMAGE">Image</option>
						</select>
					</div>
				</div>
				<div class="ceFieldGroup">
					<label class="ceLabel" for="desc-{lang}-{i}-content">Content</label>
					{#if item.TYPE === 'HTML'}
						<textarea
							id="desc-{lang}-{i}-content"
							class="ceTextarea"
							bind:value={item.CONTENT}
							placeholder="<p>Your description here</p>"></textarea>
					{:else}
						<input
							id="desc-{lang}-{i}-content"
							type="text"
							class="ceInput"
							bind:value={item.CONTENT}
							placeholder={item.TYPE === 'IMAGE' ? './assets/images/info.png' : 'Description text'}
						/>
					{/if}
				</div>
			</div>
		{/each}
		<button
			type="button"
			class="ceArrayAddBtn"
			onclick={() => items.push({ TYPE: 'HTML', CONTENT: '' })}
		>
			+ Add description item
		</button>
	</div>
{/snippet}

<AccordionSection
	id="section-description"
	title="Description"
	description="Content displayed in the Misc panel description area. Supports text, HTML, and image types with multilingual options."
	learnMoreHref="./guide-for-admins/customize-page#description"
>
	<I18nWrapper bind:value={config.DESCRIPTION} renderItems={descriptionItems} />
</AccordionSection>
