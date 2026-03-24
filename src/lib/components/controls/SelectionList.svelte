<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { frStore } from '$lib/stores/fr-store.svelte.js';
	import { graphStore } from '$lib/stores/graph-store.svelte.js';
	import { dataProvider } from '$lib/services/data-provider.svelte.js';
	import { graphEngine } from '$lib/graph/GraphEngine.svelte.js';
	import type { FRDataObject } from '$lib/types/data-types.js';
	import GraphColorWheel from '$lib/components/features/GraphColorWheel.svelte';
	import TargetCustomizer from '$lib/components/features/TargetCustomizer.svelte';

	// ── Derived: sorted entries ──────────────────────────────────────────────────
	// Targets always first, phones/others after.
	const sortedEntries = $derived.by((): [string, FRDataObject][] => {
		const _size = frStore.size; // subscribe to size changes
		const entries = [...frStore.entries.entries()];
		return entries.sort(([, a], [, b]) => {
			if (a.type === 'target' && b.type !== 'target') return -1;
			if (b.type === 'target' && a.type !== 'target') return 1;
			return 0;
		});
	});

	// ── Per-item state (keyed by uuid) ──────────────────────────────────────────
	// Variant dropdowns open state
	let openVariantUUID = $state<string | null>(null);

	// ── Channel helpers ──────────────────────────────────────────────────────────
	type ChannelOption = { value: string; label: string };

	function getChannelOptions(item: FRDataObject): ChannelOption[] {
		const keys = Object.keys(item.channels) as ('L' | 'R' | 'AVG')[];
		const opts: ChannelOption[] = [];
		const hasL = keys.includes('L');
		const hasR = keys.includes('R');
		const hasAVG = keys.includes('AVG');
		if (hasL) opts.push({ value: 'L', label: m.selection_list_channel_left() });
		if (hasR) opts.push({ value: 'R', label: m.selection_list_channel_right() });
		if (hasL && hasR) opts.push({ value: 'L+R', label: m.selection_list_channel_left_and_right() });
		if (hasAVG) opts.push({ value: 'AVG', label: m.selection_list_channel_average() });
		return opts;
	}

	function dispChannelToSelectValue(dispChannel: ('L' | 'R' | 'AVG')[]): string {
		if (dispChannel.includes('L') && dispChannel.includes('R')) return 'L+R';
		return dispChannel[0] ?? 'AVG';
	}

	function selectValueToDispChannel(value: string): ('L' | 'R' | 'AVG')[] {
		if (value === 'L+R') return ['L', 'R'];
		return [value as 'L' | 'R' | 'AVG'];
	}

	function handleChannelChange(uuid: string, value: string) {
		dataProvider.updateDisplayChannel(uuid, selectValueToDispChannel(value));
	}

	// ── Y-offset long-press ──────────────────────────────────────────────────────
	interface LongPressHandlers {
		onmousedown: () => void;
		onmouseup: () => void;
		onmouseleave: () => void;
	}

	function createLongPressHandlers(action: 'inc' | 'dec', uuid: string): LongPressHandlers {
		let timer: ReturnType<typeof setInterval> | null = null;

		function perform() {
			const item = frStore.get(uuid);
			if (!item) return;
			const current = item.yOffset ?? 0;
			const next = action === 'inc' ? current + 1 : current - 1;
			dataProvider.updateYOffset(uuid, next);
		}

		function start() {
			perform();
			timer = setInterval(perform, 150);
		}

		function stop() {
			if (timer !== null) {
				clearInterval(timer);
				timer = null;
			}
		}

		return {
			onmousedown: start,
			onmouseup: stop,
			onmouseleave: stop
		};
	}

	function handleYOffsetInput(uuid: string, raw: string) {
		const val = parseFloat(raw);
		if (!isNaN(val)) dataProvider.updateYOffset(uuid, val);
	}

	// ── Baseline ────────────────────────────────────────────────────────────────
	function handleBaselineClick(uuid: string) {
		const isActive = graphStore.baselineUUID === uuid;
		graphEngine.updateBaselineData(!isActive, { uuid });
		graphStore.baselineUUID = isActive ? null : uuid;
	}

	// ── Variant dropdown ────────────────────────────────────────────────────────
	function toggleVariantDropdown(uuid: string) {
		openVariantUUID = openVariantUUID === uuid ? null : uuid;
	}

	async function handleVariantSelect(uuid: string, suffix: string) {
		openVariantUUID = null;
		try {
			await dataProvider.updateVariant(uuid, suffix);
		} catch (e) {
			console.error(e);
		}
	}

	// ── Type guard ───────────────────────────────────────────────────────────────
	function isTarget(item: FRDataObject): boolean {
		return item.type === 'target' || item.type === 'inserted-target';
	}
</script>

