<script lang="ts">
	import { eqConstraintsStore } from '$lib/stores/eq-constraints-store.svelte.js';
	import { eqCommands } from '$lib/services/eq-commands.js';
	import * as m from '$lib/paraglide/messages.js';

	function onChange(e: Event) {
		const id = (e.currentTarget as HTMLSelectElement).value;
		if (id === eqConstraintsStore.activeId) return;
		eqConstraintsStore.setActive(id);
		// Re-clamp existing filters into the new preset's bounds as one
		// undoable command, so switching is reversible.
		eqCommands.reclampToActiveConstraint();
	}
</script>

<label class="flex min-w-0 items-center gap-1.5">
	<span class="shrink-0 text-xs text-base-content/60">
		{m.eq_constraint_select_label()}
	</span>
	<select
		title={m.eq_constraint_select_title()}
		value={eqConstraintsStore.activeId}
		onchange={onChange}
		class="max-w-full min-w-0 rounded border border-base-content/20 bg-base-200 px-1.5 py-0.5 text-xs"
	>
		{#each eqConstraintsStore.presets as preset (preset.id)}
			<option value={preset.id}>{preset.label}</option>
		{/each}
	</select>
</label>
