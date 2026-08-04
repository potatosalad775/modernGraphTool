<script lang="ts">
	import { eqHistoryStore, snapshotMatches } from '$lib/stores/eq-history-store.svelte.js';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { eqCommands } from '$lib/services/eq-commands.js';
	import * as m from '$lib/paraglide/messages.js';
	import Button from '../atoms/Button.svelte';
	import { Info, Trash2 } from '@lucide/svelte';
	import PopoverPanel from '../atoms/PopoverPanel.svelte';

	function timeStr(ts: number): string {
		const d = new Date(ts);
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
			2,
			'0'
		)}:${String(d.getSeconds()).padStart(2, '0')}`;
	}

	const aSnap = $derived(
		eqHistoryStore.aSnapshotId
			? (eqHistoryStore.snapshots.find((s) => s.id === eqHistoryStore.aSnapshotId) ?? null)
			: null
	);
	const bSnap = $derived(
		eqHistoryStore.bSnapshotId
			? (eqHistoryStore.snapshots.find((s) => s.id === eqHistoryStore.bSnapshotId) ?? null)
			: null
	);
	const aActive = $derived(
		aSnap !== null && snapshotMatches(aSnap, eqStore.filters, eqStore.preamp)
	);
	const bActive = $derived(
		bSnap !== null && snapshotMatches(bSnap, eqStore.filters, eqStore.preamp)
	);

	function applySide(side: 'a' | 'b') {
		const snap = side === 'a' ? aSnap : bSnap;
		if (!snap) return;
		eqCommands.applySnapshot(snap.filters, snap.preamp);
	}
</script>

<div class="flex flex-col gap-2 text-sm">
	<!-- A / B switcher header -->
	<div class="flex items-center gap-1">
		<span class="mr-1 text-xs text-base-content/60">{m.eq_history_compare_label()}</span>
		<div class="flex flex-1 gap-1">
			<Button
				title={aSnap ? m.eq_history_apply_a_title() : m.eq_history_pick_a_first()}
				onclick={() => applySide('a')}
				variant={aActive ? 'primary' : 'outline'}
				size="sm"
				disabled={aSnap === null}
				class="flex-1"
			>
				A
			</Button>
			<Button
				title={bSnap ? m.eq_history_apply_b_title() : m.eq_history_pick_b_first()}
				onclick={() => applySide('b')}
				variant={bActive ? 'primary' : 'outline'}
				size="sm"
				disabled={bSnap === null}
				class="flex-1"
			>
				B
			</Button>
		</div>
		<PopoverPanel>
			{#snippet trigger({ props })}
				<Button
					{...props}
					title="Open 'Frequency range' option description"
					variant="ghost"
					size="icon-sm"
					activeOnOpen
					class="opacity-80 hover:opacity-100"
				>
					<Info class="size-4" />
				</Button>
			{/snippet}
			<p class="max-w-xs text-xs text-base-content">
				{m.eq_history_help_text()}
			</p>
		</PopoverPanel>
		<Button
			title={m.eq_history_clear()}
			onclick={() => eqHistoryStore.clear()}
			variant="destructive"
			size="icon-sm"
			disabled={eqHistoryStore.snapshots.length === 0}
		>
			<Trash2 class="size-4" />
		</Button>
	</div>

	<!-- Snapshot list (newest first) -->
	{#if eqHistoryStore.snapshots.length === 0}
		<div class="rounded border border-dashed border-base-content/15 p-3 text-center">
			<p class="text-xs text-base-content/60">{m.eq_history_empty()}</p>
		</div>
	{:else}
		<ul
			class="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded border border-base-content/20"
		>
			{#each [...eqHistoryStore.snapshots].reverse() as snap (snap.id)}
				{@const isA = eqHistoryStore.aSnapshotId === snap.id}
				{@const isB = eqHistoryStore.bSnapshotId === snap.id}
				<li
					class="flex items-center gap-1.5 border-b border-base-content/20 px-1.5 py-1 last:border-b-0 hover:bg-base-200 {isA ||
					isB
						? 'bg-base-200'
						: ''}"
				>
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate text-xs text-base-content">{snap.summary}</span>
						<span class="text-[10px] text-base-content/50 tabular-nums">
							{timeStr(snap.timestamp)}
						</span>
					</div>
					<Button
						title={isA ? m.eq_history_unset_a() : m.eq_history_set_a()}
						onclick={() => eqHistoryStore.setA(isA ? null : snap.id)}
						variant={isA ? 'accent' : 'muted'}
						size="sm"
					>
						A
					</Button>
					<Button
						title={isB ? m.eq_history_unset_b() : m.eq_history_set_b()}
						onclick={() => eqHistoryStore.setB(isB ? null : snap.id)}
						variant={isB ? 'accent' : 'muted'}
						size="sm"
					>
						B
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
