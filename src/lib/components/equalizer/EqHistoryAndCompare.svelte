<script module lang="ts">
	const listClass =
		'flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded border border-base-content/20';
	const rowClass =
		'flex items-center gap-1.5 border-b border-base-content/20 px-1.5 py-1 last:border-b-0 hover:bg-base-200';
</script>

<script lang="ts">
	import { tick, type Component } from 'svelte';
	import { DropdownMenu } from 'bits-ui';
	import { toast } from 'svelte-sonner';
	import { Ellipsis, Pencil, Star, Trash2 } from '@lucide/svelte';
	import {
		bandSummary,
		eqHistoryStore,
		snapshotMatches,
		type EqSnapshot
	} from '$lib/stores/eq-history-store.svelte.js';
	import {
		BOOKMARK_CAP,
		currentEqDevice,
		eqBookmarkStore,
		sortBookmarks,
		type EqBookmark,
		type EqBookmarkDevice
	} from '$lib/stores/eq-bookmark-store.svelte.js';
	import { eqStore } from '$lib/stores/eq-store.svelte.js';
	import { eqCommands } from '$lib/services/eq-commands.js';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import Button from '../atoms/Button.svelte';
	import Input from '../atoms/Input.svelte';
	import InfoPopover from '../atoms/InfoPopover.svelte';
	import Tabs from '../atoms/Tabs.svelte';

	type ListTab = 'history' | 'bookmarks';
	type MenuItem = {
		label: string;
		icon: Component<{ class?: string }>;
		onSelect: () => void;
		destructive?: boolean;
	};

	// Which list is showing. Component state is enough: losing it on a panel
	// switch just reopens History.
	let tab = $state<ListTab>('history');

	function timeStr(ts: number): string {
		const d = new Date(ts);
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
			2,
			'0'
		)}:${String(d.getSeconds()).padStart(2, '0')}`;
	}

	function dateStr(ts: number): string {
		return new Intl.DateTimeFormat(getLocale(), { month: 'short', day: 'numeric' }).format(ts);
	}

	function deviceLabel(device: EqBookmarkDevice): string {
		return device.variant ? `${device.identifier} ${device.variant}` : device.identifier;
	}

	const aEntry = $derived(eqHistoryStore.aEntry);
	const bEntry = $derived(eqHistoryStore.bEntry);
	const aActive = $derived(
		aEntry !== null && snapshotMatches(aEntry, eqStore.filters, eqStore.preamp)
	);
	const bActive = $derived(
		bEntry !== null && snapshotMatches(bEntry, eqStore.filters, eqStore.preamp)
	);

	function isPicked(id: string): boolean {
		return eqHistoryStore.aSnapshotId === id || eqHistoryStore.bSnapshotId === id;
	}

	const history = $derived([...eqHistoryStore.snapshots].reverse());
	const bookmarks = $derived(sortBookmarks(eqBookmarkStore.items, currentEqDevice()));

	function applySide(side: 'a' | 'b') {
		const entry = side === 'a' ? aEntry : bEntry;
		if (!entry) return;
		eqCommands.applySnapshot(entry.filters, entry.preamp);
	}

	function bookmarkSnapshot(snap: EqSnapshot) {
		const added = eqBookmarkStore.add({
			name: `${bandSummary(snap.filters) || snap.summary} · ${dateStr(snap.timestamp)}`,
			filters: snap.filters,
			preamp: snap.preamp,
			device: currentEqDevice()
		});
		if (!added) toast.warning(m.eq_history_bookmark_full({ count: BOOKMARK_CAP }));
	}

	// ── Inline rename ────────────────────────────────────────────────────────

	let renamingId = $state<string | null>(null);
	let renameValue = $state('');

	function startRename(bookmark: EqBookmark) {
		renameValue = bookmark.name;
		renamingId = bookmark.id;
	}

	/** Save (or, with `save` false, drop) the edit and hand focus back to the row's menu. */
	async function endRename(save: boolean) {
		const id = renamingId;
		if (id === null) return;
		if (save) eqBookmarkStore.rename(id, renameValue);
		renamingId = null;
		await tick();
		document.querySelector<HTMLElement>(`[data-entry-menu="${id}"]`)?.focus();
	}

	function onRenameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			void endRename(true);
		} else if (e.key === 'Escape') {
			// Escape restores the previous name, like the number fields in EqFilterCard.
			e.preventDefault();
			e.stopPropagation();
			void endRename(false);
		}
	}

	/** Focus the rename field once it's in the DOM (the menu has just closed). */
	function focusOnMount(node: HTMLInputElement) {
		requestAnimationFrame(() => {
			node.focus();
			node.select();
		});
	}
</script>

{#snippet abButtons(id: string)}
	{@const isA = eqHistoryStore.aSnapshotId === id}
	{@const isB = eqHistoryStore.bSnapshotId === id}
	<Button
		title={isA ? m.eq_history_unset_a() : m.eq_history_set_a()}
		onclick={() => eqHistoryStore.setA(isA ? null : id)}
		variant={isA ? 'accent' : 'muted'}
		size="sm"
	>
		A
	</Button>
	<Button
		title={isB ? m.eq_history_unset_b() : m.eq_history_set_b()}
		onclick={() => eqHistoryStore.setB(isB ? null : id)}
		variant={isB ? 'accent' : 'muted'}
		size="sm"
	>
		B
	</Button>
{/snippet}

{#snippet entryMenu(id: string, name: string, items: MenuItem[])}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					data-entry-menu={id}
					title={m.eq_history_menu_title({ name })}
					variant="ghost"
					size="icon-xs"
				>
					<Ellipsis class="size-4" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Portal>
			<DropdownMenu.Content
				align="end"
				sideOffset={4}
				class="z-50 min-w-36 rounded-lg border border-base-content/15 bg-base-200 p-1 text-xs shadow-xl"
				onCloseAutoFocus={(e) => {
					// Rename moves focus into its own field.
					if (renamingId === id) e.preventDefault();
				}}
			>
				{#each items as item (item.label)}
					<DropdownMenu.Item
						onSelect={item.onSelect}
						class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-hidden transition-colors data-highlighted:bg-base-content/10 {item.destructive
							? 'text-error'
							: 'text-base-content'}"
					>
						<item.icon class="size-3.5" />
						{item.label}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	</DropdownMenu.Root>
{/snippet}

<div class="flex flex-col gap-2 text-sm">
	<!-- A / B switcher header — works across both lists -->
	<div class="flex items-center gap-1">
		<span class="mr-1 text-xs text-base-content/60">{m.eq_history_compare_label()}</span>
		<div class="flex flex-1 gap-1">
			<Button
				title={aEntry ? m.eq_history_apply_a_title() : m.eq_history_pick_a_first()}
				onclick={() => applySide('a')}
				variant={aActive ? 'primary' : 'outline'}
				size="sm"
				disabled={aEntry === null}
				class="flex-1"
			>
				A
			</Button>
			<Button
				title={bEntry ? m.eq_history_apply_b_title() : m.eq_history_pick_b_first()}
				onclick={() => applySide('b')}
				variant={bActive ? 'primary' : 'outline'}
				size="sm"
				disabled={bEntry === null}
				class="flex-1"
			>
				B
			</Button>
		</div>
		<InfoPopover label={m.info_popover_about({ topic: m.eq_history_accordion_title() })} size="sm">
			<p>{m.eq_history_help_text()}</p>
		</InfoPopover>
		<!-- Clears History only; bookmarks are deleted one at a time. -->
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

	<Tabs
		bind:value={tab}
		label={m.eq_history_tabs_label()}
		items={[
			{ value: 'history', label: m.eq_history_tab_history() },
			{
				value: 'bookmarks',
				label: m.eq_history_tab_bookmarks({ count: eqBookmarkStore.items.length })
			}
		]}
	>
		{#snippet panel(value)}
			{#if value === 'history'}
				{@render historyList()}
			{:else}
				{@render bookmarkList()}
			{/if}
		{/snippet}
	</Tabs>
</div>

{#snippet historyList()}
	{#if history.length === 0}
		{@render empty(m.eq_history_empty())}
	{:else}
		<ul class={listClass}>
			{#each history as snap (snap.id)}
				{@const saved = eqBookmarkStore.findMatch(snap.filters, snap.preamp) !== null}
				<li class="{rowClass} {isPicked(snap.id) ? 'bg-base-200' : ''}">
					<!-- Only adds: removing a bookmark is done in its own tab, so a stray
					     click here can't lose a name. -->
					<Button
						title={saved ? m.eq_history_bookmark_exists() : m.eq_history_bookmark_add()}
						onclick={() => {
							if (!saved) bookmarkSnapshot(snap);
						}}
						aria-disabled={saved || undefined}
						variant="ghost"
						size="icon-xs"
						class={saved ? 'cursor-default hover:bg-inherit' : ''}
					>
						<Star class="size-3.5 {saved ? 'fill-current text-accent' : 'text-base-content/50'}" />
					</Button>
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate text-xs text-base-content">{snap.summary}</span>
						<span class="text-[10px] text-base-content/50 tabular-nums">
							{timeStr(snap.timestamp)}
						</span>
					</div>
					{@render abButtons(snap.id)}
					{@render entryMenu(snap.id, snap.summary, [
						{
							label: m.eq_history_menu_delete(),
							icon: Trash2,
							onSelect: () => eqHistoryStore.remove(snap.id),
							destructive: true
						}
					])}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet bookmarkList()}
	{#if bookmarks.length === 0}
		{@render empty(m.eq_history_bookmarks_empty())}
	{:else}
		<ul class={listClass}>
			{#each bookmarks as bookmark (bookmark.id)}
				<li class="{rowClass} {isPicked(bookmark.id) ? 'bg-base-200' : ''}">
					<div class="flex min-w-0 flex-1 flex-col">
						{#if renamingId === bookmark.id}
							<Input
								bind:value={renameValue}
								aria-label={m.eq_history_rename_label()}
								onkeydown={onRenameKeydown}
								onblur={() => endRename(true)}
								{@attach focusOnMount}
							/>
						{:else}
							<span class="truncate text-xs text-base-content">{bookmark.name}</span>
						{/if}
						<span class="truncate text-[10px] text-base-content/50">
							{bookmark.device
								? `${deviceLabel(bookmark.device)} · ${dateStr(bookmark.createdAt)}`
								: dateStr(bookmark.createdAt)}
						</span>
					</div>
					{@render abButtons(bookmark.id)}
					{@render entryMenu(bookmark.id, bookmark.name, [
						{
							label: m.eq_history_menu_rename(),
							icon: Pencil,
							onSelect: () => startRename(bookmark)
						},
						{
							label: m.eq_history_menu_delete(),
							icon: Trash2,
							onSelect: () => eqBookmarkStore.remove(bookmark.id),
							destructive: true
						}
					])}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet empty(text: string)}
	<div class="rounded border border-dashed border-base-content/15 p-3 text-center">
		<p class="text-xs text-base-content/60">{text}</p>
	</div>
{/snippet}
