<script lang="ts">
	import { page } from '$app/state';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import './layout.css';
	import { settingsStore } from '$lib/stores/settings-store.svelte';

	let { children } = $props();

	$effect(() => {
		const html = document.documentElement;
		html.classList.add('theme-transition');
		html.classList.toggle('dark', settingsStore.theme === 'dark');
		// Remove transition class after animation completes to avoid interfering with other transitions
		const timer = setTimeout(() => html.classList.remove('theme-transition'), 350);
		return () => clearTimeout(timer);
	});
</script>

{@render children()}

<div style="display:none">
	{#each locales as locale (locale)}
		<a href={localizeHref(page.url.pathname, { locale })}>{locale}</a>
	{/each}
</div>
