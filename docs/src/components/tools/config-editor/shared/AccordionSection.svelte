<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import { untrack, type Snippet } from 'svelte';
	import Icon from '../../shared/Icon.svelte';
	import Switch from '../../shared/Switch.svelte';

	interface Props {
		id: string;
		title: string;
		description?: string;
		learnMoreHref?: string;
		/** Show an enable/disable switch in the header */
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

	// Seeded once and then owned by this component — a later change to the prop
	// must not slam a section shut while someone is editing it. `untrack` says
	// that deliberately, rather than leaving it as an accidental capture.
	let open = $state(untrack(() => defaultOpen));

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

<!--
	The header was a <div role="button" tabindex="0"> with a hand-rolled
	Enter/Space handler, because the enable checkbox lived inside it and a button
	cannot contain another interactive control. Collapsible.Trigger is a real
	<button> that fills the row, and the switch is now its *sibling* — same hit
	area, valid HTML, and the keyboard and ARIA wiring comes from bits-ui rather
	than from a keydown listener that had to be kept correct by hand.
-->
<Collapsible.Root class="ceSection" bind:open {id}>
	<div class="ceSectionHeader">
		<Collapsible.Trigger class="ceSectionTrigger">
			<Icon name="chevron" class="ceSectionChevron" />
			<span class="ceSectionTitle">{title}</span>
		</Collapsible.Trigger>
		{#if optional}
			<Switch bind:checked={enabled} ariaLabel="Enable {title}" />
		{/if}
	</div>

	<Collapsible.Content class="ceSectionBody">
		{#if description}
			<p class="ceSectionDescription">
				{description}
				{#if learnMoreHref}
					<a
						href={resolvedLearnMoreHref}
						target="_blank"
						rel="noopener noreferrer"
						class="ceSectionLearnMore">Learn more</a
					>
				{/if}
			</p>
		{/if}
		{#if optional && !enabled}
			<p class="ceSectionDescription">
				This section is disabled. Enable it to configure these settings.
			</p>
		{:else}
			{@render children()}
		{/if}
	</Collapsible.Content>
</Collapsible.Root>
