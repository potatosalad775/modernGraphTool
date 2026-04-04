<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { getConfigValue } from '$lib/utils/config';
	import { appStore } from '$lib/stores/app-store.svelte';
	import SiteSelector from '$lib/components/controls/SiteSelector.svelte';

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

<header class="flex h-12 items-center border-b border-base-content/15 bg-base-200 px-4">
	<nav class="flex w-full items-center justify-between">
		<!-- Leading: title -->
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

		<!-- Desktop: link list + site selector -->
		{#if !appStore.isMobile}
			<div class="flex items-center gap-4">
				<SiteSelector />
				{#each linkList as link (link.URL)}
					<a
						href={link.URL}
						target="_blank"
						rel="noopener"
						class="text-sm text-base-content/60 hover:text-base-content"
					>
						{link.TITLE}
					</a>
				{/each}
			</div>
		{/if}

		<!-- Mobile: hamburger button -->
		{#if appStore.isMobile}
			<button
				type="button"
				onclick={openSidebar}
				class="rounded-md p-2 text-base-content/60 hover:bg-base-300"
				aria-label="Open menu"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-6 w-6">
					<path fill-rule="evenodd" d="M3 6.75A.75.75 0 013.75 6h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 6.75zM3 12a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 12zm0 5.25a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75z" clip-rule="evenodd" />
				</svg>
			</button>
		{/if}
	</nav>
</header>

<!-- Mobile sidebar -->
{#if appStore.isMobile && sidebarOpen}
	<!-- Backdrop -->
	<div
		role="presentation"
		class="fixed inset-0 z-40 bg-black/40"
		onclick={closeSidebar}
	></div>

	<!-- Drawer -->
	<div class="fixed right-0 top-0 z-50 flex h-full w-64 flex-col bg-base-200 shadow-xl">
		<div class="flex items-center justify-between border-b border-base-content/15 px-4 py-3">
			<h2 class="text-sm font-semibold text-base-content/60">
				{m.top_nav_bar_sidebar_link_title()}
			</h2>
			<button
				type="button"
				onclick={closeSidebar}
				class="rounded-md p-1 text-base-content/60 hover:bg-base-300"
				aria-label="Close menu"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5">
					<path fill-rule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clip-rule="evenodd" />
				</svg>
			</button>
		</div>
		<nav class="flex flex-col gap-1 p-4">
			{#each linkList as link (link.URL)}
				<a
					href={link.URL}
					target="_blank"
					rel="noopener"
					onclick={closeSidebar}
					class="rounded-md px-3 py-2 text-sm text-base-content/60 hover:bg-base-300"
				>
					{link.TITLE}
				</a>
			{/each}
		</nav>
	</div>
{/if}
