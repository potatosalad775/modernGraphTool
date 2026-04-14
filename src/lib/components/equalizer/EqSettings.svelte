<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { CircleAlert } from '@lucide/svelte';
	import { settingsStore } from '$lib/stores/settings-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import Button from '../atoms/Button.svelte';
	import Switch from '../atoms/Switch.svelte';
	import PopoverPanel from '../atoms/PopoverPanel.svelte';

	function handlePersistModeChange(e: Event) {
		const select = e.currentTarget as HTMLSelectElement;
		settingsStore.setAutoEqPersistMode(select.value as 'session' | 'local');
	}

	function handleLinkToggle(checked: boolean) {
		settingsStore.setLinkEqNormalization(checked);
		dataProvider.renormalizeAll();
	}
</script>

<div class="flex flex-col gap-3">
	<!-- AutoEQ input persistence mode -->
	<div class="flex items-center gap-2">
		<span class="flex-1 text-xs font-medium text-base-content/80"
			>{m.eq_settings_autoeq_persist_label()}</span
		>
		<div class="flex-1">
			<select
				value={settingsStore.autoEqPersistMode}
				onchange={handlePersistModeChange}
				class="h-7 w-full rounded-md border border-base-content/20 bg-base-100 px-2 text-xs hover:cursor-pointer hover:bg-base-content/10 focus:ring-1 focus:ring-accent focus:outline-none"
			>
				<option value="session">{m.eq_settings_autoeq_persist_session()}</option>
				<option value="local">{m.eq_settings_autoeq_persist_local()}</option>
			</select>
		</div>
	</div>

	<!-- Link EQ curve to original -->
	<div class="flex items-center justify-between">
		<div class="flex items-center">
			<span class="flex-1 text-xs font-medium text-base-content/80"
				>{m.eq_settings_link_eq_normalization_label()}</span
			>
			<PopoverPanel align="end">
				{#snippet trigger({ props })}
					<Button
						{...props}
						title="Open target filter description"
						variant="ghost"
						size="icon"
						class="ml-0.5 p-1! opacity-80 hover:opacity-100 data-[state=open]:bg-accent! data-[state=open]:text-accent-content!"
					>
						<CircleAlert class="h-3 w-3" />
					</Button>
				{/snippet}
				<p class="max-w-xs text-xs text-base-content">
					{m.eq_settings_link_eq_normalization_description()}
				</p>
			</PopoverPanel>
		</div>
		<Switch
			labelClass="text-xs font-normal"
			checked={settingsStore.linkEqNormalization}
			onCheckedChange={handleLinkToggle}
		/>
	</div>
</div>
