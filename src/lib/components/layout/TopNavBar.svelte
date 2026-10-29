<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { getConfigValue } from '#lib/utils/config.js';
	import { appStore } from '#lib/stores/app-store.svelte.js';
	import SiteSelector from '#lib/components/controls/SiteSelector.svelte';
	import Button from '../atoms/Button.svelte';
	import PopoverPanel from '../atoms/PopoverPanel.svelte';
	import { ChevronDown, Menu, X } from '@lucide/svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	const titleType = $derived((getConfigValue('TOPBAR.TITLE.TYPE') as string) ?? 'TEXT');
	const titleContent = $derived(
		(getConfigValue('TOPBAR.TITLE.CONTENT') as string) ?? 'modernGraphTool'
	);
	const linkList = $derived(
		(getConfigValue('TOPBAR.LINK_LIST') as { URL: string; TITLE: string }[]) ?? []
	);

	let sidebarOpen = $state(false);
	let moreOpen = $state(false);

	// Desktop links show as many as fit and hand the rest, from the end of the list, to a
	// "More" popover. Widths come from an invisible copy of the full row, so the visible
	// row is never re-measured while it changes; `bind:offsetWidth` is a ResizeObserver,
	// which also catches the Pretendard swap that resizes every label after boot.
	const LINK_GAP = 4; // gap-1
	const linkClass = 'shrink-0 rounded px-2 py-1.5 text-sm whitespace-nowrap';
	const moreClass = 'shrink-0 gap-1 px-2 text-sm font-normal';
	let linkWidths = $state<number[]>([]);
	let moreWidth = $state(0);
	let available = $state(0);

	const visibleCount = $derived.by(() => {
		const widths = linkList.map((_, i) => linkWidths[i] ?? 0);
		const all = widths.reduce((sum, w) => sum + w, 0) + LINK_GAP * (widths.length - 1);
		if (all <= available) return widths.length;
		// Something overflows: keep the longest prefix that still leaves room for "More".
		let count = 0;
		let used = moreWidth;
		while (count < widths.length && used + LINK_GAP + widths[count] <= available) {
			used += LINK_GAP + widths[count];
			count++;
		}
		return count;
	});
	const visibleLinks = $derived(linkList.slice(0, visibleCount));
	const overflowLinks = $derived(linkList.slice(visibleCount));

	function openSidebar() {
		sidebarOpen = true;
	}
	function closeSidebar() {
		sidebarOpen = false;
	}
</script>

<header class="flex h-12 items-center border-b border-base-content/15 bg-base-300 px-4">
	<nav class="flex w-full items-center justify-between">
		<!-- Leading: title -->
		<div class="flex shrink-0 items-center gap-4">
			<!--
				Deliberately relative: operators drop dist/ into an arbitrary subdirectory,
				which SvelteKit's `base` doesn't know about at build time. resolve('/') would
				link to the server root and break those deployments.
			-->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href="."
				class="-ml-2 flex items-center rounded px-2 py-1.5 text-base-content no-underline hover:bg-base-content/10"
			>
				{#if titleType === 'HTML'}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html titleContent}
				{:else if titleType === 'IMAGE'}
					<img src={titleContent} alt="topbar title" class="h-8" />
				{:else}
					<span class="text-base font-semibold text-base-content">{titleContent}</span>
				{/if}
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{#if !appStore.isMobile}
				<SiteSelector />
			{/if}
		</div>

		<!-- Desktop: as many links as fit, the rest behind "More" -->
		{#if !appStore.isMobile && linkList.length > 0}
			<div
				class="ml-4 flex min-w-0 flex-1 items-center justify-end gap-1"
				bind:clientWidth={available}
			>
				{#each visibleLinks as link (link.URL)}
					<a
						href={link.URL}
						target="_blank"
						rel="external noopener noreferrer"
						class="{linkClass} hover:bg-base-content/10"
					>
						{link.TITLE}
					</a>
				{/each}
				{#if overflowLinks.length > 0}
					<PopoverPanel bind:open={moreOpen} align="end" contentClass="flex flex-col gap-0.5">
						{#snippet trigger({ props })}
							<Button
								{...props}
								title={m.top_nav_bar_more_links()}
								variant="ghost"
								size="sm"
								class={moreClass}
								activeOnOpen
							>
								{@render moreLabel()}
							</Button>
						{/snippet}
						{#each overflowLinks as link (link.URL)}
							<a
								href={link.URL}
								target="_blank"
								rel="external noopener noreferrer"
								onclick={() => (moreOpen = false)}
								class="{linkClass} hover:bg-base-content/10"
							>
								{link.TITLE}
							</a>
						{/each}
					</PopoverPanel>
				{/if}
			</div>

			<!-- Measuring copy of the full row: invisible, so neither focusable nor announced -->
			<div class="invisible absolute h-0 w-0 overflow-hidden" aria-hidden="true">
				<div class="flex w-max gap-1">
					{#each linkList as link, i (link.URL)}
						<span class={linkClass} bind:offsetWidth={linkWidths[i]}>{link.TITLE}</span>
					{/each}
					<span class="inline-flex" bind:offsetWidth={moreWidth}>
						<Button title="" variant="ghost" size="sm" class={moreClass}>
							{@render moreLabel()}
						</Button>
					</span>
				</div>
			</div>
		{/if}

		<!-- Mobile: hamburger button -->
		{#if appStore.isMobile && linkList.length > 0}
			<Button title="Open menu" onclick={openSidebar} variant="ghost" size="icon">
				<Menu class="h-5 w-5" />
			</Button>
		{/if}
	</nav>
</header>

{#snippet moreLabel()}
	{m.top_nav_bar_more()}
	<ChevronDown class="h-4 w-4" aria-hidden="true" />
{/snippet}

<!-- Mobile sidebar -->
{#if appStore.isMobile && sidebarOpen}
	<!-- Backdrop -->
	<div
		role="presentation"
		class="fixed inset-0 z-40 bg-black/40"
		transition:fade={{ duration: 200 }}
		onclick={closeSidebar}
	></div>

	<!-- Drawer -->
	<div
		class="fixed top-0 right-0 z-50 flex h-full w-64 flex-col bg-base-200 shadow-xl"
		transition:fly={{ x: 256, duration: 250, easing: cubicOut }}
	>
		<div
			class="flex h-12 items-center justify-between border-b border-base-content/15 bg-base-300 px-4 py-3"
		>
			<h2 class="text-sm font-semibold">
				{m.top_nav_bar_sidebar_link_title()}
			</h2>
			<Button title="Close menu" onclick={closeSidebar} variant="ghost" size="icon">
				<X class="h-5 w-5" aria-hidden="true" />
			</Button>
		</div>
		<nav class="flex flex-col gap-0.5 p-2">
			{#each linkList as link (link.URL)}
				<a
					href={link.URL}
					target="_blank"
					rel="external noopener noreferrer"
					onclick={closeSidebar}
					class="rounded-md p-2 text-sm hover:bg-base-300"
				>
					{link.TITLE}
				</a>
			{/each}
		</nav>
		<div class="mt-auto border-t border-base-content/15 p-4">
			<SiteSelector />
		</div>
	</div>
{/if}
