<script lang="ts">
	import { eqConstraintsStore, BUILTIN_PRESETS } from '$lib/stores/eq-constraints-store.svelte.js';
	import { eqCommands } from '$lib/services/eq-commands.js';
	import * as m from '$lib/paraglide/messages.js';
	import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';
	import { Check, Settings2 } from '@lucide/svelte';
	import Button from '../atoms/Button.svelte';
	import PopoverPanel from '../atoms/PopoverPanel.svelte';

	const BUILTIN_IDS = new Set(BUILTIN_PRESETS.map((p) => p.id));

	let open = $state(false);
	let query = $state('');

	// The search box only makes sense while the panel is open; reset it on close
	// so the next open starts from the full list.
	$effect(() => {
		if (!open) query = '';
	});

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const all = eqConstraintsStore.presets;
		const matches = q
			? all.filter((p) => p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
			: all;
		const builtin: EqConstraintPreset[] = [];
		const device: EqConstraintPreset[] = [];
		for (const p of matches) {
			(BUILTIN_IDS.has(p.id) ? builtin : device).push(p);
		}
		return [
			{ heading: m.eq_constraint_group_builtin(), items: builtin },
			{ heading: m.eq_constraint_group_device(), items: device }
		];
	});

	const isEmpty = $derived(filtered.every((g) => g.items.length === 0));

	function select(id: string) {
		open = false;
		if (!id || id === eqConstraintsStore.activeId) return;
		eqConstraintsStore.setActive(id);
		eqCommands.reclampToActiveConstraint();
	}
</script>

<PopoverPanel bind:open contentClass="w-64 p-2">
	{#snippet trigger({ props })}
		<Button
			{...props}
			title={m.eq_constraint_select_title()}
			variant="outline"
			size="icon"
			class="size-6 p-px"
		>
			<Settings2 class="size-3.25" />
		</Button>
	{/snippet}

	<div class="flex flex-col gap-2">
		<div class="flex flex-col">
			<span class="text-xs font-medium text-base-content/80">
				{m.eq_constraint_select_label()}
			</span>
			<span class="truncate text-xs text-base-content/60">
				{eqConstraintsStore.active?.label ?? ''}
			</span>
		</div>

		<input
			type="search"
			bind:value={query}
			placeholder={m.eq_constraint_search_placeholder()}
			aria-label={m.eq_constraint_search_placeholder()}
			class="w-full rounded border border-base-content/20 bg-base-100 px-2 py-1 text-xs outline-none placeholder:text-base-content/40 focus:ring-1 focus:ring-accent"
		/>

		<div class="max-h-64 overflow-y-auto">
			{#each filtered as group (group.heading)}
				{#if group.items.length > 0}
					<div
						class="px-2 py-1 text-[10px] font-semibold tracking-wider text-base-content/50 uppercase"
					>
						{group.heading}
					</div>
					{#each group.items as p (p.id)}
						{@const selected = p.id === eqConstraintsStore.activeId}
						<button
							type="button"
							aria-pressed={selected}
							onclick={() => select(p.id)}
							class="flex w-full cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs text-base-content hover:bg-base-300 focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none {selected
								? 'font-medium text-accent'
								: ''}"
						>
							<span class="truncate">{p.label}</span>
							{#if selected}
								<Check class="size-3 shrink-0" />
							{/if}
						</button>
					{/each}
				{/if}
			{/each}
			{#if isEmpty}
				<div class="px-2 py-2 text-center text-xs text-base-content/50">
					{m.eq_constraint_no_results()}
				</div>
			{/if}
		</div>
	</div>
</PopoverPanel>
