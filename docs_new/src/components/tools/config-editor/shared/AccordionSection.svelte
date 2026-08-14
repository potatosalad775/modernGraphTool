<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		title: string;
		description?: string;
		learnMoreHref?: string;
		/** Show an enable/disable toggle in the header */
		optional?: boolean;
		enabled?: boolean;
		defaultOpen?: boolean;
		children: Snippet;
	}

	let {
		id,
		title,
		description,
		learnMoreHref,
		optional = false,
		enabled = $bindable(true),
		defaultOpen = false,
		children
	}: Props = $props();

	let open = $state(defaultOpen);
	const contentId = $props.id();

	/*
	 * Resolve doc links against the site base. These are plain <a> tags, not
	 * Markdown links, so `remark-docs-links` never sees them — a raw relative
	 * href would resolve against the trailing-slashed page URL and break.
	 *
	 * The React original also appended the active locale, taken from
	 * `useDocusaurusContext()`. That is dropped deliberately: the docs pages
	 * these point at are only partly translated and Starlight already falls back
	 * to the English page per slug, so an English href lands on the Korean page
	 * where one exists and on a working English page where it does not. A
	 * hand-built `/ko/...` href would 404 on every untranslated page instead.
	 */
	const base = import.meta.env.BASE_URL.replace(/\/$/, '');
	let resolvedLearnMoreHref = $derived(
		learnMoreHref ? `${base}/${learnMoreHref.replace(/^\.?\//, '')}` : undefined
	);
</script>

<div class="ceSection" {id}>
	<!--
		The header stays a <div> with button semantics rather than becoming a real
		<button>: it contains the optional enable/disable checkbox, and nesting an
		interactive control inside a <button> is invalid HTML.
	-->
	<div
		class="ceSectionHeader"
		role="button"
		tabindex="0"
		aria-expanded={open}
		aria-controls={contentId}
		onclick={() => (open = !open)}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				open = !open;
			}
		}}
	>
		<span class="ceSectionChevron" class:ceSectionChevronOpen={open}>&#9654;</span>
		<span class="ceSectionTitle">{title}</span>
		{#if optional}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<label class="ceSectionToggle" onclick={(e) => e.stopPropagation()}>
				<input
					type="checkbox"
					class="ceCheckbox"
					aria-label="Enable {title}"
					bind:checked={enabled}
				/>
			</label>
		{/if}
	</div>
	{#if open}
		<div class="ceSectionBody" id={contentId}>
			{#if description}
				<div class="ceSectionDescription">
					{description}
					{#if learnMoreHref}
						<!-- Svelte keeps the newline before this as a text node, so unlike
						     JSX it needs no explicit {' '} to separate it from the text. -->
						<a
							href={resolvedLearnMoreHref}
							target="_blank"
							rel="noopener noreferrer"
							class="ceSectionLearnMore">Learn more</a
						>
					{/if}
				</div>
			{/if}
			{#if optional && !enabled}
				<div class="ceSectionDescription">
					This section is disabled. Enable it to configure these settings.
				</div>
			{:else}
				{@render children()}
			{/if}
		</div>
	{/if}
</div>
