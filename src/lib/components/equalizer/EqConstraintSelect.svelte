<script lang="ts">
	import { eqConstraintsStore, BUILTIN_PRESETS } from '$lib/stores/eq-constraints-store.svelte.js';
	import { eqCommands } from '$lib/services/eq-commands.js';
	import * as m from '$lib/paraglide/messages.js';
	import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';
	import { Combobox } from 'bits-ui';
	import { Check, ChevronsUpDown } from '@lucide/svelte';

	const BUILTIN_IDS = new Set(BUILTIN_PRESETS.map((p) => p.id));

	let inputValue = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);
	let open = $state(false);

	const activeLabel = $derived(eqConstraintsStore.active?.label ?? '');

	// bits-ui Combobox needs Combobox.Input as the anchor + interaction
	// surface. The input's DOM value is uncontrolled, so we sync it
	// imperatively: clear when opening (so users can type to filter), and
	// restore the active preset's label when closed (so the input reads
	// like a select).
	$effect(() => {
		if (!inputEl) return;
		if (open) {
			inputEl.value = '';
			inputValue = '';
		} else {
			inputEl.value = activeLabel;
		}
	});

	const filtered = $derived.by(() => {
		const q = inputValue.trim().toLowerCase();
		const all = eqConstraintsStore.presets;
		const matches = q
			? all.filter((p) => p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
			: all;
		const builtin: EqConstraintPreset[] = [];
		const device: EqConstraintPreset[] = [];
		for (const p of matches) {
			(BUILTIN_IDS.has(p.id) ? builtin : device).push(p);
		}
		return { builtin, device };
	});

	function onValueChange(v: string) {
		if (!v || v === eqConstraintsStore.activeId) return;
		eqConstraintsStore.setActive(v);
		eqCommands.reclampToActiveConstraint();
	}
</script>

<label class="flex min-w-0 items-center gap-1.5">
	<span class="shrink-0 text-xs text-base-content/60">
		{m.eq_constraint_select_label()}
	</span>
	<Combobox.Root type="single" value={eqConstraintsStore.activeId} bind:open {onValueChange}>
		<div
			class="relative flex max-w-full min-w-0 flex-1 items-center rounded border border-base-content/20 bg-base-200 focus-within:ring-1 focus-within:ring-accent"
		>
			<Combobox.Input
				bind:ref={inputEl}
				title={m.eq_constraint_select_title()}
				placeholder={m.eq_constraint_search_placeholder()}
				oninput={(e) => (inputValue = (e.currentTarget as HTMLInputElement).value)}
				class="min-w-0 flex-1 truncate bg-transparent px-1.5 py-0.5 pr-5 text-xs outline-none placeholder:text-base-content/40"
			/>
			<Combobox.Trigger
				class="absolute right-0 inline-flex h-full w-5 items-center justify-center text-base-content/60 hover:text-base-content"
				aria-label={m.eq_constraint_select_title()}
			>
				<ChevronsUpDown class="size-3" />
			</Combobox.Trigger>
		</div>

		<Combobox.Portal>
			<Combobox.Content
				sideOffset={4}
				class="z-50 max-h-72 min-w-56 overflow-y-auto rounded-md border border-base-content/15 bg-base-200 p-1 shadow-xl outline-none"
			>
				<Combobox.Viewport>
					{#if filtered.builtin.length > 0}
						<Combobox.Group>
							<Combobox.GroupHeading
								class="px-2 py-1 text-[10px] font-semibold tracking-wider text-base-content/50 uppercase"
							>
								{m.eq_constraint_group_builtin()}
							</Combobox.GroupHeading>
							{#each filtered.builtin as p (p.id)}
								<Combobox.Item value={p.id} label={p.label}>
									{#snippet children({ selected })}
										<div
											class="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-xs text-base-content data-highlighted:bg-base-300 {selected
												? 'font-medium text-accent'
												: ''}"
										>
											<span class="truncate">{p.label}</span>
											{#if selected}
												<Check class="size-3 shrink-0" />
											{/if}
										</div>
									{/snippet}
								</Combobox.Item>
							{/each}
						</Combobox.Group>
					{/if}
					{#if filtered.device.length > 0}
						<Combobox.Group>
							<Combobox.GroupHeading
								class="px-2 py-1 text-[10px] font-semibold tracking-wider text-base-content/50 uppercase"
							>
								{m.eq_constraint_group_device()}
							</Combobox.GroupHeading>
							{#each filtered.device as p (p.id)}
								<Combobox.Item value={p.id} label={p.label}>
									{#snippet children({ selected })}
										<div
											class="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-xs text-base-content data-highlighted:bg-base-300 {selected
												? 'font-medium text-accent'
												: ''}"
										>
											<span class="truncate">{p.label}</span>
											{#if selected}
												<Check class="size-3 shrink-0" />
											{/if}
										</div>
									{/snippet}
								</Combobox.Item>
							{/each}
						</Combobox.Group>
					{/if}
					{#if filtered.builtin.length === 0 && filtered.device.length === 0}
						<div class="px-2 py-2 text-center text-xs text-base-content/50">
							{m.eq_constraint_no_results()}
						</div>
					{/if}
				</Combobox.Viewport>
			</Combobox.Content>
		</Combobox.Portal>
	</Combobox.Root>
</label>
