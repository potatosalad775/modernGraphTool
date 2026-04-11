<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { getConfigValue } from '$lib/utils/config';
	import { appStore } from '$lib/stores/app-store.svelte';
	import SiteSelector from '$lib/components/controls/SiteSelector.svelte';
	import Button from '../atoms/Button.svelte';
	import { Menu, X } from '@lucide/svelte';
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
		<div class="flex items-center gap-4">
			<a href="." class="flex items-center no-underline text-base-content">
				{#if titleType === 'HTML'}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html titleContent}
				{:else if titleType === 'IMAGE'}
					<img src={titleContent} alt="topbar title" class="h-8" />
				{:else}
					<span class="text-base font-semibold text-base-content">{titleContent}</span>
				{/if}
			</a>
			<SiteSelector />
		</div>

		<!-- Desktop: link list + site selector -->
		{#if !appStore.isMobile}
			<div class="flex items-center gap-4">
				{#each linkList as link (link.URL)}
					<a
						href={link.URL}
						target="_blank"
						rel="noopener"
						class="text-sm  hover:text-base-content"
					>
						{link.TITLE}
					</a>
				{/each}
			</div>
		{/if}

		<!-- Mobile: hamburger button -->
		{#if appStore.isMobile}
			<Button
				title="Open menu"
				onclick={openSidebar}
				variant="ghost" size="icon"
			>
				<Menu class="h-5 w-5" />
			</Button>
		{/if}
	</nav>
</header>

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
		class="fixed right-0 top-0 z-50 flex h-full w-64 flex-col bg-base-200 shadow-xl"
		transition:fly={{ x: 256, duration: 250, easing: cubicOut }}
	>
		<div class="flex items-center justify-between h-12 bg-base-300 border-b border-base-content/15 px-4 py-3">
			<h2 class="text-sm font-semibold ">
				{m.top_nav_bar_sidebar_link_title()}
			</h2>
			<button
				type="button"
				onclick={closeSidebar}
				class="rounded-md p-1  hover:bg-base-300"
				aria-label="Close menu"
			>
				<X class="h-5 w-5" aria-hidden="true" />
			</button>
		</div>
		<nav class="flex flex-col gap-0.5 p-2">
			{#each linkList as link (link.URL)}
				<a
					href={link.URL}
					target="_blank"
					rel="noopener"
					onclick={closeSidebar}
					class="rounded-md p-2 text-sm  hover:bg-base-300"
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
