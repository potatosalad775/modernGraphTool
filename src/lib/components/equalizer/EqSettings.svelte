<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { settingsStore } from '$lib/stores/settings-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import Switch from '../atoms/Switch.svelte';
	import InfoPopover from '../atoms/InfoPopover.svelte';

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
			<InfoPopover
				label={m.info_popover_about({ topic: m.eq_settings_link_eq_normalization_label() })}
				class="ml-0.5"
			>
				<p>{m.eq_settings_link_eq_normalization_description()}</p>
			</InfoPopover>
		</div>
		<Switch
			labelClass="text-xs font-normal"
			checked={settingsStore.linkEqNormalization}
			onCheckedChange={handleLinkToggle}
		/>
	</div>
</div>
