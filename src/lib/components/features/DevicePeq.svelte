<script lang="ts">
	import { devicePeqStore } from '#lib/stores/device-peq-store.svelte.js';
	import { linkStore } from '#lib/stores/link-store.svelte.js';
	import { linkConfig } from '#lib/services/link-config.js';
	import DeviceConnect from './DeviceConnect.svelte';
	import DeviceControls from './DeviceControls.svelte';
	import UnipeqLink from './UnipeqLink.svelte';

	/**
	 * Hardware EQ: one connection at a time, made in this browser or held by uniPEQ over the link.
	 * Idle, both ways in are offered; once either is under way, only it shows until it ends. The
	 * services enforce the same rule, so this only shows it.
	 *
	 * Each part has its own `{#if}`, so one mounts and unmounts on its own condition: the connect
	 * screen keeps its state through a connection attempt, the link view through the link.
	 */

	/** `UNIPEQ_LINK.ENABLE: false` hides the link. */
	const linkEnabled = linkConfig().enabled;

	const connection = $derived(devicePeqStore.connection);
	const showConnect = $derived(!connection && !linkStore.active);
	const showLink = $derived(linkEnabled && !devicePeqStore.localActive);
</script>

<div class="-mb-1 flex flex-col gap-2">
	{#if showConnect}
		<DeviceConnect />
	{/if}
	{#if showConnect && showLink}
		<hr class="border-base-content/15" />
	{/if}
	{#if showLink}
		<UnipeqLink />
	{/if}
	{#if connection}
		{#if connection.connectionType === 'link'}
			<hr class="border-base-content/15" />
		{/if}
		<DeviceControls />
	{/if}
</div>