<div class="flex flex-col gap-0 overflow-y-auto">
	{#if sortedEntries.length === 0}
		<p class="px-3 py-6 text-center text-xs text-zinc-400 dark:text-zinc-600">No curves loaded.</p>
	{/if}

	{#each sortedEntries as [uuid, item] (uuid)}
		{@const isBaseline = graphStore.baselineUUID === uuid}
		{@const channelOpts = getChannelOptions(item)}
		{@const currentChannelVal = dispChannelToSelectValue(item.dispChannel)}
		{@const hasVariants = !isTarget(item) && (item.meta as { files?: unknown[] } | undefined)?.files && ((item.meta as { files: unknown[] }).files.length > 1)}
		{@const incHandlers = createLongPressHandlers('inc', uuid)}
		{@const decHandlers = createLongPressHandlers('dec', uuid)}

		<div
			class="flex flex-col border-b border-zinc-100 px-3 py-2 dark:border-zinc-800
				{item.hidden ? 'opacity-50' : ''}"
		>
			<!-- Row 1: color swatch + name + action buttons -->
			<div class="flex items-center gap-2">
				<!-- Color swatch / picker -->
				<GraphColorWheel {uuid} {item} />

				<!-- Name + suffix -->
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
						{item.identifier}
					</span>
					{#if item.dispSuffix}
						<span class="truncate text-xs text-zinc-500 dark:text-zinc-400">{item.dispSuffix}</span>
					{/if}
				</div>

				<!-- Variant selector -->
				{#if hasVariants}
					<div class="relative">
						<button
							onclick={() => toggleVariantDropdown(uuid)}
							title="Switch variant"
							class="flex h-6 w-6 items-center justify-center rounded text-xs font-bold
								text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900
								dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
						>
							+
						</button>

						{#if openVariantUUID === uuid}
							<div
								class="absolute right-0 top-7 z-10 min-w-max rounded-md border border-zinc-200
									bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
							>
								{#each (item.meta as { files: { suffix: string }[] }).files as variant (variant.suffix)}
									<button
										onclick={() => handleVariantSelect(uuid, variant.suffix)}
										class="block w-full px-3 py-1.5 text-left text-xs text-zinc-700
											hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800
											{item.dispSuffix === variant.suffix ? 'font-semibold' : ''}"
									>
										{variant.suffix || '(default)'}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Baseline button -->
				<button
					onclick={() => handleBaselineClick(uuid)}
					title="Set as baseline"
					class="flex h-6 w-6 items-center justify-center rounded text-sm transition-colors
						{isBaseline
						? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
						: 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300'}"
				>
					~
				</button>

				<!-- Visibility toggle -->
				<button
					onclick={() => dataProvider.updateVisibility(uuid, !item.hidden)}
					title={item.hidden ? 'Show' : 'Hide'}
					class="flex h-6 w-6 items-center justify-center rounded text-sm transition-colors
						text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700
						dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
				>
					{item.hidden ? '🙈' : '👁'}
				</button>

				<!-- Delete button -->
				<button
					onclick={() => dataProvider.removeFRDataWithUUID(item.type, uuid)}
					title="Remove"
					class="flex h-6 w-6 items-center justify-center rounded text-sm text-zinc-400
						transition-colors hover:bg-red-100 hover:text-red-600
						dark:hover:bg-red-900/30 dark:hover:text-red-400"
				>
					✕
				</button>
			</div>

			<!-- Row 2: channel select + y-offset controls -->
			<div class="mt-1.5 flex items-center gap-2 pl-6">
				<!-- Channel select (not for targets) -->
				{#if !isTarget(item) && channelOpts.length > 0}
					<select
						value={currentChannelVal}
						onchange={(e) => handleChannelChange(uuid, e.currentTarget.value)}
						class="h-6 rounded border border-zinc-200 bg-white px-1 text-xs text-zinc-700
							focus:outline-none focus:ring-1 focus:ring-zinc-400
							dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
					>
						{#each channelOpts as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				{/if}

				<!-- Y-offset controls -->
				<div class="ml-auto flex items-center gap-1">
					<button
						onmousedown={decHandlers.onmousedown}
						onmouseup={decHandlers.onmouseup}
						onmouseleave={decHandlers.onmouseleave}
						class="flex h-6 w-6 items-center justify-center rounded border border-zinc-200
							text-xs text-zinc-500 hover:bg-zinc-100
							dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
					>
						−
					</button>

					<input
						type="number"
						value={item.yOffset ?? 0}
						oninput={(e) => handleYOffsetInput(uuid, e.currentTarget.value)}
						class="h-6 w-12 rounded border border-zinc-200 bg-white text-center text-xs
							text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400
							dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
					/>

					<button
						onmousedown={incHandlers.onmousedown}
						onmouseup={incHandlers.onmouseup}
						onmouseleave={incHandlers.onmouseleave}
						class="flex h-6 w-6 items-center justify-center rounded border border-zinc-200
							text-xs text-zinc-500 hover:bg-zinc-100
							dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
					>
						+
					</button>
				</div>
			</div>

			<!-- Row 3: Target Customizer (for target items only) -->
			{#if isTarget(item)}
				<TargetCustomizer {uuid} {item} />
			{/if}
		</div>
	{/each}
</div>
