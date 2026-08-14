<script lang="ts">
	import { configEditor } from '../config-store.svelte';
	import AccordionSection from '../shared/AccordionSection.svelte';
	import I18nWrapper from '../shared/I18nWrapper.svelte';
	import type { TopbarLinkForm } from '../../../../utils/configDefaults';

	let config = $derived(configEditor.config);
	const id = $props.id();
</script>

{#snippet links(items: TopbarLinkForm[], lang: string)}
	<div>
		<div class="ceArrayList">
			{#each items as link, i (i)}
				<div class="ceArrayItem">
					<input
						type="text"
						class="ceInput"
						bind:value={link.TITLE}
						placeholder="Link title"
						aria-label="Link title {i + 1} ({lang})"
						style="flex: 1;"
					/>
					<input
						type="text"
						class="ceInput"
						bind:value={link.URL}
						placeholder="https://..."
						aria-label="Link URL {i + 1} ({lang})"
						style="flex: 2;"
					/>
					<button
						type="button"
						class="ceArrayRemoveBtn"
						onclick={() => items.splice(i, 1)}
						title="Remove"
					>
						&times;
					</button>
				</div>
			{/each}
		</div>
		<button type="button" class="ceArrayAddBtn" onclick={() => items.push({ TITLE: '', URL: '' })}>
			+ Add link
		</button>
	</div>
{/snippet}

<AccordionSection
	id="section-topbar"
	title="Topbar"
	description="Header title and navigation links. Links support multilingual configuration."
	learnMoreHref="./guide-for-admins/customize-page#topbar"
>
	<div class="ceSubSection">
		<div class="ceSubSectionTitle">Title</div>
		<div class="ceCardGrid">
			<div class="ceFieldGroup">
				<label class="ceLabel" for="{id}-title-type">Type</label>
				<select id="{id}-title-type" class="ceSelect" bind:value={config.TOPBAR.TITLE.TYPE}>
					<option value="TEXT">Text</option>
					<option value="IMAGE">Image</option>
					<option value="HTML">HTML</option>
				</select>
			</div>
		</div>
		<div class="ceFieldGroup">
			<label class="ceLabel" for="{id}-title-content">Content</label>
			{#if config.TOPBAR.TITLE.TYPE === 'HTML'}
				<textarea
					id="{id}-title-content"
					class="ceTextarea"
					bind:value={config.TOPBAR.TITLE.CONTENT}
					placeholder="<h2>Site Title</h2>"></textarea>
			{:else}
				<input
					id="{id}-title-content"
					type="text"
					class="ceInput"
					bind:value={config.TOPBAR.TITLE.CONTENT}
					placeholder={config.TOPBAR.TITLE.TYPE === 'IMAGE'
						? './assets/images/logo.png'
						: 'Site Title'}
				/>
			{/if}
		</div>
	</div>

	<div class="ceFieldGroup">
		<span class="ceLabel">Link List</span>
		<I18nWrapper bind:state={config.TOPBAR.LINK_LIST} renderItems={links} />
	</div>
</AccordionSection>
