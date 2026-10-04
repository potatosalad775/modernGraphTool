<script lang="ts">
	import { eqConstraintsStore } from '$lib/stores/eq-constraints-store.svelte.js';
	import { eqCommands } from '$lib/services/eq-commands.js';
	import * as m from '$lib/paraglide/messages.js';
	import type { IndexEntry } from '@potatosalad775/eqcaps-core';
	import type { EqConstraintPreset } from '$lib/types/eq-constraint.js';
	import { Check, Settings2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import Button from '../atoms/Button.svelte';
	import PopoverPanel from '../atoms/PopoverPanel.svelte';

	// Unique per component instance so the group headings can label their groups.
	const uid = $props.id();

	let open = $state(false);
	let query = $state('');
	/** The eqcaps index, once loaded; null until then or when it can't be reached. */
	let catalog = $state.raw<IndexEntry[] | null>(null);
	let catalogState = $state<'idle' | 'loading' | 'ready' | 'failed'>('idle');
	/** Catalog entry being fetched — its row shows a spinner-free "Loading…" label. */
	let pendingId = $state<string | null>(null);

	// The search box only makes sense while the panel is open; reset it on close
	// so the next open starts from the full list.
	$effect(() => {
		if (!open) query = '';
	});

	// The database is only fetched once someone opens the picker. The client
	// caches the index for a day, so reopening is free.
	$effect(() => {
		if (open && catalogState === 'idle') void loadCatalog();
	});

	async function loadCatalog() {
		catalogState = 'loading';
		const { eqcapsClient } = await import('$lib/services/eqcaps-client.js');
		const index = await eqcapsClient().loadIndex();
		catalog = index
			? index.profiles
					.filter((e) => e.status !== 'deprecated')
					.sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`))
			: null;
		catalogState = index ? 'ready' : 'failed';
	}

	type Row =
		{ kind: 'preset'; preset: EqConstraintPreset } | { kind: 'catalog'; entry: IndexEntry };

	function entryLabel(e: IndexEntry): string {
		const name = `${e.brand} ${e.model}`;
		return e.engine ? `${name} · ${e.engine}` : name;
	}

	function matchesQuery(text: string[], q: string): boolean {
		return !q || text.some((t) => t.toLowerCase().includes(q));
	}

	const groups = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const presets = eqConstraintsStore.presets.filter((p) => matchesQuery([p.label, p.id], q));
		const presetIds = new Set(eqConstraintsStore.presets.map((p) => p.id));
		const fromCatalog = (catalog ?? []).filter(
			(e) =>
				!presetIds.has(`eqcaps:${e.id}`) &&
				matchesQuery([entryLabel(e), e.id, ...(e.aliases ?? [])], q)
		);
		const rows = (items: EqConstraintPreset[]): Row[] =>
			items.map((preset) => ({ kind: 'preset', preset }));
		const entries = (items: IndexEntry[]): Row[] =>
			items.map((entry) => ({ kind: 'catalog', entry }));
		return [
			{
				id: `${uid}-builtin`,
				heading: m.eq_constraint_group_builtin(),
				rows: rows(presets.filter((p) => p.source === 'builtin'))
			},
			{
				id: `${uid}-device`,
				heading: m.eq_constraint_group_device(),
				rows: rows(presets.filter((p) => p.source === 'device'))
			},
			{
				id: `${uid}-recent`,
				heading: m.eq_constraint_group_recent(),
				rows: rows(presets.filter((p) => p.source === 'catalog'))
			},
			{
				id: `${uid}-software`,
				heading: m.eq_constraint_group_software(),
				rows: entries(fromCatalog.filter((e) => e.kind === 'software'))
			},
			{
				id: `${uid}-hardware`,
				heading: m.eq_constraint_group_hardware(),
				rows: entries(fromCatalog.filter((e) => e.kind === 'hardware'))
			}
		];
	});

	const isEmpty = $derived(groups.every((g) => g.rows.length === 0));

	function selectPreset(id: string) {
		open = false;
		if (!id || id === eqConstraintsStore.activeId) return;
		eqConstraintsStore.setActive(id);
		eqCommands.reclampToActiveConstraint();
	}

	async function selectEntry(entry: IndexEntry) {
		if (pendingId) return;
		pendingId = entry.id;
		const { eqcapsClient } = await import('$lib/services/eqcaps-client.js');
		const profile = await eqcapsClient().loadProfile(entry.id);
		pendingId = null;
		if (!profile) {
			toast.error(m.eq_constraint_load_failed({ label: entryLabel(entry) }));
			return;
		}
		open = false;
		eqConstraintsStore.addCatalogProfile(profile);
		eqCommands.reclampToActiveConstraint();
	}

	const rowClass =
		'flex w-full cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs text-base-content hover:bg-base-300 focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none';
</script>

<PopoverPanel bind:open contentClass="w-72 p-2">
	{#snippet trigger({ props })}
		<Button
			{...props}
			title={m.eq_constraint_select_title()}
			variant="outline"
			size="icon"
			class="size-6 p-px {eqConstraintsStore.isLimiting ? 'border-accent text-accent' : ''}"
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
				{eqConstraintsStore.active.label}
			</span>
		</div>

		<input
			type="search"
			bind:value={query}
			placeholder={m.eq_constraint_search_placeholder()}
			aria-label={m.eq_constraint_search_placeholder()}
			class="w-full rounded border border-base-content/20 bg-base-100 px-2 py-1 text-xs outline-none placeholder:text-base-content/40 focus:ring-1 focus:ring-accent"
		/>

		<div class="max-h-72 overflow-y-auto">
			{#each groups as group (group.id)}
				{#if group.rows.length > 0}
					<div role="group" aria-labelledby="{group.id}-heading">
						<div
							id="{group.id}-heading"
							class="px-2 py-1 text-[10px] font-semibold tracking-wider text-base-content/50 uppercase"
						>
							{group.heading}
						</div>
						{#each group.rows as row (row.kind === 'preset' ? row.preset.id : row.entry.id)}
							{#if row.kind === 'preset'}
								{@const selected = row.preset.id === eqConstraintsStore.activeId}
								<button
									type="button"
									aria-pressed={selected}
									onclick={() => selectPreset(row.preset.id)}
									class="{rowClass} {selected ? 'font-medium text-accent' : ''}"
								>
									<span class="truncate">{row.preset.label}</span>
									{#if selected}
										<Check class="size-3 shrink-0" />
									{/if}
								</button>
							{:else}
								<button
									type="button"
									aria-pressed={false}
									aria-busy={pendingId === row.entry.id}
									disabled={pendingId !== null}
									onclick={() => selectEntry(row.entry)}
									class={rowClass}
								>
									<span class="truncate">{entryLabel(row.entry)}</span>
									{#if pendingId === row.entry.id}
										<span class="shrink-0 text-[10px] text-base-content/50">
											{m.eq_constraint_loading()}
										</span>
									{:else if row.entry.status === 'draft'}
										<span
											class="shrink-0 rounded border border-base-content/20 px-1 text-[10px] text-base-content/50"
											title={m.eq_constraint_draft_title()}
										>
											{m.eq_constraint_draft()}
										</span>
									{/if}
								</button>
							{/if}
						{/each}
					</div>
				{/if}
			{/each}
			{#if catalogState === 'loading'}
				<div class="px-2 py-2 text-center text-xs text-base-content/50">
					{m.eq_constraint_catalog_loading()}
				</div>
			{:else if catalogState === 'failed'}
				<div class="px-2 py-2 text-center text-xs text-base-content/50">
					{m.eq_constraint_catalog_failed()}
				</div>
			{:else if isEmpty}
				<div class="px-2 py-2 text-center text-xs text-base-content/50">
					{m.eq_constraint_no_results()}
				</div>
			{/if}
		</div>
	</div>
</PopoverPanel>
